-- Slack workspaces that installed the app. One row per workspace, which is
-- what makes the product multi-tenant rather than one hardcoded team.
CREATE TABLE IF NOT EXISTS slack_installations (
  team_id       text PRIMARY KEY,
  team_name     text NOT NULL,
  org_id        text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  bot_token     text NOT NULL,
  bot_user_id   text NOT NULL,
  installed_by  text NOT NULL,
  scopes        text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Durable job queue. Jobs are enqueued in the same transaction as the business
-- write that causes them, so an approval can never be recorded without its
-- payout being scheduled, and a payout can never exist without its approval.
CREATE TABLE IF NOT EXISTS jobs (
  id               bigserial PRIMARY KEY,
  kind             text NOT NULL,
  -- The caller's natural key. UNIQUE is the whole idempotency story: enqueuing
  -- the same work twice collides instead of paying twice.
  idempotency_key  text NOT NULL UNIQUE,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 8,
  run_at           timestamptz NOT NULL DEFAULT now(),
  -- Lease expiry. A worker that dies mid-job leaves this in the past, and the
  -- job becomes claimable again rather than stranded.
  leased_until     timestamptz,
  worker_id        text,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The claim query's index: pending or expired-lease work, oldest first.
CREATE INDEX IF NOT EXISTS jobs_claimable_idx ON jobs (status, run_at)
  WHERE status IN ('pending', 'claimed');
CREATE INDEX IF NOT EXISTS jobs_dead_idx ON jobs (status, updated_at DESC)
  WHERE status = 'dead';
