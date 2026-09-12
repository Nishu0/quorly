// Package money converts between human amounts and the 6-decimal base units
// the settlement token uses. Everything onchain is integers; float64 is only
// ever a display convenience.
package money

import (
	"fmt"
	"math/big"
	"strings"
)

const Decimals = 6

var scale = new(big.Int).Exp(big.NewInt(10), big.NewInt(Decimals), nil)

// ToBaseUnits parses a decimal string exactly, without going through float64 —
// 9007199254.740993 is representable onchain but not as a float.
func ToBaseUnits(amount string) (*big.Int, error) {
	amount = strings.TrimSpace(amount)
	if amount == "" {
		return nil, fmt.Errorf("empty amount")
	}

	neg := strings.HasPrefix(amount, "-")
	amount = strings.TrimPrefix(amount, "-")

	whole, frac, _ := strings.Cut(amount, ".")
	if len(frac) > Decimals {
		return nil, fmt.Errorf("more than %d decimal places: %q", Decimals, amount)
	}
	frac += strings.Repeat("0", Decimals-len(frac))

	if whole == "" {
		whole = "0"
	}

	n, ok := new(big.Int).SetString(whole+frac, 10)
	if !ok {
		return nil, fmt.Errorf("not a number: %q", amount)
	}
	if neg {
		n.Neg(n)
	}
	return n, nil
}

// FromBaseUnits renders base units as a plain decimal string.
func FromBaseUnits(n *big.Int) string {
	q, r := new(big.Int).QuoRem(n, scale, new(big.Int))
	if r.Sign() == 0 {
		return q.String()
	}
	frac := strings.TrimRight(fmt.Sprintf("%0*d", Decimals, r.Abs(r)), "0")
	return q.String() + "." + frac
}

// USD formats for humans: $1,234.56.
func USD(amount float64) string {
	s := fmt.Sprintf("%.2f", amount)
	whole, frac, _ := strings.Cut(s, ".")

	neg := strings.HasPrefix(whole, "-")
	whole = strings.TrimPrefix(whole, "-")

	var b strings.Builder
	for i, d := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(d)
	}

	out := "$" + b.String() + "." + frac
	if neg {
		return "-" + out
	}
	return out
}

// CAIP2 identifies the chain for Privy.
func CAIP2(chainID int) string {
	return fmt.Sprintf("eip155:%d", chainID)
}
