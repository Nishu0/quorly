/**
 * Business logic shared by the Slack bot and the web app. Both surfaces call
 * exactly these functions, so an approval means the same thing wherever it
 * happens.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import {
  approvals, attestations, auditLog, invoices, members, orgs, policies,
  type Invoice, type Member, type Policy,
} from "./db/schema";
import { id } from "./ids";
import { gateApproval, route, type RoutingDecision } from "./policy";
import { PrivyClient } from "./privy";
import { approvalSignal, verifySelfieCheck, type WorldProof } from "./worldid";
import { caip2, toBaseUnits } from "./money";
import { env } from "./env";

/* ------------------------------------------------------------------ audit */

export async function audit(entry: {
  orgId: string; actorId?: string | null; subject: string; event: string;
  data?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    id: id("aud"),
    orgId: entry.orgId,
    actorId: entry.actorId ?? null,
    subject: entry.subject,
    event: entry.event,
    data: entry.data ?? {},
  });
}

/* --------------------------------------------------------------- lookups */

export async function memberBySlackId(slackUserId: string): Promise<Member | undefined> {
  return db.query.members.findFirst({ where: eq(members.slackUserId, slackUserId) });
}

export async function orgPolicies(orgId: string): Promise<Policy[]> {
  return db.select().from(policies).where(eq(policies.orgId, orgId));
}

export async function orgMembers(orgId: string): Promise<Member[]> {
  return db.select().from(members).where(eq(members.orgId, orgId));
}

export async function routeInvoice(invoice: Invoice): Promise<RoutingDecision> {
  const [p, m] = await Promise.all([orgPolicies(invoice.orgId), orgMembers(invoice.orgId)]);
  return route({ invoice, policies: p, members: m });
}

/* -------------------------------------------------------- create invoice */

export interface NewInvoice {
  orgId: string;
  submitterId: string;
  amount: string;
  currency?: string;
  description?: string;
  number?: string;
  dueDate?: Date;
  fileUrl?: string;
  extracted?: Record<string, unknown>;
  payeeAddress?: string;
  payeeEns?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
}

export async function createInvoice(input: NewInvoice): Promise<{ invoice: Invoice; decision: RoutingDecision }> {
  const submitter = await db.query.members.findFirst({ where: eq(members.id, input.submitterId) });

  const [invoice] = await db
    .insert(invoices)
    .values({
      id: id("inv"),
      orgId: input.orgId,
      submitterId: input.submitterId,
      amount: input.amount,
      currency: input.currency ?? "USDC",
      description: input.description,
      number: input.number,
      dueDate: input.dueDate,
      fileUrl: input.fileUrl,
      extracted: input.extracted,
      payeeAddress: input.payeeAddress ?? submitter?.walletAddress ?? null,
      payeeEns: input.payeeEns ?? submitter?.ensSubname ?? null,
      status: "pending_approval",
      slackChannelId: input.slackChannelId,
      slackThreadTs: input.slackThreadTs,
    })
    .returning();

  if (!invoice) throw new Error("Failed to create invoice");

  const decision = await routeInvoice(invoice);
  await db
    .update(invoices)
    .set({ policyId: decision.policy.id, requiredApprovals: decision.requiredApprovals })
    .where(eq(invoices.id, invoice.id));

  await audit({
    orgId: input.orgId,
    actorId: input.submitterId,
    subject: `invoice:${invoice.id}`,
    event: "invoice.submitted",
    data: { amount: input.amount, policy: decision.policy.name, routing: decision.reason },
  });

  return { invoice: { ...invoice, policyId: decision.policy.id, requiredApprovals: decision.requiredApprovals }, decision };
}

/* ------------------------------------------------ attestation (Selfie Check) */

export async function recordAttestation(input: {
  orgId: string;
  memberId: string;
  invoiceId: string;
  proof: WorldProof;
  kind?: "selfie_check" | "proof_of_human";
}): Promise<{ ok: boolean; attestationId?: string; error?: string }> {
  const action = env.world.action();
  const signal = approvalSignal(input.invoiceId, input.memberId);

  const result = await verifySelfieCheck({ proof: input.proof, action, signal });
  if (!result.ok) return { ok: false, error: result.error ?? "verification_failed" };

  const attestationId = id("att");
  try {
    await db.insert(attestations).values({
      id: attestationId,
      orgId: input.orgId,
      memberId: input.memberId,
      kind: input.kind ?? "selfie_check",
      action,
      signal,
      nullifier: result.nullifier,
      verificationLevel: result.verificationLevel,
      raw: result.raw,
    });
  } catch (err) {
    // UNIQUE (action, nullifier) rejected it: this proof was already spent.
    return { ok: false, error: "proof_replayed" };
  }

  await audit({
    orgId: input.orgId,
    actorId: input.memberId,
    subject: `invoice:${input.invoiceId}`,
    event: "attestation.verified",
    data: { kind: input.kind ?? "selfie_check", level: result.verificationLevel },
  });

  return { ok: true, attestationId };
}

async function freshAttestation(memberId: string, invoiceId: string, maxAgeSec: number) {
  const since = new Date(Date.now() - maxAgeSec * 1000);
  return db.query.attestations.findFirst({
    where: and(
      eq(attestations.memberId, memberId),
      eq(attestations.signal, approvalSignal(invoiceId, memberId)),
      gte(attestations.createdAt, since),
    ),
    orderBy: desc(attestations.createdAt),
  });
}

/* --------------------------------------------------------------- approve */

