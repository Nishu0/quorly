package queue

import (
	"testing"
	"time"
)

func TestBackoffGrowsAndIsCapped(t *testing.T) {
	q := &Queue{BaseBackoff: 2 * time.Second, MaxBackoff: 10 * time.Minute}

	// Jitter makes each value a range, so assert on bounds rather than equality.
	for attempt, max := range map[int]time.Duration{
		1: 2 * time.Second,
		2: 4 * time.Second,
		3: 8 * time.Second,
		4: 16 * time.Second,
	} {
		for i := 0; i < 50; i++ {
			got := q.Backoff(attempt)
			if got > max {
				t.Fatalf("attempt %d: %s exceeds base %s", attempt, got, max)
			}
			if got < max/4 {
				t.Fatalf("attempt %d: %s is below the jitter floor", attempt, got)
			}
		}
	}
}

func TestBackoffNeverExceedsMax(t *testing.T) {
	q := &Queue{BaseBackoff: 2 * time.Second, MaxBackoff: 30 * time.Second}
	for _, attempt := range []int{10, 20, 40, 63, 64, 100} {
		got := q.Backoff(attempt)
		if got > q.MaxBackoff {
			t.Errorf("attempt %d: %s exceeds cap %s", attempt, got, q.MaxBackoff)
		}
		if got <= 0 {
			t.Errorf("attempt %d: non-positive backoff %s would busy-loop", attempt, got)
		}
	}
}

func TestBackoffIsJittered(t *testing.T) {
	// Without jitter every job that failed during an outage retries at the same
	// instant and knocks the recovering service straight back over.
	q := &Queue{BaseBackoff: time.Second, MaxBackoff: time.Minute}
	seen := map[time.Duration]bool{}
	for i := 0; i < 100; i++ {
		seen[q.Backoff(5)] = true
	}
	if len(seen) < 10 {
		t.Errorf("only %d distinct delays in 100 draws — retries are synchronised", len(seen))
	}
}
