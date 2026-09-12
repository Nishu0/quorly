// Command quorlyctl is the operator CLI: seed a demo org, file a test invoice,
// inspect the roster and the queue.
//
//	quorlyctl seed                 provision the demo org (idempotent)
//	quorlyctl invoice [amount]     file an invoice and print the approval link
//	quorlyctl roster               who's on the roster and what they can do
//	quorlyctl queue                pending, claimed, dead
//	quorlyctl worldcheck           prove the World signing key works
package main

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/money"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/service"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

const demoOrg = "org_demo_acme"

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: quorlyctl <seed|invoice|roster|queue|worldcheck>")
		os.Exit(2)
	}

	cfg, err := config.Load()
	if err != nil {
		fail(err)
	}

	ctx := context.Background()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		fail(err)
	}
	defer db.Close()

	switch os.Args[1] {
	case "seed":
		seed(ctx, db)
	case "invoice":
		amount := 2400.0
		if len(os.Args) > 2 {
			if v, err := strconv.ParseFloat(os.Args[2], 64); err == nil {
				amount = v
			}
		}
		invoice(ctx, cfg, db, amount)
	case "roster":
		roster(ctx, db)
	case "queue":
		stats, err := queue.New(db.Pool()).Stats(ctx)
		if err != nil {
			fail(err)
		}
		fmt.Printf("pending=%d claimed=%d dead=%d done=%d\n",
			stats.Pending, stats.Claimed, stats.Dead, stats.Done)
	case "worldcheck":
		worldcheck(cfg)
	default:
		fmt.Println("unknown command:", os.Args[1])
		os.Exit(2)
	}
}

// seed provisions the demo org. Idempotent, so it doubles as "link my Slack id"
// — set SEED_SLACK_* and re-run.
func seed(ctx context.Context, db *store.Store) {
	people := []struct {
		key, email, name string
		role             domain.Role
		ens              string
	}{
		{"owner", envOr("SEED_EMAIL_OWNER", "dana@acme.test"), "Dana (CFO)", domain.RoleOwner, "dana.acmelabs.eth"},
		{"approver", envOr("SEED_EMAIL_APPROVER", "mel@acme.test"), "Mel (Eng Manager)", domain.RoleApprover, "mel.acmelabs.eth"},
		{"contractor", envOr("SEED_EMAIL_CONTRACTOR", "priya@acme.test"), "Priya (Contractor)", domain.RoleMember, "priya.acmelabs.eth"},
	}

	err := db.Tx(ctx, func(tx pgx.Tx) error {
		ens := "acmelabs.eth"
		if err := db.CreateOrg(ctx, tx, domain.Org{ID: demoOrg, Name: "Acme Labs", ENSName: &ens}); err != nil {
			return err
		}

		for _, p := range people {
			name, sub := p.name, p.ens
			var slackID *string
			if v := os.Getenv("SEED_SLACK_" + upper(p.key)); v != "" {
				slackID = &v
			}
			if err := db.UpsertMember(ctx, tx, domain.Member{
				ID: "mem_demo_" + p.key, OrgID: demoOrg, Email: p.email,
				Name: &name, Role: p.role, ENSSubname: &sub, SlackUserID: slackID,
			}); err != nil {
				return err
			}
			link := "—"
			if slackID != nil {
				link = *slackID
			}
			fmt.Printf("  %-20s %-30s %-9s slack=%s\n", p.name, p.email, p.role, link)
		}

		existing, err := db.Policies(ctx, demoOrg)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			for _, tier := range policy.DefaultTiers() {
				tier.ID = ids.New("pol")
				tier.OrgID = demoOrg
				if err := db.CreatePolicy(ctx, tx, tier); err != nil {
					return err
				}
			}
			fmt.Println("  seeded 3 policy tiers")
		}
		return nil
	})
	if err != nil {
		fail(err)
	}
	fmt.Println("\nSeeded", demoOrg)
}

// invoice files one as the contractor, so the approver can act on it without
// tripping the self-approval block.
func invoice(ctx context.Context, cfg *config.Config, db *store.Store, amount float64) {
	svc := &service.Service{
		DB:          db,
		World:       worldid.New(cfg.World.BaseURL, cfg.World.RPID, cfg.World.Environment, cfg.Demo()),
		Queue:       queue.New(db.Pool()),
		WorldAction: cfg.World.Action,
	}

	desc := "Sprint 14 — contract engineering"
	number := "INV-" + ids.New("")[1:5]
	payee := "0x1111111111111111111111111111111111111111"
	ens := "priya.acmelabs.eth"

	inv, decision, err := svc.CreateInvoice(ctx, service.NewInvoice{
		OrgID: demoOrg, SubmitterID: "mem_demo_contractor",
		Amount: amount, Description: &desc, Number: &number,
		PayeeAddress: &payee, PayeeENS: &ens,
	})
	if err != nil {
		fail(err)
	}

	fmt.Printf("\nFiled %s for %s\n", inv.ID, money.USD(inv.Amount))
	fmt.Printf("Routing: %s\n\n", decision.Reason)

	if len(decision.EligibleApprovers) == 0 {
		fmt.Println("No eligible approvers — run `quorlyctl seed` first.")
		return
	}
	fmt.Println("Approve as:")
	for _, a := range decision.EligibleApprovers {
		fmt.Printf("  %s\n    %s/verify/%s\n", a.Display(), cfg.AppURL, inv.ID)
	}
	fmt.Printf("\nInvoice page: %s/invoices/%s\n", cfg.AppURL, inv.ID)
}

func roster(ctx context.Context, db *store.Store) {
	members, err := db.Members(ctx, demoOrg)
	if err != nil {
		fail(err)
	}
	for _, m := range members {
		privy, slack := "unclaimed", "not linked"
		if m.PrivyUserID != nil {
			privy = *m.PrivyUserID
		}
		if m.SlackUserID != nil {
			slack = *m.SlackUserID
		}
		fmt.Printf("%-20s %-30s %-9s privy=%-28s slack=%s\n",
			m.Display(), m.Email, m.Role, privy, slack)
	}
}

func worldcheck(cfg *config.Config) {
	s, err := worldid.NewSigner(cfg.World.SigningKey, cfg.World.RPID)
	if err != nil {
		fail(err)
	}
	ctx, err := s.Sign(cfg.World.Action, worldid.ChallengeTTL)
	if err != nil {
		fail(err)
	}
	fmt.Printf("rp_id=%s\nnonce=%s…\nttl=%ds\nsignature=%d chars\naction=%s\nenvironment=%s\n",
		ctx.RPID, ctx.Nonce[:20], ctx.ExpiresAt-ctx.CreatedAt,
		len(ctx.Signature), cfg.World.Action, cfg.World.Environment)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func upper(s string) string {
	out := []rune(s)
	for i, r := range out {
		if r >= 'a' && r <= 'z' {
			out[i] = r - 32
		}
	}
	return string(out)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
