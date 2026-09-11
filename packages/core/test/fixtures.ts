import type { Member, Policy } from "../src/db/schema";

export function member(over: Partial<Member> & Pick<Member, "id" | "role">): Member {
  return {
    orgId: "org_1",
    email: `${over.id}@acme.test`,
    name: over.id,
    slackUserId: null,
    privyUserId: null,
    walletId: null,
    walletAddress: null,
    authorizationKeyId: null,
    ensSubname: null,
    worldNullifier: null,
    createdAt: new Date(),
    ...over,
  } as Member;
}

export function policy(over: Partial<Policy> & Pick<Policy, "id" | "name" | "maxAmount">): Policy {
  return {
    orgId: "org_1",
    active: true,
    currency: "USDC",
    requiredApprovals: 1,
    approverRoles: ["approver", "owner"],
    requiredAttestation: null,
    attestationMaxAgeSec: 300,
    blockSelfApproval: true,
    privyPolicyId: null,
    createdAt: new Date(),
    ...over,
  } as Policy;
}

/** The seeded three-tier rulebook, as objects. */
export const TIERS = [
  policy({ id: "p_fast", name: "Fast lane", maxAmount: "500" }),
  policy({ id: "p_std", name: "Standard", maxAmount: "5000", requiredAttestation: "selfie_check" }),
  policy({
    id: "p_high", name: "High value", maxAmount: "25000",
    requiredApprovals: 2, requiredAttestation: "selfie_check", attestationMaxAgeSec: 180,
  }),
];

export const DANA = member({ id: "dana", role: "owner" });
export const MEL = member({ id: "mel", role: "approver" });
export const PRIYA = member({ id: "priya", role: "member" });
export const ROSTER = [DANA, MEL, PRIYA];
