import { cookies, headers } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, members, type Member } from "@quorly/core/db";

const appId = () => process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

/**
 * Privy signs access tokens with ES256 and publishes the public half at a
 * per-app JWKS endpoint. Verifying against that — rather than trusting a claim
 * the browser sent — is what makes a session a session.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keySet() {
  jwks ??= createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId()}/jwks.json`),
  );
  return jwks;
}

/** The Privy DID of the signed-in user, or null. Never throws. */
export async function privyUserId(): Promise<string | null> {
  const jar = await cookies();
  const bearer = (await headers()).get("authorization");

  const token =
    jar.get("privy-token")?.value ??
    (bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined);

  if (!token || !appId()) return null;

  try {
    const { payload } = await jwtVerify(token, keySet(), {
      issuer: "privy.io",
      audience: appId(),
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * The member row for the signed-in user.
 *
 * This is the only thing that may decide who is acting. Reading an identity out
 * of a query parameter — as an earlier version of the approval page did — means
 * anyone holding the link can approve as anyone.
 */
export async function currentMember(): Promise<Member | null> {
  const sub = await privyUserId();
  if (!sub) return null;
  const member = await db.query.members.findFirst({
    where: eq(members.privyUserId, sub),
  });
  return member ?? null;
}

export async function requireMember(): Promise<Member> {
  const member = await currentMember();
  if (!member) throw new UnauthorizedError();
  return member;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
