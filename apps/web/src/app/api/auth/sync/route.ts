import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, members } from "@quorly/core/db";
import { PrivyClient, primaryEmail, embeddedWallet } from "@quorly/core";
import { privyUserId } from "@/lib/session";

/**
 * Links a freshly signed-in Privy user to their seat on the roster.
 *
 * The email is read from Privy's API using the verified DID, never from the
 * browser — otherwise anyone could sign in and claim the CFO's row.
 */
export async function POST() {
  const sub = await privyUserId();
  if (!sub) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const existing = await db.query.members.findFirst({
    where: eq(members.privyUserId, sub),
  });
  if (existing) {
    return NextResponse.json({ ok: true, memberId: existing.id, role: existing.role });
  }

  let user;
  try {
    user = await new PrivyClient().getUser(sub);
  } catch {
    return NextResponse.json({ error: "could not read your Privy account" }, { status: 502 });
  }

  const email = primaryEmail(user);
  if (!email) {
    return NextResponse.json(
      { error: "Your Privy account has no email, so we can't match you to the roster." },
      { status: 400 },
    );
  }

  // Claim the invited row for this email, but only if nobody holds it yet.
  const [claimed] = await db
    .update(members)
    .set({
      privyUserId: sub,
      walletAddress: embeddedWallet(user)?.address ?? null,
    })
    .where(and(eq(members.email, email), isNull(members.privyUserId)))
    .returning();

  if (!claimed) {
    return NextResponse.json(
      { error: `${email} isn't on any Quorly roster. Ask an owner to invite you.`, email },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, memberId: claimed.id, role: claimed.role });
}
