// Package worker drains the job queue with a bounded pool.
//
// Bounded on purpose: an unbounded pool turns a queue backlog into a thundering
// herd against Privy and the RPC node, which is how a recoverable delay becomes
// an outage.
package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/Nishu0/quorly/server/internal/queue"
)

// Handler processes one job. Returning an error retries with backoff; returning
// ErrRetryLater reschedules without consuming an attempt.
type Handler func(ctx context.Context, j queue.Job) error

// ErrRetryLater means "not ready yet", not "failed" — an intent still
// collecting quorum signatures is the motivating case. It must not burn
// attempts, or a slow approver would dead-letter a perfectly good payout.
type RetryLater struct{ In time.Duration }

func (e RetryLater) Error() string { return fmt.Sprintf("retry in %s", e.In) }

type Pool struct {
	q        *queue.Queue
	handlers map[queue.Kind]Handler
	log      *slog.Logger

	Concurrency  int
	PollInterval time.Duration
	ID           string
}

func NewPool(q *queue.Queue, log *slog.Logger, id string) *Pool {
	return &Pool{
		q:            q,
		handlers:     map[queue.Kind]Handler{},
		log:          log,
		Concurrency:  4,
		PollInterval: 2 * time.Second,
		ID:           id,
	}
}

func (p *Pool) Handle(kind queue.Kind, h Handler) { p.handlers[kind] = h }

// Run drains the queue until ctx is cancelled, then waits for in-flight jobs.
func (p *Pool) Run(ctx context.Context) {
	sem := make(chan struct{}, p.Concurrency)
	var wg sync.WaitGroup

	ticker := time.NewTicker(p.PollInterval)
	defer ticker.Stop()

	p.log.Info("worker pool started", "id", p.ID, "concurrency", p.Concurrency)

	for {
		select {
		case <-ctx.Done():
			p.log.Info("worker pool draining", "id", p.ID)
			wg.Wait()
			return

		case <-ticker.C:
			// Never claim more than there is capacity to run, or jobs sit
			// leased while nothing works on them.
			capacity := p.Concurrency - len(sem)
			if capacity <= 0 {
				continue
			}

			jobs, err := p.q.Claim(ctx, p.ID, capacity)
			if err != nil {
				p.log.Error("claim failed", "err", err)
				continue
			}

			for _, j := range jobs {
				sem <- struct{}{}
				wg.Add(1)
				go func(j queue.Job) {
					defer wg.Done()
					defer func() { <-sem }()
					p.run(ctx, j)
				}(j)
			}
		}
	}
}

func (p *Pool) run(ctx context.Context, j queue.Job) {
	log := p.log.With("job", j.ID, "kind", string(j.Kind), "attempt", j.Attempts)

	h, ok := p.handlers[j.Kind]
	if !ok {
		// An unknown kind will never succeed; dead-letter it immediately
		// rather than retrying eight times.
		_ = p.q.Fail(ctx, queue.Job{ID: j.ID, Attempts: j.MaxAttempts, MaxAttempts: j.MaxAttempts},
			fmt.Errorf("no handler for kind %q", j.Kind))
		log.Error("no handler registered")
		return
	}

	// A handler must not outlive its lease, or two workers could run it at once.
	runCtx, cancel := context.WithTimeout(ctx, p.q.Lease-10*time.Second)
	defer cancel()

	defer func() {
		if r := recover(); r != nil {
			log.Error("handler panicked", "panic", r)
			_ = p.q.Fail(context.WithoutCancel(ctx), j, fmt.Errorf("panic: %v", r))
		}
	}()

	err := h(runCtx, j)

	var later RetryLater
	switch {
	case err == nil:
		if err := p.q.Complete(context.WithoutCancel(ctx), j.ID); err != nil {
			log.Error("complete failed", "err", err)
		}
		log.Info("job done")

	case errors.As(err, &later):
		if err := p.q.Reschedule(context.WithoutCancel(ctx), j.ID, later.In); err != nil {
			log.Error("reschedule failed", "err", err)
		}
		log.Debug("job not ready", "in", later.In)

	default:
		if err := p.q.Fail(context.WithoutCancel(ctx), j, err); err != nil {
			log.Error("fail failed", "err", err)
		}
		if j.Attempts >= j.MaxAttempts {
			log.Error("job dead-lettered", "err", err)
		} else {
			log.Warn("job failed, will retry", "err", err)
		}
	}
}
