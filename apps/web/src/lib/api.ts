import { cookies, headers } from "next/headers";

/**
 * The Go server is the only thing that reads the database now. The web app is
 * a client: it forwards the viewer's Privy token and renders what comes back,
 * so authorisation is decided in exactly one place.
 */
const BASE = process.env.QUORLY_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Server-side fetch that carries the caller's session through to Go. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const jar = await cookies();
  const auth = (await headers()).get("authorization");

  const token = jar.get("privy-token")?.value;
  const h = new Headers(init.headers);
  h.set("Content-Type", "application/json");
  if (token) h.set("Cookie", `privy-token=${token}`);
  if (auth) h.set("Authorization", auth);

  const res = await fetch(BASE + path, {
    ...init,
    headers: h,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      /* keep the raw body */
    }
    throw new ApiError(res.status, message);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Returns null instead of throwing when the viewer simply isn't signed in. */
export async function apiOrNull<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) return null;
    throw err;
  }
}

/* ------------------------------------------------------------------- types */

export interface Member {
  id: string;
  orgId: string;
  email: string;
  name: string | null;
  role: string;
  ensSubname: string | null;
  walletAddress: string | null;
  slackUserId: string | null;
  pending?: boolean;
  createdAt?: string;
}

export interface Invoice {
  id: string;
  number: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  payeeAddress: string | null;
  payeeEns: string | null;
  requiredApprovals: number;
  privyIntentId: string | null;
  txHash: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface Routing {
  policy: string;
  requiredApprovals: number;
  requiredAttestation: string | null;
  reason: string;
  eligibleApprovers: { id: string; name: string }[];
}

export interface Policy {
  ID: string;
  Name: string;
  Active: boolean;
  MaxAmount: number;
  Currency: string;
  RequiredApprovals: number;
  ApproverRoles: string[];
  RequiredAttestation: string | null;
  AttestationMaxAgeSec: number;
  BlockSelfApproval: boolean;
  PrivyPolicyID: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  UpdatedBy: string | null;
}

export interface Approval {
  ID: string;
  ApproverID: string;
  Decision: string;
  Note: string | null;
  AttestationID: string | null;
  CreatedAt: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  event: string;
  createdAt: string;
}
