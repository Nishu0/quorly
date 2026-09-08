/**
 * World ID verification — Selfie Check.
 *
 * Selfie Check is a *medium*-assurance credential: liveness + facial similarity,
 * valid for a 90-day window, with no one-person-one-account guarantee. That makes
 * it exactly right for what we use it for — proving a live human is behind an
 * approval click at the moment money moves — and wrong for identity or Sybil
 * resistance. We never treat it as identity: the approver's *authority* comes
 * from the Privy key quorum, and Selfie Check only proves the click was live.
 *
 * Docs: https://docs.world.org/world-id/credentials/11
 */
import { env } from "./env";

export interface WorldProof {
  proof: string;
  merkle_root?: string;
  nullifier_hash: string;
  verification_level?: string;
  credential_type?: string;
}

export interface VerifyResult {
  ok: boolean;
  nullifier: string;
  verificationLevel: string;
  raw: Record<string, unknown>;
  error?: string;
}

/** Verify server-side. NEVER call this from the browser — it needs the RP key. */
export async function verifySelfieCheck(input: {
  proof: WorldProof;
  action: string;
  signal: string;
}): Promise<VerifyResult> {
  const rpId = env.world.rpId();
  const signingKey = env.world.signingKey();

  // Demo mode: sandbox access is gated, so let the flow run end-to-end without it.
  if (env.demo() || !rpId) {
    return {
      ok: true,
      nullifier: input.proof.nullifier_hash || `demo_${input.signal}`,
      verificationLevel: input.proof.verification_level ?? "selfie_check_demo",
      raw: { demo: true, action: input.action, signal: input.signal },
    };
  }

  const res = await fetch(`${env.world.base()}/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signingKey}`,
    },
    body: JSON.stringify({
      action: input.action,
      signal: input.signal,
      proof: input.proof.proof,
      nullifier_hash: input.proof.nullifier_hash,
      merkle_root: input.proof.merkle_root,
      verification_level: input.proof.verification_level ?? "selfie_check",
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      nullifier: input.proof.nullifier_hash,
      verificationLevel: String(input.proof.verification_level ?? ""),
      raw,
      error: String(raw.code ?? raw.detail ?? res.status),
    };
  }

  return {
    ok: true,
    nullifier: input.proof.nullifier_hash,
    verificationLevel: String(raw.verification_level ?? input.proof.verification_level ?? "selfie_check"),
    raw,
  };
}

/** Selfie Check credentials go stale after 90 days of inactivity. */
export const SELFIE_CHECK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The signal binds the proof to one specific invoice + approver, so a proof
 * captured for invoice A can never be replayed to approve invoice B.
 */
export function approvalSignal(invoiceId: string, memberId: string): string {
  return `${invoiceId}:${memberId}`;
}
