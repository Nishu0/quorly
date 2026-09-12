package policy

import (
	"testing"

	"github.com/Nishu0/quorly/server/internal/domain"
)

func tiers() []domain.Policy {
	return DefaultTiers()
}

var (
	dana  = domain.Member{ID: "dana", Role: domain.RoleOwner, Email: "dana@acme.test"}
	mel   = domain.Member{ID: "mel", Role: domain.RoleApprover, Email: "mel@acme.test"}
	priya = domain.Member{ID: "priya", Role: domain.RoleMember, Email: "priya@acme.test"}
	sam   = domain.Member{ID: "sam", Role: domain.RoleFinance, Email: "sam@acme.test"}
)

func roster() []domain.Member { return []domain.Member{dana, mel, priya} }

func invoice(amount float64, submitter string) domain.Invoice {
	return domain.Invoice{ID: "inv_1", Amount: amount, SubmitterID: submitter}
}

func TestSelectPicksCheapestCoveringTier(t *testing.T) {
	cases := []struct {
		amount float64
		want   string
	}{
		{100, "Fast lane"},
		{500, "Fast lane"}, // boundary is inclusive
		{501, "Standard"},
		{5000, "Standard"},
		{5001, "High value"},
	}
	for _, c := range cases {
		got, err := Select(tiers(), c.amount)
		if err != nil {
			t.Fatalf("amount %v: %v", c.amount, err)
		}
		if got.Name != c.want {
			t.Errorf("amount %v: got %q, want %q", c.amount, got.Name, c.want)
		}
	}
}

func TestSelectFallsToStrictestAboveEveryCeiling(t *testing.T) {
	got, err := Select(tiers(), 10_000_000)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "High value" {
		t.Errorf("got %q, want the strictest tier", got.Name)
	}
}

func TestSelectIgnoresInactiveTiers(t *testing.T) {
	ts := tiers()
	ts[0].Active = false
	got, err := Select(ts, 100)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Standard" {
		t.Errorf("got %q, want Standard", got.Name)
	}
}

func TestSelectErrorsWithNoActivePolicy(t *testing.T) {
	if _, err := Select(nil, 100); err != ErrNoPolicy {
		t.Errorf("got %v, want ErrNoPolicy", err)
	}
}

func TestRouteExcludesTheSubmitter(t *testing.T) {
	d, err := Route(invoice(2400, mel.ID), tiers(), roster())
	if err != nil {
		t.Fatal(err)
	}
	if len(d.EligibleApprovers) != 1 || d.EligibleApprovers[0].ID != dana.ID {
		t.Errorf("got %+v, want only dana", d.EligibleApprovers)
	}
}

func TestRouteExcludesNonApproverRoles(t *testing.T) {
	d, err := Route(invoice(100, priya.ID), tiers(), roster())
	if err != nil {
		t.Fatal(err)
	}
	if len(d.EligibleApprovers) != 2 {
		t.Errorf("got %d approvers, want dana and mel", len(d.EligibleApprovers))
	}
}

func TestRouteClampsRequiredApprovalsToAvailablePeople(t *testing.T) {
	// High value wants 2, but with Dana submitting only Mel remains.
	d, err := Route(invoice(20000, dana.ID), tiers(), roster())
	if err != nil {
		t.Fatal(err)
	}
	if d.Policy.Name != "High value" {
		t.Fatalf("got tier %q", d.Policy.Name)
	}
	if len(d.EligibleApprovers) != 1 {
		t.Fatalf("got %d eligible", len(d.EligibleApprovers))
	}
	if d.RequiredApprovals != 1 {
		t.Errorf("got %d required, want 1 — otherwise the invoice deadlocks", d.RequiredApprovals)
	}
}

func TestRouteCarriesAttestationRequirement(t *testing.T) {
	fast, _ := Route(invoice(100, priya.ID), tiers(), roster())
	if fast.RequiredAttestation != nil {
		t.Error("fast lane should need no biometric")
	}
	std, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	if std.RequiredAttestation == nil || *std.RequiredAttestation != domain.SelfieCheck {
		t.Error("standard tier should require a selfie check")
	}
}

func TestGateAllowsFreshEligibleFirstDecision(t *testing.T) {
	d, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	age := 10
	got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AttestationAgeSec: &age})
	if !got.Allowed {
		t.Errorf("got %+v, want allowed", got)
	}
}

func TestGateBlocksSelfApproval(t *testing.T) {
	d, _ := Route(invoice(2400, mel.ID), tiers(), roster())
	age := 10
	got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: mel.ID, AttestationAgeSec: &age})
	if got.Code != GateSelfApproval {
		t.Errorf("got %q, want self_approval", got.Code)
	}
}

func TestGateBlocksNonApprover(t *testing.T) {
	d, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	age := 10
	// Sam isn't the submitter, so this can only be the role check firing.
	got := Gate(GateInput{Decision: d, Approver: sam, SubmitterID: priya.ID, AttestationAgeSec: &age})
	if got.Code != GateNotEligible {
		t.Errorf("got %q, want not_eligible", got.Code)
	}
}

func TestGateBlocksSecondDecisionFromSameApprover(t *testing.T) {
	d, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	age := 10
	got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AlreadyDecided: true, AttestationAgeSec: &age})
	if got.Code != GateAlreadyDecided {
		t.Errorf("got %q, want already_decided", got.Code)
	}
}

func TestGateRequiresAttestationWhenTierDemandsIt(t *testing.T) {
	d, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AttestationAgeSec: nil})
	if got.Code != GateAttestationRequired {
		t.Errorf("got %q, want attestation_required", got.Code)
	}
}

func TestGateRejectsStaleAttestation(t *testing.T) {
	d, _ := Route(invoice(2400, priya.ID), tiers(), roster())
	stale, fresh := 301, 299
	if got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AttestationAgeSec: &stale}); got.Code != GateAttestationStale {
		t.Errorf("301s: got %q, want attestation_stale", got.Code)
	}
	if got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AttestationAgeSec: &fresh}); !got.Allowed {
		t.Errorf("299s: got %+v, want allowed", got)
	}
}

func TestGateSkipsAttestationOnFastLane(t *testing.T) {
	d, _ := Route(invoice(100, priya.ID), tiers(), roster())
	got := Gate(GateInput{Decision: d, Approver: mel, SubmitterID: priya.ID, AttestationAgeSec: nil})
	if !got.Allowed {
		t.Errorf("got %+v, want allowed without a biometric", got)
	}
}
