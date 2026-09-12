package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/money"
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

	ChainID int
	Asset   string
	Demo    bool
}

type payoutPayload struct {
	InvoiceID string `json:"invoiceId"`
}

// Register wires the handlers onto a pool.
func (p *Payouts) Register(pool *worker.Pool) {
	pool.Handle(queue.KindPayout, p.handlePayout)
	pool.Handle(queue.KindSettleWatch, p.handleSettleWatch)
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
		return p.audit(ctx, inv, "invoice.paid", map[string]any{"demo": true, "txHash": hash})
	}

	base, err := money.ToBaseUnits(fmt.Sprintf("%.6f", inv.Amount))
	if err != nil {
		return err
	}

	intent, err := p.Privy.CreateTransferIntent(ctx, privy.TransferParams{
		WalletID: *org.TreasuryWalletID,
		To:       *inv.PayeeAddress,
		Amount:   base.String(),
		Asset:    p.Asset,
		CAIP2:    money.CAIP2(p.ChainID),
		// Same key as the job, so a retried job reuses the intent rather than
		// proposing a second transfer.
		ExternalID: "payout:" + inv.ID,
	})
	if err != nil {
		return fmt.Errorf("create transfer intent: %w", err)
	}

	if err := p.Service.DB.SetInvoiceIntent(ctx, inv.ID, intent.ID); err != nil {
		return err
	}
	if err := p.audit(ctx, inv, "payout.intent_created", map[string]any{
		"intentId": intent.ID, "status": intent.Status,
	}); err != nil {
		return err
	}

	// Hand off to the watcher rather than blocking this worker on settlement.
	watch, _ := json.Marshal(payoutPayload{InvoiceID: inv.ID})
	err = p.Service.Queue.Enqueue(ctx, queue.EnqueueParams{
		Kind:           queue.KindSettleWatch,
		IdempotencyKey: "settle:" + inv.ID,
		Payload:        json.RawMessage(watch),
		// Generous: a quorum signature can take as long as a human takes.
		MaxAttempts: 120,
		RunAt:       time.Now().Add(10 * time.Second),
	})
	if err != nil && !errors.Is(err, queue.ErrDuplicate) {
		return err
	}
	return nil
}

// handleSettleWatch polls the intent until it lands onchain.
//
// An intent still collecting signatures is not a failure — it returns
// RetryLater so the attempt isn't consumed. Otherwise a manager who takes an
// hour would dead-letter a perfectly good payout.
func (p *Payouts) handleSettleWatch(ctx context.Context, j queue.Job) error {
	var payload payoutPayload
	if err := j.Unmarshal(&payload); err != nil {
		return fmt.Errorf("bad payload: %w", err)
	}

	inv, err := p.Service.DB.Invoice(ctx, payload.InvoiceID)
	if err != nil {
		return err
	}
	if inv.Status == domain.StatusPaid {
		return nil
	}
	if inv.PrivyIntentID == nil {
		return fmt.Errorf("invoice %s has no intent to watch", inv.ID)
	}

	intent, err := p.Privy.Intent(ctx, *inv.PrivyIntentID)
	if err != nil {
		return err
	}

	if hash := intent.TxHash(); hash != "" {
		if err := p.Service.DB.MarkInvoicePaid(ctx, inv.ID, hash); err != nil {
			return err
		}
		p.Log.Info("invoice settled", "invoice", inv.ID, "tx", hash)
		return p.audit(ctx, inv, "invoice.paid", map[string]any{"txHash": hash})
	}

	if intent.Status == "failed" || intent.Status == "expired" {
		if err := p.Service.DB.Tx(ctx, func(tx pgx.Tx) error {
			return p.Service.DB.SetInvoiceStatus(ctx, tx, inv.ID, domain.StatusFailed)
		}); err != nil {
			return err
		}
		return fmt.Errorf("intent %s %s", intent.ID, intent.Status)
	}

	return worker.RetryLater{In: 15 * time.Second}
}

func (p *Payouts) audit(ctx context.Context, inv domain.Invoice, event string, data any) error {
	return p.Service.DB.Tx(ctx, func(tx pgx.Tx) error {
		return p.Service.DB.Audit(ctx, tx, ids.New("aud"), inv.OrgID, nil,
			"invoice:"+inv.ID, event, data)
	})
}
