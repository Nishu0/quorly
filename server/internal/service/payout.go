package service

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/money"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/privy"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/worker"
	"github.com/jackc/pgx/v5"
)

// Payouts owns the money path. It runs behind the queue, never in a request.
type Payouts struct {
	Service *Service
	Privy   *privy.Client
	Log     *slog.Logger

	ChainID      int
	AssetAddress string
	PrivyChain   string
	Demo    bool

	// OnPaid announces a settled invoice. Optional, and deliberately
	// best-effort: a Slack outage must not fail a payout that already landed.
	OnPaid func(ctx context.Context, inv domain.Invoice)

	// OnFiled tells the approvers a new invoice is waiting. Unlike OnPaid this
	// one runs through the queue, so a Slack outage retries rather than
	// silently losing the only prompt anyone gets.
	OnFiled func(ctx context.Context, inv domain.Invoice, d policy.Decision) error
}

func (p *Payouts) announce(ctx context.Context, inv domain.Invoice) {
	if p.OnPaid == nil {
		return
	}
	p.OnPaid(ctx, inv)
}

type payoutPayload struct {
	InvoiceID string `json:"invoiceId"`
}

// Register wires the handlers onto a pool.
func (p *Payouts) Register(pool *worker.Pool) {
	pool.Handle(queue.KindPayout, p.handlePayout)
	pool.Handle(queue.KindSlackNotify, p.handleNotify)
}

// handlePayout proposes the transfer to Privy.
//
// It does not wait for the quorum to sign. Signing is asynchronous by design —
// holding a worker open for it would tie up capacity for as long as a manager
// takes to get to their phone.
func (p *Payouts) handlePayout(ctx context.Context, j queue.Job) error {
	var payload payoutPayload
	if err := j.Unmarshal(&payload); err != nil {
		return fmt.Errorf("bad payload: %w", err)
	}

	inv, err := p.Service.DB.Invoice(ctx, payload.InvoiceID)
	if err != nil {
		return err
	}

	switch inv.Status {
	case domain.StatusPaid:
		return nil // already settled; nothing to do
	case domain.StatusApproved, domain.StatusScheduled, domain.StatusFailed:
		// go ahead
	default:
		// Rejected after approval, or otherwise moved on. Retrying will never
		// help, so complete the job rather than dead-lettering a non-problem.
		p.Log.Warn("payout skipped", "invoice", inv.ID, "status", inv.Status)
		return nil
	}

	if inv.PayeeAddress == nil || *inv.PayeeAddress == "" {
		return fmt.Errorf("invoice %s has no payee address", inv.ID)
	}

	org, err := p.Service.DB.Org(ctx, inv.OrgID)
	if err != nil {
		return err
	}
	if org.TreasuryWalletID == nil {
		return fmt.Errorf("org %s has no treasury wallet", org.ID)
	}

	if p.Demo {
		hash := "0xdemo" + ids.New("tx")
		if err := p.Service.DB.MarkInvoicePaid(ctx, inv.ID, hash); err != nil {
			return err
		}
		inv.TxHash = &hash
		p.announce(ctx, inv)
		return p.audit(ctx, inv, "invoice.paid", map[string]any{"demo": true, "txHash": hash})
	}

	base, err := money.ToBaseUnits(fmt.Sprintf("%.6f", inv.Amount))
	if err != nil {
		return err
	}

	// The idempotency key is the invoice, so a retried job cannot pay twice —
	// it is signed with the request, so it also cannot be stripped in transit.
	hash, err := p.Privy.SendTransaction(ctx, privy.SendParams{
		WalletID:       *org.TreasuryWalletID,
		CAIP2:          money.CAIP2(p.ChainID),
		To:             p.AssetAddress,
		Data:           privy.ERC20TransferData(*inv.PayeeAddress, base),
		IdempotencyKey: "payout:" + inv.ID,
	})
	if err != nil {
		return fmt.Errorf("send payout: %w", err)
	}

	if err := p.Service.DB.MarkInvoicePaid(ctx, inv.ID, hash); err != nil {
		return err
	}
	p.Log.Info("invoice settled", "invoice", inv.ID, "tx", hash)
	inv.TxHash = &hash
	p.announce(ctx, inv)
	return p.audit(ctx, inv, "invoice.paid", map[string]any{"txHash": hash})
}

// handleNotify posts the approval card to everyone who can act on it.
//
// Through the queue rather than inline, because this is the only prompt most
// approvers ever see: if Slack is down when the invoice is filed, a retry an
// hour later is the difference between a late approval and none at all.
func (p *Payouts) handleNotify(ctx context.Context, j queue.Job) error {
	if p.OnFiled == nil {
		return nil
	}
	var payload payoutPayload
	if err := j.Unmarshal(&payload); err != nil {
		return fmt.Errorf("bad payload: %w", err)
	}

	inv, err := p.Service.DB.Invoice(ctx, payload.InvoiceID)
	if err != nil {
		return err
	}
	// Nothing to chase once it has been decided.
	if inv.Status != domain.StatusPendingApproval {
		return nil
	}

	decision, err := p.Service.Route(ctx, inv)
	if err != nil {
		return err
	}
	return p.OnFiled(ctx, inv, decision)
}

func (p *Payouts) audit(ctx context.Context, inv domain.Invoice, event string, data any) error {
	return p.Service.DB.Tx(ctx, func(tx pgx.Tx) error {
		return p.Service.DB.Audit(ctx, tx, ids.New("aud"), inv.OrgID, nil,
			"invoice:"+inv.ID, event, data)
	})
}
