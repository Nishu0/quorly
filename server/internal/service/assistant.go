package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/Nishu0/quorly/server/internal/chat"
	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/money"
	"github.com/Nishu0/quorly/server/internal/policy"
	"github.com/Nishu0/quorly/server/internal/store"
)

// Assistant answers questions about an org's invoices in plain language.
//
// The model gets no tools and no database connection. Everything it can say is
// assembled here first, which is deliberate: retrieval it controls is
// retrieval nobody can audit, and this is a system that moves money. Building
// the context ourselves also means every link it hands out is one we minted.
type Assistant struct {
	DB     *store.Store
	Chat   *chat.Client
	AppURL string
}

func (a *Assistant) Enabled() bool { return a != nil && a.Chat.Enabled() }

// Answer replies to one question from one member.
//
// history is prior turns, oldest first, excluding the question itself.
func (a *Assistant) Answer(ctx context.Context, m domain.Member, question string, history []chat.Message) (string, error) {
	facts, err := a.context(ctx, m)
	if err != nil {
		return "", err
	}
	turns := append(history, chat.Message{Role: "user", Content: question})
	return a.Chat.Ask(ctx, facts, turns)
}

// context renders what this member is allowed to know, as text.
//
// Scoped to their org and shaped by their role: an approver sees what is
// waiting on them, someone who only submits sees their own invoices. The model
// cannot widen this, because it never sees anything else.
func (a *Assistant) context(ctx context.Context, m domain.Member) (string, error) {
	var b strings.Builder

	org, err := a.DB.Org(ctx, m.OrgID)
	if err != nil {
		return "", err
	}
	members, err := a.DB.Members(ctx, m.OrgID)
	if err != nil {
		return "", err
	}
	policies, err := a.DB.Policies(ctx, m.OrgID)
	if err != nil {
		return "", err
	}
	invoices, err := a.DB.Invoices(ctx, m.OrgID, 40)
	if err != nil {
		return "", err
	}

	name := func(id string) string {
		for _, x := range members {
			if x.ID == id {
				return x.Display()
			}
		}
		return "someone no longer on the roster"
	}

	b.WriteString("CONTEXT\n\n")
	fmt.Fprintf(&b, "Who you are talking to: %s <%s>, role %s, in %s.\n",
		m.Display(), m.Email, m.Role, org.Name)
	if m.WalletAddress != nil && *m.WalletAddress != "" {
		fmt.Fprintf(&b, "Their wallet: %s\n", *m.WalletAddress)
	} else {
		b.WriteString("They have no wallet yet, so they cannot be paid until they sign in.\n")
	}
	if org.TreasuryAddress != nil {
		fmt.Fprintf(&b, "Treasury: %s — payouts leave from here, released by the key quorum that owns it.\n",
			*org.TreasuryAddress)
	}

	b.WriteString("\nSPEND POLICY (tiers, cheapest first)\n")
	for _, p := range policies {
		if !p.Active {
			continue
		}
		line := fmt.Sprintf("- %s: up to %s, %d approval(s)",
			p.Name, money.USD(p.MaxAmount), p.RequiredApprovals)
		if p.RequiredAttestation != nil {
			line += ", live Selfie Check required"
		}
		if p.BlockSelfApproval {
			line += ", submitter may not approve"
		}
		fmt.Fprintf(&b, "%s\n", line)
	}

	b.WriteString("\nROSTER\n")
	for _, x := range members {
		state := "signed in"
		if x.PrivyUserID == nil {
			state = "invited, has not signed in"
		}
		fmt.Fprintf(&b, "- %s <%s>, %s (%s)\n", x.Display(), x.Email, x.Role, state)
	}

	// Invoices carry their own link so the model never has to build one.
	b.WriteString("\nINVOICES (most recent first)\n")
	if len(invoices) == 0 {
		b.WriteString("None yet.\n")
	}
	for _, inv := range invoices {
		desc := ""
		if inv.Description != nil {
			desc = " — " + *inv.Description
		}
		ref := inv.ID
		if inv.Number != nil && *inv.Number != "" {
			ref = *inv.Number + " (" + inv.ID + ")"
		}
		fmt.Fprintf(&b, "- %s: %s, %s, filed by %s%s\n",
			ref, money.USD(inv.Amount), inv.Status, name(inv.SubmitterID), desc)

		switch inv.Status {
		case domain.StatusPaid:
			if inv.TxHash != nil {
				fmt.Fprintf(&b, "    settled onchain: https://sepolia.basescan.org/tx/%s\n", *inv.TxHash)
			}
		case domain.StatusPendingApproval:
			a.writeApprovalLine(ctx, &b, inv, m, policies, members)
		default:
			fmt.Fprintf(&b, "    view: %s/dashboard/invoices/%s\n", a.AppURL, inv.ID)
		}
	}

	b.WriteString("\nLINKS\n")
	fmt.Fprintf(&b, "- Dashboard: %s/dashboard\n", a.AppURL)
	fmt.Fprintf(&b, "- Their wallet: %s/dashboard/wallet\n", a.AppURL)
	fmt.Fprintf(&b, "- Signing in is the same link; it asks them to sign in first if needed.\n")

	return b.String(), nil
}

// writeApprovalLine says whether this person can decide this invoice, and
// gives the link that takes them straight into doing it.
func (a *Assistant) writeApprovalLine(
	ctx context.Context, b *strings.Builder, inv domain.Invoice,
	m domain.Member, policies []domain.Policy, members []domain.Member,
) {
	decision, err := policy.Route(inv, policies, members)
	if err != nil {
		fmt.Fprintf(b, "    awaiting approval; view: %s/dashboard/invoices/%s\n", a.AppURL, inv.ID)
		return
	}

	approvals, _ := a.DB.Approvals(ctx, inv.ID)
	collected := 0
	for _, ap := range approvals {
		if ap.Decision == "approve" {
			collected++
		}
	}
	fmt.Fprintf(b, "    awaiting approval (%d of %d)\n", collected, decision.RequiredApprovals)

	eligible := false
	for _, ap := range decision.EligibleApprovers {
		if ap.ID == m.ID {
			eligible = true
			break
		}
	}

	switch {
	case eligible && decision.RequiredAttestation != nil:
		fmt.Fprintf(b, "    THEY CAN APPROVE THIS, with a live Selfie Check: %s/verify/%s\n",
			a.AppURL, inv.ID)
	case eligible:
		fmt.Fprintf(b, "    THEY CAN APPROVE THIS: %s/verify/%s\n", a.AppURL, inv.ID)
	case inv.SubmitterID == m.ID:
		fmt.Fprintf(b, "    they filed it, and self-approval is blocked on this tier, so someone else must decide\n")
	default:
		fmt.Fprintf(b, "    they are not an approver on the %s tier, so they cannot decide it\n",
			decision.Policy.Name)
	}
}
