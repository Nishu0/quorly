/**
 * World ID verification — Selfie Check (World ID 4.0 request flow).
 *
 * Selfie Check is a *medium*-assurance credential: liveness + facial similarity,
 * valid for a 90-day window, with no one-person-one-account guarantee. That makes
 * it exactly right for what we use it for — proving a live human is behind an
 * approval click at the moment money moves — and wrong for identity or Sybil
 * resistance. We never treat it as identity: the approver's *authority* comes
 * from the Privy key quorum, and Selfie Check only proves the click was live.
 *
 * Docs: https://docs.world.org/world-id/credentials/11
 *       https://docs.world.org/api-reference/developer-portal/verify
 */
import { env } from "./env";

/** The complete result IDKit hands back. Forward it verbatim — do not remap. */
export interface IDKitResult {
  protocol_version: string;
  nonce: string;
  responses: unknown[];
  user_presence_completed?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  nullifier: string;
  environment: string;
  raw: Record<string, unknown>;
  error?: string;
  detail?: string;
}

/**
 * Verify server-side. Never call this from the browser.
 *
 * The v4 endpoint takes the whole IDKit result plus the action, and returns the
 * authoritative nullifier — we use *that*, never one the client sent us.
 */
export async function verifySelfieCheck(input: {
  result: IDKitResult;
  action: string;
}): Promise<VerifyResult> {
  const rpId = env.world.rpId();

  // Selfie Check access is gated, so keep the flow demoable without it.
  if (env.demo() || !rpId) {
    return {
      ok: true,
      nullifier: `demo_${input.result.nonce}`,
      environment: "demo",
      raw: { demo: true, action: input.action },
    };
  }

  const res = await fetch(`${env.world.base()}/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input.result,
      action: input.action,
      environment: env.world.environment(),
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok || raw.success !== true) {
    return {
      ok: false,
      nullifier: "",
      environment: String(raw.environment ?? ""),
      raw,
      error: String(raw.code ?? res.status),
      detail: typeof raw.detail === "string" ? raw.detail : undefined,
    };
  }

  return {
    ok: true,
    nullifier: String(raw.nullifier ?? ""),
    environment: String(raw.environment ?? env.world.environment()),
    raw,
  };
}

/** Selfie Check credentials go stale after 90 days of inactivity. */
export const SELFIE_CHECK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** How long a minted challenge stays valid. Matches IDKit's default RP TTL. */
export const CHALLENGE_TTL_SEC = 300;

/**
 * The signal binds the proof to one specific invoice + approver, so a proof
 * captured for invoice A can never be replayed to approve invoice B.
 */
export function approvalSignal(invoiceId: string, memberId: string): string {
  return `${invoiceId}:${memberId}`;
}

/** Human-readable copy for the error codes the verifier can return. */
export function explainVerifyError(code?: string, detail?: string): string {
  switch (code) {
    case "all_verifications_failed":
      return "The Selfie Check didn't pass. Try again in better lighting.";
    case "verification_error":
      return "That proof couldn't be verified. Please start a fresh check.";
    case "app_not_migrated":
      return "This app isn't on World ID 4.0 yet — check the Developer Portal.";
    case "user_presence_failed":
      return "Liveness check failed. Make sure it's you in front of the camera.";
    default:
      return detail ?? `Selfie Check failed${code ? ` (${code})` : ""}.`;
  }
}
