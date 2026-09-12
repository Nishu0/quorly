package slackapp

import "testing"

func TestParseAmountToleratesModelOutput(t *testing.T) {
	cases := map[string]float64{
		"2400":      2400,
		"2400.00":   2400,
		"$2,400.00": 2400,
		"2400 USD":  2400,
		"  1234.5 ": 1234.5,
	}
	for in, want := range cases {
		got, err := parseAmount(in)
		if err != nil {
			t.Errorf("%q: %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("%q: got %v, want %v", in, got, want)
		}
	}
}

func TestParseAmountRefusesNonsense(t *testing.T) {
	// Money moves off this. Anything ambiguous must stop the flow, not guess.
	for _, in := range []string{"", "TBD", "see attached", "0", "-50"} {
		if v, err := parseAmount(in); err == nil {
			t.Errorf("%q parsed to %v, want an error", in, v)
		}
	}
}
