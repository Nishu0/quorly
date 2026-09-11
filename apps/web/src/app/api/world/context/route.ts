import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-server";
import { eq } from "drizzle-orm";
import { db, invoices } from "@quorly/core/db";
import { createChallenge, env, CHALLENGE_TTL_SEC } from "@quorly/core";

/**
 * Mints an rp_context for one approval.
 *
 * The signing key never leaves the server, and the nonce inside the signature
 * is recorded as a single-use challenge bound to this invoice and this
 * approver — so the proof that comes back can only belong to this approval.
 */
export async function POST(req: Request) {
  const { invoiceId, memberId } = (await req.json()) as {
    invoiceId: string;
    memberId: string;
  };

  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "pending_approval") {
    return NextResponse.json({ error: `invoice is ${invoice.status}` }, { status: 409 });
  }

  const signingKey = env.world.signingKey();
  const rpId = env.world.rpId();
  if (!signingKey || !rpId) {
    return NextResponse.json({ error: "world_not_configured" }, { status: 503 });
  }

  const action = env.world.action();
  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: signingKey,
    action,
    ttl: CHALLENGE_TTL_SEC,
  });

  await createChallenge({
    invoiceId,
    memberId,
    nonce,
    action,
    expiresAt: new Date(expiresAt * 1000),
  });

  return NextResponse.json({
    rp_context: {
      rp_id: rpId,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      signature: sig,
    },
    action,
    signal: `${invoiceId}:${memberId}`,
    environment: env.world.environment(),
  });
}
