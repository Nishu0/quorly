# Quorly server (Go)

The backend: policy engine, Privy client, World ID verification, Slack install,
and the payout worker pool.

## Why a queue for payouts

The money path is the part that must not lose work. Approvals and payouts are
written in the **same transaction** — an approval can never be recorded without
its payout being scheduled, and a payout can never exist without its approval.
That's the transactional outbox pattern, and it's why the queue lives in
Postgres rather than a separate broker: a broker reintroduces the dual-write
problem the outbox exists to solve.

```
approve ──┐
          ├─ one transaction ─→ approvals row + jobs row
settle  ──┘

worker pool ─→ SELECT … FOR UPDATE SKIP LOCKED
             ├─ payout        create the Privy transfer intent
             ├─ settle_watch  poll until it lands onchain
             └─ slack_notify  tell people what happened
```

Failure handling:

| Concern | How |
|---|---|
| Duplicate work | `jobs.idempotency_key` is UNIQUE; enqueuing twice collides |
| Worker crash | Jobs carry a lease; an expired lease makes them claimable again |
| Transient failure | Exponential backoff with jitter across `[d/4, d]` |
| Thundering herd | Jitter desynchronises a fleet retrying after an outage |
| Not-ready-yet | `RetryLater` reschedules without consuming an attempt |
| Permanent failure | Dead-lettered after `max_attempts`, never silently dropped |
| Backpressure | Bounded pool; never claims more than it has capacity to run |

## Layout

```
cmd/quorly           entrypoint (-migrate to apply schema and exit)
internal/config      env loading, walks up to the repo root for .env
internal/domain      entities the whole system agrees on
internal/money       exact 6-decimal conversion via big.Int, never float64
internal/policy      approval routing and the approval gate
internal/privy       REST client, canonical JSON, P-256 quorum signing
internal/queue       Postgres job queue: claim, retry, dead-letter
internal/worker      bounded pool with leases and graceful drain
internal/store       pool, embedded migrations, queries
```

## Run

```bash
go run ./cmd/quorly -migrate   # apply schema
go run ./cmd/quorly            # serve
go test ./...
```
