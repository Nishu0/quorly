/**
 * Seeds a demo org: Acme Labs, three humans, three policy tiers, one open
 * invoice. Run with `bun run seed`.
 */
import { db } from "./db";
import { members, orgs, policies, connections } from "./db/schema";
import { id } from "./ids";
import { DEFAULT_POLICY_TIERS } from "./policy";

const orgId = "org_demo_acme";

await db.insert(orgs).values({
  id: orgId,
  name: "Acme Labs",
  ensName: "acmelabs.eth",
  slackTeamId: process.env.SEED_SLACK_TEAM_ID ?? null,
}).onConflictDoNothing();

const people = [
  { key: "owner", email: "dana@acme.test", name: "Dana (CFO)", role: "owner" as const, ens: "dana.acmelabs.eth" },
  { key: "approver", email: "mel@acme.test", name: "Mel (Eng Manager)", role: "approver" as const, ens: "mel.acmelabs.eth" },
  { key: "contractor", email: "priya@acme.test", name: "Priya (Contractor)", role: "member" as const, ens: "priya.acmelabs.eth" },
];

for (const p of people) {
  const slackUserId = process.env[`SEED_SLACK_${p.key.toUpperCase()}`] ?? null;

  await db.insert(members).values({
    id: `mem_demo_${p.key}`,
    orgId,
    email: p.email,
    name: p.name,
    role: p.role,
    ensSubname: p.ens,
    slackUserId,
    walletAddress: null,
  }).onConflictDoUpdate({
    // Re-running the seed is how you link Slack accounts, so this has to
    // update rather than skip — but only when an id was actually supplied.
    target: members.id,
    set: slackUserId ? { slackUserId } : { name: p.name },
  });

  if (slackUserId) console.log(`  linked ${p.name} -> ${slackUserId}`);
}

for (const tier of DEFAULT_POLICY_TIERS) {
  await db.insert(policies).values({
    id: `pol_demo_${tier.name.toLowerCase().replace(/\s+/g, "_")}`,
    orgId,
    name: tier.name,
    maxAmount: tier.maxAmount,
    requiredApprovals: tier.requiredApprovals,
    approverRoles: [...tier.approverRoles],
    requiredAttestation: tier.requiredAttestation,
    attestationMaxAgeSec: tier.attestationMaxAgeSec,
  }).onConflictDoNothing();
}

await db.insert(connections).values({
  id: id("con"), orgId, provider: "bill", status: "disconnected", config: {},
}).onConflictDoNothing();

console.log("Seeded org", orgId, "with", people.length, "members and", DEFAULT_POLICY_TIERS.length, "policy tiers.");
process.exit(0);
