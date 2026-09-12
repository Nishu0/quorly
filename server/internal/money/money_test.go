package money

import (
	"math/big"
	"testing"
)

func TestToBaseUnits(t *testing.T) {
	cases := map[string]string{
		"2400":     "2400000000",
		"0.01":     "10000",
		"1":        "1000000",
		"0.000001": "1",
		"12345.67": "12345670000",
	}
	for in, want := range cases {
		got, err := ToBaseUnits(in)
		if err != nil {
			t.Fatalf("%s: %v", in, err)
		}
		if got.String() != want {
			t.Errorf("%s: got %s, want %s", in, got, want)
		}
	}
}

func TestToBaseUnitsKeepsPrecisionPastFloat64(t *testing.T) {
	// This value is exact onchain but not representable as a float64, which is
	// exactly why parsing goes through big.Int rather than strconv.ParseFloat.
	got, err := ToBaseUnits("9007199254.740993")
	if err != nil {
		t.Fatal(err)
	}
	if got.String() != "9007199254740993" {
		t.Errorf("got %s, want 9007199254740993", got)
	}
}

func TestToBaseUnitsRejectsTooManyDecimals(t *testing.T) {
	if _, err := ToBaseUnits("1.0000001"); err == nil {
		t.Error("want an error for 7 decimal places, got none")
	}
}

func TestRoundTrip(t *testing.T) {
	for _, v := range []string{"2400", "0.01", "12345.67", "0.000001"} {
		n, err := ToBaseUnits(v)
		if err != nil {
			t.Fatal(err)
		}
		if got := FromBaseUnits(n); got != v {
			t.Errorf("round trip %s: got %s", v, got)
		}
	}
}

func TestFromBaseUnitsWholeNumbers(t *testing.T) {
	if got := FromBaseUnits(big.NewInt(2_400_000_000)); got != "2400" {
		t.Errorf("got %s, want 2400", got)
	}
}

func TestUSD(t *testing.T) {
	cases := map[float64]string{
		2400:      "$2,400.00",
		0.5:       "$0.50",
		1234567.8: "$1,234,567.80",
		100:       "$100.00",
		-250:      "-$250.00",
	}
	for in, want := range cases {
		if got := USD(in); got != want {
			t.Errorf("%v: got %s, want %s", in, got, want)
		}
	}
}

func TestCAIP2(t *testing.T) {
	if got := CAIP2(84532); got != "eip155:84532" {
		t.Errorf("got %s", got)
	}
}
