// Command quorly runs the API server and the payout worker pool.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/store"
)

func main() {
	migrateOnly := flag.Bool("migrate", false, "apply migrations and exit")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	// Shut down on the first signal; a second one kills immediately, so an
	// operator is never stuck waiting on a draining worker.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Migrate(ctx); err != nil {
		log.Error("migrate", "err", err)
		os.Exit(1)
	}
	log.Info("migrations applied")

	if *migrateOnly {
		return
	}

	log.Info("quorly server ready", "addr", cfg.Addr, "demo", cfg.Demo())
	<-ctx.Done()
	log.Info("shutting down")
}
