-- Baseline: tables the TypeScript prototype created via Drizzle. Written
-- idempotently so the Go server can adopt an existing database or build a
-- fresh one from nothing.

CREATE TABLE IF NOT EXISTS orgs (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  slack_team_id         text UNIQUE,
  ens_name              text,
  ens_registry_address  text,
  treasury_wallet_id    text,
  treasury_address      text,
  treasury_quorum_id    text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id                    text PRIMARY KEY,
  org_id                text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email                 text NOT NULL,
  name                  text,
  slack_user_id         text,
  role                  text NOT NULL DEFAULT 'member',
  privy_user_id         text,
  wallet_id             text,
  wallet_address        text,
  authorization_key_id  text,
  ens_subname           text,
  world_nullifier       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS members_org_email_idx ON members (org_id, email);
CREATE INDEX IF NOT EXISTS members_slack_idx ON members (slack_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS members_privy_idx ON members (privy_user_id) WHERE privy_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS policies (
  id                        text PRIMARY KEY,
  org_id                    text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  active                    boolean NOT NULL DEFAULT true,
  max_amount                numeric(20,6) NOT NULL,
  currency                  text NOT NULL DEFAULT 'QUSD',
  required_approvals        integer NOT NULL DEFAULT 1,
  approver_roles            jsonb NOT NULL DEFAULT '["approver"]'::jsonb,
  required_attestation      text,
  attestation_max_age_sec   integer NOT NULL DEFAULT 300,
  block_self_approval       boolean NOT NULL DEFAULT true,
  privy_policy_id           text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                  text PRIMARY KEY,
  org_id              text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  submitter_id        text NOT NULL REFERENCES members(id),
  number              text,
  description         text,
  amount              numeric(20,6) NOT NULL,
  currency            text NOT NULL DEFAULT 'QUSD',
  due_date            timestamptz,
  status              text NOT NULL DEFAULT 'pending_approval',
  payee_address       text,
  payee_ens           text,
  file_url            text,
  extracted           jsonb,
  policy_id           text REFERENCES policies(id),
  required_approvals  integer NOT NULL DEFAULT 1,
  external_system     text,
  external_id         text,
  privy_intent_id     text,
  tx_hash             text,
  slack_channel_id    text,
  slack_thread_ts     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);
CREATE INDEX IF NOT EXISTS invoices_org_status_idx ON invoices (org_id, status);

CREATE TABLE IF NOT EXISTS approvals (
  id              text PRIMARY KEY,
  invoice_id      text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  approver_id     text NOT NULL REFERENCES members(id),
  decision        text NOT NULL,
  note            text,
  attestation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- One decision per person per invoice.
CREATE UNIQUE INDEX IF NOT EXISTS approvals_invoice_approver_idx ON approvals (invoice_id, approver_id);

CREATE TABLE IF NOT EXISTS attestations (
  id                  text PRIMARY KEY,
  org_id              text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  member_id           text REFERENCES members(id),
  kind                text NOT NULL,
  action              text NOT NULL,
  signal              text NOT NULL,
  nullifier           text NOT NULL,
  verification_level  text,
  raw                 jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz
);
-- Scoped to the signal, not the action: a Selfie Check nullifier is stable per
-- person, so keying on action alone would reject that person's next
-- legitimate approval as a replay.
CREATE UNIQUE INDEX IF NOT EXISTS attestations_signal_nullifier_idx ON attestations (signal, nullifier);
CREATE INDEX IF NOT EXISTS attestations_member_idx ON attestations (member_id, kind);

CREATE TABLE IF NOT EXISTS world_challenges (
  nonce        text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invoice_id   text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  member_id    text NOT NULL REFERENCES members(id),
  action       text NOT NULL,
  signal       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS world_challenges_target_idx ON world_challenges (invoice_id, member_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          text PRIMARY KEY,
  org_id      text NOT NULL,
  actor_id    text,
  subject     text NOT NULL,
  event       text NOT NULL,
  data        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_subject_idx ON audit_log (subject, created_at DESC);

CREATE TABLE IF NOT EXISTS connections (
  id            text PRIMARY KEY,
  org_id        text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  status        text NOT NULL DEFAULT 'disconnected',
  config        jsonb,
  last_sync_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_org_provider_idx ON connections (org_id, provider);
