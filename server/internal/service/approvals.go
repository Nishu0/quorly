// Package service holds the business flows both the API and the Slack bot call,
// so an approval means the same thing wherever it happens.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/ids"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/Nishu0/quorly/server/internal/worldid"
)

type Service struct {
	DB    *store.Store
	World *worldid.Client
	Queue *queue.Queue
	// WorldAction is the Incognito Action proofs are scoped to.
	WorldAction string
}

/* ------------------------------------------------------------------ routing */

func (s *Service) Route(ctx context.Context, inv domain.Invoice) (policy.Decision, error) {
	policies, err := s.DB.Policies(ctx, inv.OrgID)
	if err != nil {
		return policy.Decision{}, err
	}
	members, err := s.DB.Members(ctx, inv.OrgID)
	if err != nil {
		return policy.Decision{}, err
	}
	return policy.Route(inv, policies, members)
}

/* --------------------------------------------------------- create an invoice */

type NewInvoice struct {
	OrgID          string
	SubmitterID    string
	Amount         float64
	Currency       string
	Number         *string
	Description    *string
	DueDate        *time.Time
	PayeeAddress   *string
	PayeeENS       *string
	FileURL        *string
	SlackChannelID *string
}

func (s *Service) CreateInvoice(ctx context.Context, in NewInvoice) (domain.Invoice, policy.Decision, error) {
	submitter, err := s.DB.Member(ctx, in.SubmitterID)
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}

	inv := domain.Invoice{
		ID:             ids.New("inv"),
		OrgID:          in.OrgID,
		SubmitterID:    in.SubmitterID,
		Number:         in.Number,
		Description:    in.Description,
		Amount:         in.Amount,
		Currency:       orDefault(in.Currency, "QUSD"),
		DueDate:        in.DueDate,
		Status:         domain.StatusPendingApproval,
		PayeeAddress:   firstNonNil(in.PayeeAddress, submitter.WalletAddress),
		PayeeENS:       firstNonNil(in.PayeeENS, submitter.ENSSubname),
		FileURL:        in.FileURL,
		SlackChannelID: in.SlackChannelID,
	}

	// Route before writing so the invoice lands with its tier already decided —
	// a row that exists without one is a row nobody knows how to approve.
	policies, err := s.DB.Policies(ctx, in.OrgID)
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}
	members, err := s.DB.Members(ctx, in.OrgID)
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}
	decision, err := policy.Route(inv, policies, members)
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}
	inv.PolicyID = &decision.Policy.ID
	inv.RequiredApprovals = decision.RequiredApprovals

	notify, err := json.Marshal(map[string]string{"invoiceId": inv.ID})
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}

	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.DB.CreateInvoice(ctx, tx, inv); err != nil {
			return err
		}
		// Told to the approvers from here rather than from whichever surface
		// filed the invoice: it used to be the Slack handler's job, so an
		// invoice raised any other way reached nobody. Same transaction as the
		// row, so a notification cannot exist for an invoice that does not.
		if err := queue.EnqueueTx(ctx, tx, queue.EnqueueParams{
			Kind:           queue.KindSlackNotify,
			IdempotencyKey: "notify:" + inv.ID,
			Payload:        notify,
			MaxAttempts:    5,
		}); err != nil {
			return err
		}
		return s.DB.Audit(ctx, tx, ids.New("aud"), inv.OrgID, &in.SubmitterID,
			"invoice:"+inv.ID, "invoice.submitted", map[string]any{
				"amount": inv.Amount, "policy": decision.Policy.Name, "routing": decision.Reason,
			})
	})
	if err != nil {
		return domain.Invoice{}, policy.Decision{}, err
	}
	return inv, decision, nil
}

/* -------------------------------------------------------------- attestations */

var (
	ErrChallengeUnknown = errors.New("we didn't issue that check")
	ErrChallengeSpent   = errors.New("that check was already submitted")
	ErrChallengeTarget  = errors.New("that proof belongs to a different approval")
	ErrProofReplayed    = errors.New("that proof was already used")
)

// RecordAttestation burns the challenge, verifies the proof, and banks it.
//
// Burning first is deliberate: a slow verify must not leave a window in which
// the same proof can be submitted twice.
func (s *Service) RecordAttestation(ctx context.Context, invoiceID, memberID, orgID string, result worldid.Result) (string, error) {
	if !s.World.Demo {
		ch, err := s.DB.ConsumeChallenge(ctx, result.Nonce)
		if errors.Is(err, store.ErrNotFound) {
			return "", ErrChallengeUnknown
		}
		if err != nil {
			return "", err
		}
		if ch.InvoiceID != invoiceID || ch.MemberID != memberID {
			return "", ErrChallengeTarget
		}
	}

	v, err := s.World.Verify(ctx, result, s.WorldAction)
	if err != nil {
		return "", fmt.Errorf("verify: %w", err)
	}
	if !v.OK {
		return "", errors.New(worldid.Explain(v.Code, v.Detail))
	}

	att := domain.Attestation{
		ID:                ids.New("att"),
		OrgID:             orgID,
		MemberID:          &memberID,
		Kind:              domain.SelfieCheck,
		Action:            s.WorldAction,
		Signal:            worldid.Signal(invoiceID, memberID),
		Nullifier:         v.Nullifier,
		VerificationLevel: &v.Environment,
	}

	if err := s.DB.RecordAttestation(ctx, att, v.Raw); err != nil {
		var pgErr *pgconn.PgError
		// UNIQUE (signal, nullifier): already spent for this approval.
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return "", ErrProofReplayed
		}
		return "", err
	}
	return att.ID, nil
}

