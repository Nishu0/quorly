package queue_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/Nishu0/quorly/server/internal/config"
	"github.com/Nishu0/quorly/server/internal/queue"
	"github.com/Nishu0/quorly/server/internal/store"
	"github.com/jackc/pgx/v5"
)

// These run against the real database because the behaviour under test is
// SKIP LOCKED, lease expiry, and a UNIQUE constraint — none of which a fake
// would actually exercise.
func setup(t *testing.T) (*store.Store, *queue.Queue) {
	t.Helper()
	cfg, err := config.Load()
	if err != nil || cfg.DatabaseURL == "" {
		t.Skip("no DATABASE_URL; skipping integration test")
	}

	db, err := store.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		t.Skipf("database unreachable: %v", err)
	}
	t.Cleanup(db.Close)

	if err := db.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return db, queue.New(db.Pool())
}

func key(t *testing.T) string {
	t.Helper()
	return "test:" + t.Name() + ":" + time.Now().Format("150405.000000")
}

func cleanup(t *testing.T, db *store.Store, k string) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = db.Pool().Exec(context.Background(), `DELETE FROM jobs WHERE idempotency_key=$1`, k)
	})
}

func TestEnqueueIsIdempotent(t *testing.T) {
	db, q := setup(t)
	ctx := context.Background()
	k := key(t)
	cleanup(t, db, k)

	p := queue.EnqueueParams{Kind: "test", IdempotencyKey: k, Payload: map[string]string{"a": "1"}}
	if err := q.Enqueue(ctx, p); err != nil {
		t.Fatal(err)
	}

	// Enqueuing the same work twice must collide, not pay twice.
	err := q.Enqueue(ctx, p)
	if !errors.Is(err, queue.ErrDuplicate) {
		t.Fatalf("got %v, want ErrDuplicate", err)
	}
}

func TestClaimHandsEachJobToExactlyOneWorker(t *testing.T) {
	db, q := setup(t)
	ctx := context.Background()
	k := key(t)
	cleanup(t, db, k)

	if err := q.Enqueue(ctx, queue.EnqueueParams{Kind: "test", IdempotencyKey: k}); err != nil {
		t.Fatal(err)
	}

	first, err := q.Claim(ctx, "worker-a", 10)
	if err != nil {
		t.Fatal(err)
	}
	var claimed *queue.Job
	for i := range first {
		if first[i].IdempotencyKey == k {
			claimed = &first[i]
		}
	}
	if claimed == nil {
		t.Fatal("first worker did not claim the job")
	}

	// A second worker must not see a leased job.
	second, err := q.Claim(ctx, "worker-b", 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, j := range second {
		if j.IdempotencyKey == k {
			t.Fatal("two workers claimed the same job — a payout would run twice")
		}
	}

	if err := q.Complete(ctx, claimed.ID); err != nil {
		t.Fatal(err)
	}
}

func TestExpiredLeaseIsReclaimed(t *testing.T) {
	db, q := setup(t)
	ctx := context.Background()
	k := key(t)
	cleanup(t, db, k)

	if err := q.Enqueue(ctx, queue.EnqueueParams{Kind: "test", IdempotencyKey: k}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.Claim(ctx, "worker-that-dies", 10); err != nil {
		t.Fatal(err)
	}

	// Simulate the worker dying mid-job: its lease lapses.
	if _, err := db.Pool().Exec(ctx,
		`UPDATE jobs SET leased_until = now() - interval '1 minute' WHERE idempotency_key=$1`, k); err != nil {
		t.Fatal(err)
	}

	again, err := q.Claim(ctx, "worker-that-lives", 10)
	if err != nil {
		t.Fatal(err)
	}
	for _, j := range again {
		if j.IdempotencyKey == k {
			return // reclaimed, as it must be
		}
	}
	t.Fatal("job stranded after its worker died")
}

func TestFailRetriesThenDeadLetters(t *testing.T) {
	db, q := setup(t)
	ctx := context.Background()
	k := key(t)
	cleanup(t, db, k)

	if err := q.Enqueue(ctx, queue.EnqueueParams{
		Kind: "test", IdempotencyKey: k, MaxAttempts: 2,
	}); err != nil {
		t.Fatal(err)
	}

	claim := func() queue.Job {
		t.Helper()
		// Make the job runnable now regardless of backoff.
		if _, err := db.Pool().Exec(ctx,
			`UPDATE jobs SET run_at = now() - interval '1 second' WHERE idempotency_key=$1`, k); err != nil {
			t.Fatal(err)
		}
		jobs, err := q.Claim(ctx, "w", 50)
		if err != nil {
			t.Fatal(err)
		}
		for _, j := range jobs {
			if j.IdempotencyKey == k {
				return j
			}
		}

		var status string
		var attempts, maxAttempts int
		var runAt, leased any
		_ = db.Pool().QueryRow(ctx,
			`SELECT status, attempts, max_attempts, run_at, leased_until FROM jobs WHERE idempotency_key=$1`, k).
			Scan(&status, &attempts, &maxAttempts, &runAt, &leased)
		t.Fatalf("job not claimable: status=%s attempts=%d/%d run_at=%v leased_until=%v (claimed %d others)",
			status, attempts, maxAttempts, runAt, leased, len(jobs))
		return queue.Job{}
	}

	j := claim()
	if err := q.Fail(ctx, j, errors.New("boom")); err != nil {
		t.Fatal(err)
	}

	var status string
	if err := db.Pool().QueryRow(ctx,
		`SELECT status FROM jobs WHERE idempotency_key=$1`, k).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "pending" {
		t.Fatalf("after attempt 1 got %q, want pending — work must not be dropped early", status)
	}

	j = claim()
	if err := q.Fail(ctx, j, errors.New("boom again")); err != nil {
		t.Fatal(err)
	}

	var lastErr *string
	if err := db.Pool().QueryRow(ctx,
		`SELECT status, last_error FROM jobs WHERE idempotency_key=$1`, k).Scan(&status, &lastErr); err != nil {
		t.Fatal(err)
	}
	if status != "dead" {
		t.Fatalf("after exhausting attempts got %q, want dead", status)
	}
	// Nothing is ever silently dropped: the reason is retained.
	if lastErr == nil || *lastErr != "boom again" {
		t.Errorf("last_error = %v, want the failure reason", lastErr)
	}
}

func TestEnqueueTxRollsBackWithItsTransaction(t *testing.T) {
	db, q := setup(t)
	ctx := context.Background()
	k := key(t)
	cleanup(t, db, k)

	// The outbox guarantee: if the business write rolls back, so does the job.
	err := db.Tx(ctx, func(tx pgx.Tx) error {
		if err := queue.EnqueueTx(ctx, tx, queue.EnqueueParams{Kind: "test", IdempotencyKey: k}); err != nil {
			return err
		}
		return errors.New("business logic failed")
	})
	if err == nil {
		t.Fatal("expected the transaction to fail")
	}

	var n int
	if err := db.Pool().QueryRow(ctx,
		`SELECT count(*) FROM jobs WHERE idempotency_key=$1`, k).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Error("job survived a rolled-back transaction — it would run for work that never happened")
	}
	_ = q
	_ = os.Getenv
}