export interface ApprovalOutcome {
  ok: boolean;
  code?: string;
  message?: string;
  invoice?: Invoice;
  collected?: number;
  required?: number;
  fullyApproved?: boolean;
  verifyUrl?: string;
}

export async function decide(input: {
  invoiceId: string;
  approverId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<ApprovalOutcome> {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, input.invoiceId) });
  if (!invoice) return { ok: false, code: "not_found", message: "Invoice not found." };
  if (invoice.status !== "pending_approval") {
    return { ok: false, code: "not_pending", message: `Invoice is already ${invoice.status}.` };
  }

  const approver = await db.query.members.findFirst({ where: eq(members.id, input.approverId) });
  if (!approver) return { ok: false, code: "not_eligible", message: "Unknown approver." };

  const decision = await routeInvoice(invoice);
  const existing = await db.query.approvals.findFirst({
    where: and(eq(approvals.invoiceId, invoice.id), eq(approvals.approverId, approver.id)),
  });

  let attestationId: string | null = null;
  let ageSec: number | null = null;
  if (input.decision === "approve" && decision.requiredAttestation) {
    const att = await freshAttestation(approver.id, invoice.id, decision.attestationMaxAgeSec);
    if (att) {
      attestationId = att.id;
      ageSec = Math.floor((Date.now() - att.createdAt.getTime()) / 1000);
    }
  }

  const gate = gateApproval({
    decision,
    approver,
    submitterId: invoice.submitterId,
    alreadyDecided: Boolean(existing),
    attestationAgeSec: ageSec,
  });

  if (!gate.allowed) {
    const needsSelfie = gate.code === "attestation_required" || gate.code === "attestation_stale";
    return {
      ok: false,
      code: gate.code,
      message: gate.message,
      ...(needsSelfie
        ? { verifyUrl: `${env.appUrl()}/verify/${invoice.id}?member=${approver.id}` }
        : {}),
    };
  }

  await db.insert(approvals).values({
    id: id("apr"),
    invoiceId: invoice.id,
    approverId: approver.id,
    decision: input.decision,
    note: input.note,
    attestationId,
  });

  if (input.decision === "reject") {
    await db.update(invoices).set({ status: "rejected" }).where(eq(invoices.id, invoice.id));
    await audit({
      orgId: invoice.orgId, actorId: approver.id, subject: `invoice:${invoice.id}`,
      event: "invoice.rejected", data: { note: input.note },
    });
    return { ok: true, invoice: { ...invoice, status: "rejected" }, fullyApproved: false };
  }

  const collected = (
    await db.select().from(approvals).where(and(eq(approvals.invoiceId, invoice.id), eq(approvals.decision, "approve")))
  ).length;

  const fullyApproved = collected >= decision.requiredApprovals;
  if (fullyApproved) {
    await db.update(invoices).set({ status: "approved" }).where(eq(invoices.id, invoice.id));
  }

  await audit({
    orgId: invoice.orgId, actorId: approver.id, subject: `invoice:${invoice.id}`,
    event: "invoice.approved",
    data: { collected, required: decision.requiredApprovals, attestationId },
  });

  return {
    ok: true,
    invoice: { ...invoice, status: fullyApproved ? "approved" : "pending_approval" },
    collected,
    required: decision.requiredApprovals,
    fullyApproved,
  };
}

/* ----------------------------------------------------------- execute pay */

export async function executePayout(invoiceId: string): Promise<{
  ok: boolean; intentId?: string; txHash?: string; error?: string;
}> {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return { ok: false, error: "not_found" };
  if (invoice.status !== "approved") return { ok: false, error: `invoice is ${invoice.status}` };

  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, invoice.orgId) });
  if (!org?.treasuryWalletId) return { ok: false, error: "org has no treasury wallet" };
  if (!invoice.payeeAddress) return { ok: false, error: "invoice has no payee address" };

  if (env.demo()) {
    const fake = `0xdemo${id("tx", 12).replace(/[^a-f0-9]/g, "0")}`;
    await db.update(invoices)
      .set({ status: "paid", txHash: fake, paidAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    await audit({ orgId: invoice.orgId, subject: `invoice:${invoice.id}`, event: "invoice.paid", data: { demo: true } });
    return { ok: true, txHash: fake };
  }

  const privy = new PrivyClient();
  try {
    const intent = await privy.createTransferIntent({
      walletId: org.treasuryWalletId,
      to: invoice.payeeAddress,
      amount: toBaseUnits(invoice.amount),
      asset: "usdc",
      caip2: caip2(env.chain.id()),
      externalId: invoice.id,
    });

    await db.update(invoices)
      .set({ status: "scheduled", privyIntentId: intent.id })
      .where(eq(invoices.id, invoice.id));

    await audit({
      orgId: invoice.orgId, subject: `invoice:${invoice.id}`, event: "payout.intent_created",
      data: { intentId: intent.id, status: intent.status },
    });

    return { ok: true, intentId: intent.id };
  } catch (err) {
    await db.update(invoices).set({ status: "failed" }).where(eq(invoices.id, invoice.id));
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Poll a scheduled payout's intent and settle the invoice when it executes. */
export async function syncPayout(invoiceId: string) {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice?.privyIntentId) return null;

  const intent = await new PrivyClient().getIntent(invoice.privyIntentId);
  const hash = intent.execution?.transaction_hash ?? intent.execution?.hash;

  if (hash) {
    await db.update(invoices)
      .set({ status: "paid", txHash: hash, paidAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    await audit({ orgId: invoice.orgId, subject: `invoice:${invoice.id}`, event: "invoice.paid", data: { txHash: hash } });
  }
  return intent;
}
