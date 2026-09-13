// Command quorly runs the API server and the payout worker pool in one process.
//
// One binary on purpose: the queue is in Postgres, so a separate worker
// deployment buys nothing at this scale and costs an extra thing to operate.
// Splitting them later is a flag, not a rewrite.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Nishu0/quorly/server/internal/ai"
	"github.com/Nishu0/quorly/server/internal/api"
	"github.com/Nishu0/quorly/server/internal/auth"
	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/privy"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/service"
	"github.com/Nishu0/quorly/server/internal/slackapp"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/Nishu0/quorly/server/internal/worker"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "apply migrations and exit")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(log, *migrateOnly); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, migrateOnly bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// The first signal drains; a second kills, so an operator is never stuck
	// waiting on a slow job.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := db.Migrate(ctx); err != nil {
		return err
	}
	log.Info("migrations applied")
	if migrateOnly {
		return nil
	}

	q := queue.New(db.Pool())
	privyClient := privy.New(cfg.Privy.AppID, cfg.Privy.AppSecret, cfg.Privy.BaseURL, cfg.Privy.AuthKeys)
	world := worldid.New(cfg.World.BaseURL, cfg.World.RPID, cfg.World.Environment, cfg.Demo())

	svc := &service.Service{DB: db, World: world, Queue: q, WorldAction: cfg.World.Action}

	// Signing is optional: without it the app still runs, the Selfie Check
	// checkpoint just falls back to demo mode instead of failing to boot.
	signer, err := worldid.NewSigner(cfg.World.SigningKey, cfg.World.RPID)
	if err != nil {
		log.Warn("world signing disabled", "reason", err)
		signer = nil
	}

	verifier, err := auth.NewVerifier(ctx, cfg.Privy.AppID)
	if err != nil {
		return err
	}

	slackApp := &slackapp.App{
		DB: db, Svc: svc, Log: log,
		AI:            ai.New(os.Getenv("ANTHROPIC_API_KEY"), os.Getenv("ANTHROPIC_MODEL")),
		AppURL:        cfg.AppURL,
		Explorer:      "https://sepolia.basescan.org",
		SigningSecret: cfg.Slack.SigningSecret,
		DevBotToken:   cfg.Slack.BotToken,
	}

	host, _ := os.Hostname()
	pool := worker.NewPool(q, log, host+"-"+time.Now().Format("150405"))
	(&service.Payouts{
		Service: svc, Privy: privyClient, Log: log,
		ChainID: cfg.Chain.ID, AssetAddress: cfg.Chain.SettlementToken,
		PrivyChain: cfg.Chain.PrivyChain, Demo: cfg.Demo(),
		// Telling people is part of settling, but a Slack outage must not fail
		// a payout that already landed onchain.
		OnPaid: func(ctx context.Context, inv domain.Invoice) {
			if err := slackApp.NotifyPaid(ctx, inv); err != nil {
				log.Warn("could not announce payment", "err", err, "invoice", inv.ID)
			}
		},
		// Returns its error, unlike OnPaid: an unsent approval card is the
		// whole prompt, so the queue should retry rather than shrug.
		OnFiled: func(ctx context.Context, inv domain.Invoice, d policy.Decision) error {
			return slackApp.FanOut(ctx, inv, d)
		},
	}).Register(pool)
	go pool.Run(ctx)

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: (&api.Server{
			Cfg: cfg, DB: db, Svc: svc, Privy: privyClient,
			Wallets: &service.Wallets{DB: db, Privy: privyClient, Log: log},
			Queue: q, Verifier: verifier, Signer: signer, Log: log,
			Slack: slackApp,
		}).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("listening", "addr", cfg.Addr, "demo", cfg.Demo(), "world_signing", signer != nil)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("draining")

	// Give in-flight requests a moment; the worker pool drains on its own ctx.
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
