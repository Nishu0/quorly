package privy

import (
	"math/big"
	"testing"
)

func rules() []PolicyRule {
	return TreasuryRules(TreasuryRulesParams{
		TokenAddress:      "0xae29D08fdD2B95424A950c8f674077BBECE93FFA",
		AllowedRecipients: []string{"0xpriya"},
		MaxAmountBase:     big.NewInt(25_000_000_000),
	})
}

func find(rs []PolicyRule, field string) *PolicyCondition {
	for i := range rs[0].Conditions {
		if rs[0].Conditions[i].Field == field {
			return &rs[0].Conditions[i]
		}
	}
	return nil
}

func TestOneRuleSoConditionsAND(t *testing.T) {
	// As separate rules each would independently permit a transfer, which is
	// the opposite of a treasury control.
	rs := rules()
	if len(rs) != 1 {
		t.Fatalf("got %d rules, want 1", len(rs))
	}
	if rs[0].Action != "ALLOW" {
		t.Errorf("got action %q", rs[0].Action)
	}
}

func TestPinsSettlementToken(t *testing.T) {
	c := find(rules(), "to")
	if c == nil || c.Value != "0xae29D08fdD2B95424A950c8f674077BBECE93FFA" {
		t.Errorf("got %+v", c)
	}
}

func TestCapsAmountAsHexBaseUnits(t *testing.T) {
	c := find(rules(), "transfer.amount")
	if c == nil {
		t.Fatal("no amount condition")
	}
	if c.Operator != "lte" {
		t.Errorf("got operator %q", c.Operator)
	}
	got, ok := new(big.Int).SetString(c.Value.(string)[2:], 16)
	if !ok || got.Int64() != 25_000_000_000 {
		t.Errorf("got %v", c.Value)
	}
}

func TestCalldataConditionsCarryTheABI(t *testing.T) {
	for _, c := range rules()[0].Conditions {
		if c.FieldSource == "ethereum_calldata" && c.ABI == nil {
			t.Errorf("condition %q has no ABI; Privy rejects the policy", c.Field)
		}
	}
}

func TestOmitsPayeeConditionWhenAllowlistEmpty(t *testing.T) {
	// `in []` would deny every transfer, including legitimate ones.
	rs := TreasuryRules(TreasuryRulesParams{TokenAddress: "0xtoken"})
	if find(rs, "transfer.recipient") != nil {
		t.Error("empty allowlist produced a recipient condition")
	}
	if find(rs, "to") == nil {
		t.Error("token condition should still apply")
	}
}
