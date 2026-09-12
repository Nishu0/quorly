import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, invoices } from "@quorly/core/db";
import { recordAttestation, decide, executePayout, type IDKitResult } from "@quorly/core";
import { currentMember } from "@/lib/session";

/**
 * One endpoint does the whole checkpoint: consume the single-use challenge,
 * verify the World ID proof server-side, then let the policy engine record the
 * approval it now unblocks. There is no window where a proof is accepted but
 * the approval isn't.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { invoiceId: string; result: IDKitResult };

  // Who is approving is decided here, from a verified session — never from the
  // request body, which the caller controls.
  const approver = await currentMember();
  if (!approver) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });

  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, body.invoiceId) });
  if (!invoice) return NextResponse.json({ ok: false, error: "invoice not found" }, { status: 404 });

  const att = await recordAttestation({
    orgId: invoice.orgId,
    memberId: approver.id,
    invoiceId: body.invoiceId,
    result: body.result,
  });

  if (!att.ok) {
    const human: Record<string, string> = {
      proof_replayed: "That proof was already used. Start a fresh Selfie Check.",
      challenge_spent: "That check was already submitted. Start a fresh one.",
      challenge_expired: "That check expired. Please verify again.",
      challenge_mismatch: "That proof belongs to a different approval.",
      unknown_challenge: "We didn't issue that check. Start again from the approval card.",
    };
    return NextResponse.json(
      { ok: false, error: human[att.error ?? ""] ?? att.error },
      { status: 400 },
    );
  }

  const outcome = await decide({
    invoiceId: body.invoiceId,
    approverId: approver.id,
    decision: "approve",
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.message }, { status: 400 });
  }

  if (outcome.fullyApproved) await executePayout(body.invoiceId);

  return NextResponse.json({
    ok: true,
    collected: outcome.collected,
    required: outcome.required,
    fullyApproved: outcome.fullyApproved,
  });
}
