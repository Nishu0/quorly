// Package queue is a Postgres-backed job queue for work that must not be lost.
//
// Why Postgres and not Kafka: the jobs here move money, and the thing that
// matters most is that a job is enqueued in the *same transaction* as the
// approval that justifies it. A separate broker reintroduces the dual-write
// problem the outbox pattern exists to solve, and at this volume
// SELECT ... FOR UPDATE SKIP LOCKED is a real queue with no extra infrastructure
// to operate.
package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Kind string

const (
	KindPayout      Kind = "payout"       // create the Privy transfer intent
	KindSlackNotify Kind = "slack_notify" // tell people what happened
)

type Status string

const (
	StatusPending Status = "pending"
	StatusClaimed Status = "claimed"
	StatusDone    Status = "done"
	StatusDead    Status = "dead"
)

type Job struct {
	ID             int64
	Kind           Kind
	IdempotencyKey string
	Payload        json.RawMessage
	Status         Status
	Attempts       int
	MaxAttempts    int
	RunAt          time.Time
	LastError      *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Unmarshal decodes the job payload into v.
func (j Job) Unmarshal(v any) error { return json.Unmarshal(j.Payload, v) }

// ErrDuplicate means this exact work was already enqueued. Callers should treat
// it as success: that is what idempotency is for.
var ErrDuplicate = errors.New("job already enqueued")

type Queue struct {
	pool *pgxpool.Pool
	// Lease is how long a worker may hold a job before it becomes claimable
	// again. A worker that crashes mid-job strands it only this long.
	Lease time.Duration
	// BaseBackoff is the first retry delay; each attempt doubles it.
	BaseBackoff time.Duration
	MaxBackoff  time.Duration
}

func New(pool *pgxpool.Pool) *Queue {
	return &Queue{
		pool:        pool,
		Lease:       2 * time.Minute,
		BaseBackoff: 2 * time.Second,
		MaxBackoff:  10 * time.Minute,
	}
}

type EnqueueParams struct {
	Kind           Kind
	IdempotencyKey string
	Payload        any
	MaxAttempts    int
	RunAt          time.Time
}

// Enqueue inside an existing transaction. This is the intended path: the
// business write and the job commit together, so neither can exist alone.
func EnqueueTx(ctx context.Context, tx pgx.Tx, p EnqueueParams) error {
	body, err := json.Marshal(p.Payload)
	if err != nil {
		return err
	}
	if p.MaxAttempts == 0 {
		p.MaxAttempts = 8
	}
	if p.RunAt.IsZero() {
		p.RunAt = time.Now()
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO jobs (kind, idempotency_key, payload, max_attempts, run_at)
		VALUES ($1, $2, $3, $4, $5)`,
		string(p.Kind), p.IdempotencyKey, body, p.MaxAttempts, p.RunAt)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrDuplicate
	}
	return err
}

// Enqueue outside a transaction, for work with no accompanying write.
func (q *Queue) Enqueue(ctx context.Context, p EnqueueParams) error {
	tx, err := q.pool.Begin(ctx)
	if err != nil {
		return err
	}
	if err := EnqueueTx(ctx, tx, p); err != nil {
		_ = tx.Rollback(context.WithoutCancel(ctx))
		return err
	}
	return tx.Commit(ctx)
}

// Claim takes up to n runnable jobs and leases them to workerID.
//
// SKIP LOCKED is what lets several workers drain the same queue without
// blocking each other or handing the same job to two of them.
func (q *Queue) Claim(ctx context.Context, workerID string, n int) ([]Job, error) {
	rows, err := q.pool.Query(ctx, `
		UPDATE jobs SET
			status       = 'claimed',
			attempts     = attempts + 1,
			leased_until = now() + $3::interval,
			worker_id    = $1,
			updated_at   = now()
		WHERE id IN (
			SELECT id FROM jobs
			WHERE run_at <= now()
			  AND (
			    status = 'pending'
			    -- Reclaim work whose worker died holding the lease.
			    OR (status = 'claimed' AND leased_until < now())
			  )
			ORDER BY run_at
			FOR UPDATE SKIP LOCKED
			LIMIT $2
		)
		RETURNING id, kind, idempotency_key, payload, status, attempts,
		          max_attempts, run_at, last_error, created_at, updated_at`,
		workerID, n, fmt.Sprintf("%d seconds", int(q.Lease.Seconds())))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.Kind, &j.IdempotencyKey, &j.Payload, &j.Status,
			&j.Attempts, &j.MaxAttempts, &j.RunAt, &j.LastError, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

func (q *Queue) Complete(ctx context.Context, id int64) error {
	_, err := q.pool.Exec(ctx,
		`UPDATE jobs SET status='done', leased_until=NULL, worker_id=NULL, updated_at=now() WHERE id=$1`, id)
	return err
}

// Reschedule pushes a job to a later time without counting it as a failure —
// for work that is simply not ready yet, like an intent still awaiting
// signatures.
func (q *Queue) Reschedule(ctx context.Context, id int64, in time.Duration) error {
	_, err := q.pool.Exec(ctx, `
		UPDATE jobs SET status='pending', run_at=now() + $2::interval,
		       attempts = GREATEST(attempts - 1, 0),
		       leased_until=NULL, worker_id=NULL, updated_at=now()
		WHERE id=$1`, id, fmt.Sprintf("%d seconds", int(in.Seconds())))
	return err
}

// Fail records the error and schedules a retry, or dead-letters the job once
// it has exhausted its attempts. Nothing is ever silently dropped.
func (q *Queue) Fail(ctx context.Context, j Job, cause error) error {
	if j.Attempts >= j.MaxAttempts {
		_, err := q.pool.Exec(ctx, `
			UPDATE jobs SET status='dead', last_error=$2, leased_until=NULL,
			       worker_id=NULL, updated_at=now()
			WHERE id=$1`, j.ID, cause.Error())
		return err
	}

	_, err := q.pool.Exec(ctx, `
		UPDATE jobs SET status='pending', run_at=now() + $2::interval,
		       last_error=$3, leased_until=NULL, worker_id=NULL, updated_at=now()
		WHERE id=$1`,
		j.ID, fmt.Sprintf("%d milliseconds", q.Backoff(j.Attempts).Milliseconds()), cause.Error())
	return err
}

// Backoff is exponential with full jitter.
//
// Jitter matters more than the exponent: without it, every job that failed
// during an outage retries at the same instant and knocks the recovering
// service straight back over.
func (q *Queue) Backoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}

	// math.Pow overflows int64 well before attempt 64, which would wrap to a
	// negative duration and busy-loop the worker.
	d := time.Duration(float64(q.BaseBackoff) * math.Pow(2, float64(attempt-1)))
	if d > q.MaxBackoff || d <= 0 {
		d = q.MaxBackoff
	}

	// Jitter across [d/4, d]: spread enough to desynchronise a recovering
	// fleet, but never above the cap the caller asked for.
	floor := int64(d) / 4
	span := int64(d) - floor
	if span <= 0 {
		return d
	}
	return time.Duration(floor + rand.Int63n(span))
}

// Stats is what /health reports, and what tells an operator the queue is stuck.
type Stats struct {
	Pending int `json:"pending"`
	Claimed int `json:"claimed"`
	Dead    int `json:"dead"`
	Done    int `json:"done"`
}

func (q *Queue) Stats(ctx context.Context) (Stats, error) {
	var s Stats
	err := q.pool.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE status='pending'),
			count(*) FILTER (WHERE status='claimed'),
			count(*) FILTER (WHERE status='dead'),
			count(*) FILTER (WHERE status='done')
		FROM jobs`).Scan(&s.Pending, &s.Claimed, &s.Dead, &s.Done)
	return s, err
}
