// Package policy decides who must approve an invoice, and refuses approvals
// that don't satisfy the tier. Both Slack and the web app route through here,
// so an approval means the same thing wherever it happens.
package policy

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/Nishu0/quorly/server/internal/domain"
	"github.com/Nishu0/quorly/server/internal/money"
)

var ErrNoPolicy = errors.New("org has no active approval policy")

type Decision struct {
	Policy               domain.Policy
	RequiredApprovals    int
	EligibleApprovers    []domain.Member
	RequiredAttestation  *domain.AttestationKind
	AttestationMaxAgeSec int
	Reason               string
}

// Select picks the cheapest tier whose ceiling still covers the amount. An
// amount above every ceiling falls to the strictest tier — never to none.
func Select(policies []domain.Policy, amount float64) (domain.Policy, error) {
	active := make([]domain.Policy, 0, len(policies))
	for _, p := range policies {
		if p.Active {
			active = append(active, p)
		}
	}
	if len(active) == 0 {
		return domain.Policy{}, ErrNoPolicy
	}

	sort.Slice(active, func(i, j int) bool { return active[i].MaxAmount < active[j].MaxAmount })

	for _, p := range active {
		if amount <= p.MaxAmount {
			return p, nil
		}
	}
	return active[len(active)-1], nil
}

// Route answers the three questions the Slack bot needs: which tier applies,
// who may approve, and whether they must prove they're live.
func Route(inv domain.Invoice, policies []domain.Policy, members []domain.Member) (Decision, error) {
	p, err := Select(policies, inv.Amount)
	if err != nil {
		return Decision{}, err
	}

	roles := make(map[domain.Role]bool, len(p.ApproverRoles))
	for _, r := range p.ApproverRoles {
		roles[r] = true
	}

	eligible := make([]domain.Member, 0, len(members))
	for _, m := range members {
		if !roles[m.Role] {
			continue
		}
		if p.BlockSelfApproval && m.ID == inv.SubmitterID {
			continue
		}
		eligible = append(eligible, m)
	}

	// Never demand more approvals than there are people who could give them,
	// or the invoice deadlocks.
	required := p.RequiredApprovals
	if len(eligible) > 0 && required > len(eligible) {
		required = len(eligible)
	}
	if required < 1 {
		required = 1
	}

	roleNames := make([]string, 0, len(p.ApproverRoles))
	for _, r := range p.ApproverRoles {
		roleNames = append(roleNames, string(r))
	}

	reason := fmt.Sprintf("%s matches %q (ceiling %s) → %d of %d %s must approve",
		money.USD(inv.Amount), p.Name, money.USD(p.MaxAmount),
		required, len(eligible), strings.Join(roleNames, "/"))
	if p.RequiredAttestation != nil {
		reason += fmt.Sprintf(", each with a live %s",
			strings.ReplaceAll(string(*p.RequiredAttestation), "_", " "))
	}

	return Decision{
		Policy:               p,
		RequiredApprovals:    required,
		EligibleApprovers:    eligible,
		RequiredAttestation:  p.RequiredAttestation,
		AttestationMaxAgeSec: p.AttestationMaxAgeSec,
		Reason:               reason,
	}, nil
}

type GateCode string

const (
	GateAllowed             GateCode = ""
	GateSelfApproval        GateCode = "self_approval"
	GateNotEligible         GateCode = "not_eligible"
	GateAlreadyDecided      GateCode = "already_decided"
	GateAttestationRequired GateCode = "attestation_required"
	GateAttestationStale    GateCode = "attestation_stale"
)

type GateResult struct {
	Allowed bool
	Code    GateCode
	Message string
}

// GateInput carries everything the final check needs. AttestationAgeSec is nil
// when the approver has no fresh proof at all.
type GateInput struct {
	Decision          Decision
	Approver          domain.Member
	SubmitterID       string
	AlreadyDecided    bool
	AttestationAgeSec *int
}

// Gate is the last check before an approval is recorded.
func Gate(in GateInput) GateResult {
	if in.Decision.Policy.BlockSelfApproval && in.Approver.ID == in.SubmitterID {
		return GateResult{Code: GateSelfApproval, Message: "You can't approve your own invoice."}
	}

	eligible := false
	for _, m := range in.Decision.EligibleApprovers {
		if m.ID == in.Approver.ID {
			eligible = true
			break
		}
	}
	if !eligible {
		return GateResult{Code: GateNotEligible, Message: "You're not an approver on this policy tier."}
	}

	if in.AlreadyDecided {
		return GateResult{Code: GateAlreadyDecided, Message: "You've already decided on this invoice."}
	}

	if in.Decision.RequiredAttestation != nil {
		if in.AttestationAgeSec == nil {
			return GateResult{Code: GateAttestationRequired, Message: "Complete a Selfie Check to approve this payout."}
		}
		if *in.AttestationAgeSec > in.Decision.AttestationMaxAgeSec {
			return GateResult{Code: GateAttestationStale, Message: "Your Selfie Check has expired. Please verify again."}
		}
	}

	return GateResult{Allowed: true, Code: GateAllowed}
}

// DefaultTiers is the rulebook seeded for a new org: friction priced to risk.
func DefaultTiers() []domain.Policy {
	selfie := domain.SelfieCheck
	return []domain.Policy{
		{
			Name: "Fast lane", MaxAmount: 500, Currency: "QUSD", Active: true,
			RequiredApprovals: 1, ApproverRoles: []domain.Role{domain.RoleApprover, domain.RoleOwner},
			RequiredAttestation: nil, AttestationMaxAgeSec: 300, BlockSelfApproval: true,
		},
		{
			Name: "Standard", MaxAmount: 5000, Currency: "QUSD", Active: true,
			RequiredApprovals: 1, ApproverRoles: []domain.Role{domain.RoleApprover, domain.RoleOwner},
			RequiredAttestation: &selfie, AttestationMaxAgeSec: 300, BlockSelfApproval: true,
		},
		{
			Name: "High value", MaxAmount: 25000, Currency: "QUSD", Active: true,
			RequiredApprovals: 2, ApproverRoles: []domain.Role{domain.RoleApprover, domain.RoleOwner},
			RequiredAttestation: &selfie, AttestationMaxAgeSec: 180, BlockSelfApproval: true,
		},
	}
}
