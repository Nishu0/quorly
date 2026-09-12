# Quorly

**Face-verified approvals for company money.**

A contractor DMs an invoice to a Slack bot. Quorly reads it, routes it against the
company's approval policy, pings the manager who actually has authority, and — above
a dollar threshold — makes that manager pass a **World ID Selfie Check** before the
approval counts. Only then does a **Privy** treasury wallet release the payment, under
a key quorum and an enclave-enforced spend policy.

The gap it closes: today, "approve" is a button click authenticated by a session
cookie. A stolen laptop, a hijacked cookie or an over-eager automation can click it.
Quorly makes the human in the loop *provably* a live human, at the moment money moves.

---

## Architecture

```
apps/web     Next.js 15 — UI only. Renders what the API returns.
server/      Go — the whole backend: policy, Privy, World, Slack, workers.
contracts/   Foundry — QUSD, the test settlement token.
```

The Go server is the only thing that touches the database. The web app forwards the
viewer's Privy token and renders the response, so authorisation is decided in exactly
one place.

### The money path

Approvals and payouts are written in the **same transaction** — an approval can never
be recorded without its payout being scheduled, and a payout can never exist without
its approval. That's the transactional outbox, and it's why the queue lives in Postgres
rather than a separate broker: a broker reintroduces the dual-write problem the outbox
exists to solve.

```
approve ──┐
          ├── one transaction ──→ approvals row + jobs row
          ┘

worker pool ── SELECT … FOR UPDATE SKIP LOCKED
             ├─ payout        propose the Privy transfer intent
             └─ settle_watch  poll until it lands onchain
```

| Concern | How |
|---|---|
| Duplicate work | `jobs.idempotency_key` is UNIQUE; enqueuing twice collides |
| Worker crash | Jobs carry a lease; an expired lease makes them claimable again |
| Transient failure | Exponential backoff, jittered across `[d/4, d]` |
| Thundering herd | Jitter desynchronises a fleet retrying after an outage |
| Not-ready-yet | `RetryLater` reschedules without consuming an attempt |
| Permanent failure | Dead-lettered after `max_attempts`, never silently dropped |
| Backpressure | Bounded pool; never claims more than it can run |

---

## Privy — the rails and the controls

| Control | Where |
|---|---|
| **Server wallets** | Org treasury, created during setup |
| **Key quorums** | The treasury is owned by an m-of-n quorum. "Two approvals required" isn't app state we can flip — it's the wallet's owner |
| **Policies** | Mirrored into Privy's policy engine: settlement token only, allowlisted payees, per-transfer ceiling. Enforced in the TEE |
| **Intents** | Every payout is a transfer intent that sits unauthorised until the quorum signs |

Requests carry one P-256 signature per authorization key. A wallet owned by a 2-of-3
quorum rejects a request bearing one signature — which is the point.

## World ID — Selfie Check as a risk signal

Selfie Check is a *medium*-assurance credential: liveness and facial similarity, a
90-day window, and explicitly **no** one-person-one-account guarantee. So Quorly never
uses it for identity. Authority comes from the key quorum; Selfie Check answers one
question — *was a live human behind this click?*

- **Risk-tiered.** Under $500, no check. $500–$5k, one live check. Above that, two
  approvers each with a check under 180 seconds old.
- **Challenge-response.** The server mints a signed `rp_context` per approval and
  records its nonce as a single-use challenge bound to one invoice and one approver.
- **Burned before verifying**, so a slow verify can't be raced.
- **Fails safe.** No proof, stale proof, or reused proof and the approval doesn't record.

See [`FEEDBACK.md`](./FEEDBACK.md) for the integration feedback document.

## ENS

Members carry a subname under the org's name (`priya.acme.eth`), and invoices store the
payee as a name alongside the resolved address. Names and the org registry are modelled
end to end; on-chain resolution against ENSv2 Sepolia is the next piece of work.

---

## Run it

```bash
cp .env.example .env          # fill in DATABASE_URL at minimum
bun install

bun run migrate               # apply the schema
bun run dev:server            # Go API + worker pool on :8080
bun run dev:web               # Next.js on :3000

bun run test                  # Go suite, including queue integration tests
bun run test:contracts        # Foundry
```

With `PRIVY_APP_ID` unset everything runs in demo mode: Selfie Check and payouts are
simulated end to end.

### Slack

Install via `/slack/install`. The callback provisions the workspace — an org keyed to
the team, the default rulebook, and the installer seeded as owner. Point the app's
Event Subscriptions at `<APP_URL>/slack/events`, Interactivity at
`/slack/interactions`, and the `/quorly` command at `/slack/commands`.

---

## The flow, end to end

1. Priya DMs the bot an invoice PDF for $2,400.
2. Claude extracts the amount, number and description. The bot files it and explains
   the routing: *"$2,400.00 matches "Standard" (ceiling $5,000.00) → 1 of 2
   approver/owner must approve, each with a live selfie check."*
3. Mel gets an approval card, clicks **Approve**, and is stopped — this tier needs a
   live check.
4. He taps **Verify with World ID** and completes Selfie Check in World App.
5. The proof verifies server-side, burns its challenge, and releases the approval.
6. In the same transaction, a payout job is queued. A worker proposes the Privy
   transfer intent; the quorum authorises it; the watcher marks the invoice paid when
   it lands.
7. The invoice page shows the audit trail — who approved, what proved it, which
   transaction settled it.