/* ------------------------------------------------------------------- decide */

type Outcome struct {
	Invoice        domain.Invoice
	Collected      int
	Required       int
	FullyApproved  bool
	Gate           policy.GateResult
	NeedsSelfCheck bool
}

// Decide records one approver's decision and, when the quorum is met, schedules
// the payout in the same transaction.
//
// That transaction is the point: an approval can never be recorded without its
// payout being queued, and a payout can never exist without its approval.
func (s *Service) Decide(ctx context.Context, invoiceID, approverID, decision string, note *string) (Outcome, error) {
	inv, err := s.DB.Invoice(ctx, invoiceID)
	if err != nil {
		return Outcome{}, err
	}
	if inv.Status != domain.StatusPendingApproval {
		return Outcome{}, fmt.Errorf("invoice is %s", inv.Status)
	}

	approver, err := s.DB.Member(ctx, approverID)
	if err != nil {
		return Outcome{}, err
	}

	route, err := s.Route(ctx, inv)
	if err != nil {
		return Outcome{}, err
	}

	var (
		attestationID *string
		age           *int
	)
	if decision == "approve" && route.RequiredAttestation != nil {
		age, err = s.DB.FreshAttestationAge(ctx, approverID,
			worldid.Signal(invoiceID, approverID),
			time.Duration(route.AttestationMaxAgeSec)*time.Second)
		if err != nil {
			return Outcome{}, err
		}
	}

	var out Outcome
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		decided, err := store.HasDecided(ctx, tx, invoiceID, approverID)
		if err != nil {
			return err
		}

		gate := policy.Gate(policy.GateInput{
			Decision:          route,
			Approver:          approver,
			SubmitterID:       inv.SubmitterID,
			AlreadyDecided:    decided,
			AttestationAgeSec: age,
		})
		if !gate.Allowed {
			out.Gate = gate
			out.NeedsSelfCheck = gate.Code == policy.GateAttestationRequired ||
				gate.Code == policy.GateAttestationStale
			return nil
		}

		if err := s.DB.RecordApproval(ctx, tx, domain.Approval{
			ID: ids.New("apr"), InvoiceID: invoiceID, ApproverID: approverID,
			Decision: decision, Note: note, AttestationID: attestationID,
		}); err != nil {
			return err
		}

		if decision == "reject" {
			if err := s.DB.SetInvoiceStatus(ctx, tx, invoiceID, domain.StatusRejected); err != nil {
				return err
			}
			out.Gate = policy.GateResult{Allowed: true}
			out.Invoice = inv
			out.Invoice.Status = domain.StatusRejected
			return s.DB.Audit(ctx, tx, ids.New("aud"), inv.OrgID, &approverID,
				"invoice:"+invoiceID, "invoice.rejected", map[string]any{"note": note})
		}

		collected, err := store.CountApprovals(ctx, tx, invoiceID)
		if err != nil {
			return err
		}

		out.Gate = policy.GateResult{Allowed: true}
		out.Collected = collected
		out.Required = route.RequiredApprovals
		out.FullyApproved = collected >= route.RequiredApprovals
		out.Invoice = inv

		if out.FullyApproved {
			if err := s.DB.SetInvoiceStatus(ctx, tx, invoiceID, domain.StatusApproved); err != nil {
				return err
			}
			out.Invoice.Status = domain.StatusApproved

			// The outbox write. Same transaction, so the two can't diverge.
			payload, _ := json.Marshal(map[string]string{"invoiceId": invoiceID})
			if err := queue.EnqueueTx(ctx, tx, queue.EnqueueParams{
				Kind: queue.KindPayout,
				// One payout per invoice, forever — the UNIQUE index turns a
				// double-submit into a no-op instead of a double payment.
				IdempotencyKey: "payout:" + invoiceID,
				Payload:        json.RawMessage(payload),
			}); err != nil && !errors.Is(err, queue.ErrDuplicate) {
				return err
			}
		}

		return s.DB.Audit(ctx, tx, ids.New("aud"), inv.OrgID, &approverID,
			"invoice:"+invoiceID, "invoice.approved", map[string]any{
				"collected": collected, "required": route.RequiredApprovals,
			})
	})
	return out, err
}

func orDefault(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}

func firstNonNil(vals ...*string) *string {
	for _, v := range vals {
		if v != nil && *v != "" {
			return v
		}
	}
	return nil
}
