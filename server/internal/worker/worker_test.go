package worker

import (
	"testing"
	"time"
)

func TestRetryLaterCarriesItsDelay(t *testing.T) {
	// A job that is merely "not ready yet" — an intent still collecting quorum
	// signatures — must not burn an attempt, or a slow approver would
	// dead-letter a perfectly good payout.
	e := RetryLater{In: 15 * time.Second}
	if e.Error() != "retry in 15s" {
		t.Errorf("got %q", e.Error())
	}
}
