import {
  pgTable, text, timestamp, integer, numeric, boolean, jsonb, uniqueIndex, index, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ enums */

export const memberRole = pgEnum("member_role", [
  "owner",     // can edit policies + key quorum membership
  "approver",  // can approve invoices within policy limits
  "finance",   // can execute payouts, cannot approve own
  "member",    // contractor / employee: can submit invoices only
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "scheduled",
  "paid",
  "failed",
]);

export const approvalDecision = pgEnum("approval_decision", ["approve", "reject"]);

export const attestationKind = pgEnum("attestation_kind", [
  "selfie_check",     // World ID Selfie Check (medium assurance, 90-day window)
  "proof_of_human",   // Orb — used for high-value tiers
]);

/* --------------------------------------------------------------- entities */

export const orgs = pgTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slackTeamId: text("slack_team_id").unique(),
  ensName: text("ens_name"),                       // e.g. acme.eth (ENSv2 parent)
  ensRegistryAddress: text("ens_registry_address"), // org's own ENSv2 subname registry
  treasuryWalletId: text("treasury_wallet_id"),     // Privy wallet id
  treasuryAddress: text("treasury_address"),
  treasuryQuorumId: text("treasury_quorum_id"),     // Privy key quorum id
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    slackUserId: text("slack_user_id"),
    role: memberRole("role").notNull().default("member"),

    // Privy
    privyUserId: text("privy_user_id"),
    walletId: text("wallet_id"),        // Privy wallet id (payout destination / signer)
    walletAddress: text("wallet_address"),
    authorizationKeyId: text("authorization_key_id"), // member's key inside the quorum

    // ENSv2 subname, e.g. priya.acme.eth
    ensSubname: text("ens_subname"),

    // World ID — nullifier is stable per (action, credential)
    worldNullifier: text("world_nullifier"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    orgEmail: uniqueIndex("members_org_email_idx").on(t.orgId, t.email),
    slackIdx: index("members_slack_idx").on(t.slackUserId),
  }),
);

/** Approval policy: the org's rulebook. Mirrors a Privy policy 1:1 where possible. */
export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),

  // Tiering, evaluated low -> high by maxAmount
  maxAmount: numeric("max_amount", { precision: 20, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("USDC"),

  requiredApprovals: integer("required_approvals").notNull().default(1),
  approverRoles: jsonb("approver_roles").$type<string[]>().notNull().default(["approver"]),

  /** Which biometric credential the approver must present. null = none. */
  requiredAttestation: attestationKind("required_attestation"),
  /** Attestation must be fresher than this many seconds at approval time. */
  attestationMaxAgeSec: integer("attestation_max_age_sec").notNull().default(300),

  /** Submitter may never approve their own invoice. */
  blockSelfApproval: boolean("block_self_approval").notNull().default(true),

  /** Mirror of the policy pushed to Privy's enclave-enforced policy engine. */
  privyPolicyId: text("privy_policy_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    submitterId: text("submitter_id").notNull().references(() => members.id),

    number: text("number"),
    description: text("description"),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
    currency: text("currency").notNull().default("USDC"),
    dueDate: timestamp("due_date"),

    status: invoiceStatus("status").notNull().default("pending_approval"),

    // where the money goes: resolved from ENS subname or member wallet
    payeeAddress: text("payee_address"),
    payeeEns: text("payee_ens"),

    // source document
    fileUrl: text("file_url"),
    extracted: jsonb("extracted").$type<Record<string, unknown>>(),

    // routing decision from the policy engine
    policyId: text("policy_id").references(() => policies.id),
    requiredApprovals: integer("required_approvals").notNull().default(1),

    // external system mirror (BILL, QuickBooks, Xero…)
    externalSystem: text("external_system"),
    externalId: text("external_id"),

    // Privy intent that will move the funds once approvals land
    privyIntentId: text("privy_intent_id"),
    txHash: text("tx_hash"),

    // Slack thread the bot is driving
    slackChannelId: text("slack_channel_id"),
    slackThreadTs: text("slack_thread_ts"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
  },
  (t) => ({
    orgStatus: index("invoices_org_status_idx").on(t.orgId, t.status),
  }),
);

/** One row per approver decision. Carries the biometric attestation that gated it. */
export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    approverId: text("approver_id").notNull().references(() => members.id),
    decision: approvalDecision("decision").notNull(),
    note: text("note"),
    attestationId: text("attestation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    once: uniqueIndex("approvals_invoice_approver_idx").on(t.invoiceId, t.approverId),
  }),
);

/**
 * A verified World ID proof. `nullifier` is UNIQUE per (action, nullifier) to stop
 * replay — the single most important World ID integration rule.
 */
export const attestations = pgTable(
  "attestations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => members.id),
    kind: attestationKind("kind").notNull(),
    action: text("action").notNull(),
    signal: text("signal").notNull(),          // binds proof to invoice id
    nullifier: text("nullifier").notNull(),
    verificationLevel: text("verification_level"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => ({
    // Scoped to the signal (invoice + approver), not just the action: a Selfie
    // Check nullifier is stable per person, so keying on action alone would
    // reject the same manager's next legitimate approval as a replay.
    replay: uniqueIndex("attestations_signal_nullifier_idx").on(t.signal, t.nullifier),
    lookup: index("attestations_member_idx").on(t.memberId, t.kind),
  }),
);

/**
 * A server-issued World ID challenge.
 *
 * The `rp_context` nonce we sign is what makes this a challenge-response: we
 * mint one bound to a single invoice and approver, and the proof that comes
 * back must carry that exact nonce. A proof harvested anywhere else has a
 * different nonce and is rejected before it ever reaches World's verifier.
 */
export const worldChallenges = pgTable(
  "world_challenges",
  {
    nonce: text("nonce").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id),
    action: text("action").notNull(),
    signal: text("signal").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
  },
  (t) => ({ open: index("world_challenges_target_idx").on(t.invoiceId, t.memberId) }),
);

/** Immutable audit trail — every state change, who caused it, what proved it. */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  actorId: text("actor_id"),
  subject: text("subject").notNull(),   // e.g. invoice:inv_123
  event: text("event").notNull(),       // e.g. invoice.approved
  data: jsonb("data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Third-party AP/accounting connections (BILL, QuickBooks, Xero, Ramp…). */
export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("disconnected"),
    config: jsonb("config").$type<Record<string, unknown>>(),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ oneEach: uniqueIndex("connections_org_provider_idx").on(t.orgId, t.provider) }),
);

/* ------------------------------------------------------------- relations */

export const orgRelations = relations(orgs, ({ many }) => ({
  members: many(members),
  policies: many(policies),
  invoices: many(invoices),
}));

export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  org: one(orgs, { fields: [invoices.orgId], references: [orgs.id] }),
  submitter: one(members, { fields: [invoices.submitterId], references: [members.id] }),
  policy: one(policies, { fields: [invoices.policyId], references: [policies.id] }),
  approvals: many(approvals),
}));

export const approvalRelations = relations(approvals, ({ one }) => ({
  invoice: one(invoices, { fields: [approvals.invoiceId], references: [invoices.id] }),
  approver: one(members, { fields: [approvals.approverId], references: [members.id] }),
}));

export type Org = typeof orgs.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Policy = typeof policies.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Attestation = typeof attestations.$inferSelect;

export type WorldChallenge = typeof worldChallenges.$inferSelect;
