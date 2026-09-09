import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, invoices } from "@quorly/core/db";
import { recordAttestation, decide, executePayout } from "@quorly/core";

/**
 * One endpoint does the whole checkpoint: verify the World ID proof server-side,
 * bank it against a UNIQUE (action, nullifier) index so it can't be replayed,
 * then let the policy engine record the approval it now unblocks.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    invoiceId: string;
    memberId: string;
    proof: { proof: string; nullifier_hash: string; merkle_root?: string; verification_level?: string };
  };

  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, body.invoiceId) });
  if (!invoice) return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });

  const att = await recordAttestation({
    orgId: invoice.orgId,
    memberId: body.memberId,
    invoiceId: body.invoiceId,
    proof: body.proof,
  });

  if (!att.ok) {
    const human =
      att.error === "proof_replayed"
        ? "That proof was already used. Start a fresh Selfie Check."
        : `Selfie Check failed (${att.error}).`;
    return NextResponse.json({ ok: false, error: human }, { status: 400 });
  }

  const outcome = await decide({
    invoiceId: body.invoiceId,
    approverId: body.memberId,
    decision: "approve",
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.message }, { status: 400 });
  }

  if (outcome.fullyApproved) {
    await executePayout(body.invoiceId);
  }

  return NextResponse.json({
    ok: true,
    collected: outcome.collected,
    required: outcome.required,
    fullyApproved: outcome.fullyApproved,
  });
}
