package privy

import (
	"context"
	"fmt"
	"math/big"
	"net/http"
)

type PolicyCondition struct {
	FieldSource string `json:"field_source"`
	Field       string `json:"field"`
	Operator    string `json:"operator"`
	Value       any    `json:"value"`
	ABI         any    `json:"abi,omitempty"`
}

type PolicyRule struct {
	Name       string            `json:"name"`
	Method     string            `json:"method"`
	Conditions []PolicyCondition `json:"conditions"`
	Action     string            `json:"action"`
}

// erc20TransferABI must be supplied inline on every ethereum_calldata
// condition; Privy rejects the policy without it.
var erc20TransferABI = []map[string]any{{
	"inputs": []map[string]any{
		{"internalType": "address", "name": "recipient", "type": "address"},
		{"internalType": "uint256", "name": "amount", "type": "uint256"},
	},
	"name":            "transfer",
	"outputs":         []map[string]any{{"internalType": "bool", "name": "", "type": "bool"}},
	"stateMutability": "nonpayable",
	"type":            "function",
}}

type TreasuryRulesParams struct {
	TokenAddress      string
	AllowedRecipients []string
	MaxAmountBase     *big.Int
}

// TreasuryRules builds the enclave-enforced spend policy.
//
// Every condition lives in ONE rule because Privy ANDs conditions within a rule
// and ORs across rules. Split into separate rules, each would independently
// permit a transfer — the opposite of a treasury control.
func TreasuryRules(p TreasuryRulesParams) []PolicyRule {
	conditions := []PolicyCondition{{
		FieldSource: "ethereum_transaction",
		Field:       "to",
		Operator:    "eq",
		Value:       p.TokenAddress,
	}}

	if p.MaxAmountBase != nil {
		conditions = append(conditions, PolicyCondition{
			FieldSource: "ethereum_calldata",
			Field:       "transfer.amount",
			ABI:         erc20TransferABI,
			Operator:    "lte",
			Value:       "0x" + p.MaxAmountBase.Text(16),
		})
	}

	// An empty `in` list would deny every transfer, including legitimate ones,
	// so only constrain payees once there are some.
	if len(p.AllowedRecipients) > 0 {
		conditions = append(conditions, PolicyCondition{
			FieldSource: "ethereum_calldata",
			Field:       "transfer.recipient",
			ABI:         erc20TransferABI,
			Operator:    "in",
			Value:       p.AllowedRecipients,
		})
	}

	return []PolicyRule{{
		Name:       "Settlement token to allowlisted payees",
		Method:     "eth_sendTransaction",
		Conditions: conditions,
		Action:     "ALLOW",
	}}
}

func (c *Client) CreatePolicy(ctx context.Context, name, chainType string, rules []PolicyRule) (string, error) {
	if len(name) > 50 {
		name = name[:50]
	}
	var out struct {
		ID string `json:"id"`
	}
	err := c.call(ctx, http.MethodPost, "/v1/policies", map[string]any{
		"version":    "1.0",
		"name":       name,
		"chain_type": orDefault(chainType, "ethereum"),
		"rules":      rules,
	}, &out, callOpts{})
	if err != nil {
		return "", fmt.Errorf("create policy: %w", err)
	}
	return out.ID, nil
}
