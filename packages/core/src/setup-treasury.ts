/**
 * Provisions the org's treasury on Privy, end to end.
 *
 *   bun run setup:treasury            # 2-of-3 quorum (Dana, Mel, + the server)
 *   bun run setup:treasury 2 3        # threshold, key count
 *
 * The important property: every authorization private key is generated *here*,
 * on your machine. Privy only ever receives the public halves. That is what
 * makes the treasury non-custodial with respect to Privy — their enclave can
 * hold the wallet, but it cannot move funds without signatures it can't produce.
 */
import { generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { orgs, policies } from "./db/schema";
import { PrivyClient, buildTreasuryPolicyRules } from "./privy";
import { invoices, members } from "./db/schema";
import { toBaseUnits } from "./money";
import { env } from "./env";

const threshold = Number(process.argv[2] ?? 2);
const keyCount = Number(process.argv[3] ?? 3);
const orgId = process.env.SETUP_ORG_ID ?? "org_demo_acme";

if (threshold > keyCount) {
  console.error(`Threshold ${threshold} exceeds ${keyCount} keys — nobody could ever sign.`);
  process.exit(1);
}

/** P-256 keypair. Public half is base64 DER (SPKI), which is what Privy wants. */
function authorizationKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicKey: publicKey.toString("base64"),
    privateKey: privateKey.toString("base64"),
  };
}

const org = await db.query.orgs.findFirst({ where: eq(orgs.id, orgId) });
if (!org) {
  console.error(`No org ${orgId}. Run \`bun run seed\` first.`);
  process.exit(1);
}

console.log(`\nProvisioning treasury for ${org.name} — ${threshold}-of-${keyCount} quorum\n`);

const privy = new PrivyClient();

// 1. The quorum: m-of-n signatures required for any wallet action.
// Reuse an existing one so a failed run part-way through doesn't leave orphans.
const existingQuorum = org.treasuryQuorumId ?? env.privy.quorumId();
let quorumId: string;
let keys: { publicKey: string; privateKey: string }[] = [];

if (existingQuorum) {
  quorumId = existingQuorum;
  console.log(`  key quorum   ${quorumId} (reusing)`);
} else {
  keys = Array.from({ length: keyCount }, authorizationKeypair);
  const quorum = await privy.createKeyQuorum({
    displayName: `${org.name} treasury`,
    publicKeys: keys.map((k) => k.publicKey),
    threshold,
  });
  quorumId = quorum.id;
  console.log(`  key quorum   ${quorumId}`);
}

// 2. The policy: enclave-enforced, so it holds even if our server is owned.
const tiers = await db.select().from(policies).where(eq(policies.orgId, orgId));
const ceiling = tiers.reduce((max, t) => Math.max(max, Number(t.maxAmount)), 0);

const roster = await db.select().from(members).where(eq(members.orgId, orgId));
const filed = await db.select().from(invoices).where(eq(invoices.orgId, orgId));
const allowedRecipients = [
  ...new Set(
    [...roster.map((m) => m.walletAddress), ...filed.map((i) => i.payeeAddress)]
      .filter((a): a is string => Boolean(a)),
  ),
];

const policy = await privy.createPolicy({
  name: `${org.name} treasury rules`.slice(0, 50),
  rules: buildTreasuryPolicyRules({
    usdcAddress: env.chain.usdc(),
    allowedRecipients,
    maxAmountBaseUnits: ceiling > 0 ? BigInt(toBaseUnits(String(ceiling))) : undefined,
  }),
});
console.log(`  policy       ${policy.id}`);
console.log(`               USDC only, max $${ceiling.toLocaleString()} per transfer`);
console.log(`               ${allowedRecipients.length
  ? `${allowedRecipients.length} allowlisted payee(s)`
  : "no payee allowlist yet — add member wallets, then re-run"}`);

// 3. The wallet, owned by the quorum and bound to the policy.
const wallet = await privy.createWallet({
  chainType: "ethereum",
  displayName: `${org.name} treasury`,
  externalId: `treasury_${orgId}`,
  ownerId: quorumId,
  policyIds: [policy.id],
});
console.log(`  wallet       ${wallet.id}`);
console.log(`  address      ${wallet.address}\n`);

await db
  .update(orgs)
  .set({
    treasuryWalletId: wallet.id,
    treasuryAddress: wallet.address,
    treasuryQuorumId: quorumId,
  })
  .where(eq(orgs.id, orgId));

await db.update(policies).set({ privyPolicyId: policy.id }).where(eq(policies.orgId, orgId));

console.log("Add to .env:\n");
console.log(`PRIVY_TREASURY_QUORUM_ID="${quorumId}"`);

if (keys.length > 0) {
  console.log(`PRIVY_AUTHORIZATION_PRIVATE_KEY="${keys[0]!.privateKey}"\n`);
  console.log("The remaining authorization keys — one per human approver.");
  console.log("Shown once, and they never left this machine. Store them safely.\n");
  keys.slice(1).forEach((k, i) => {
    console.log(`  approver ${i + 1}: ${k.privateKey}`);
  });
} else {
  console.log("\n(Quorum was reused, so no new keys were generated.)");
}

console.log(`\nFund the treasury with test USDC at ${wallet.address} (Base Sepolia).`);
console.log("Faucet: https://faucet.circle.com\n");
process.exit(0);
