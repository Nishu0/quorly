/**
 * The approval routing engine.
 *
 * Given an invoice, it answers three questions the Slack bot needs:
 *   1. Which policy tier applies?
 *   2. Who is allowed to approve, and how many of them?
 *   3. Does the approver have to prove they are a live human first?
 */
import type { Invoice, Member, Policy } from "./db/schema";

export interface RoutingDecision {
  policy: Policy;
  requiredApprovals: number;
  eligibleApprovers: Member[];
  requiredAttestation: "selfie_check" | "proof_of_human" | null;
  attestationMaxAgeSec: number;
  reason: string;
}

export class NoPolicyError extends Error {}

/** Pick the lowest tier whose ceiling still covers the amount. */
export function selectPolicy(policies: Policy[], amount: number): Policy {
  const active = policies
    .filter((p) => p.active)
    .sort((a, b) => Number(a.maxAmount) - Number(b.maxAmount));

  const tier = active.find((p) => amount <= Number(p.maxAmount));
  if (tier) return tier;

  const top = active.at(-1);
  if (!top) throw new NoPolicyError("Org has no active approval policy");
  return top; // above every ceiling -> strictest tier applies
}

export function route(input: {
  invoice: Pick<Invoice, "id" | "amount" | "submitterId">;
  policies: Policy[];
  members: Member[];
}): RoutingDecision {
  const amount = Number(input.invoice.amount);
  const policy = selectPolicy(input.policies, amount);
  const roles = new Set(policy.approverRoles);

  let eligible = input.members.filter((m) => roles.has(m.role));

  if (policy.blockSelfApproval) {
    eligible = eligible.filter((m) => m.id !== input.invoice.submitterId);
  }

  const required = Math.min(policy.requiredApprovals, Math.max(eligible.length, 1));

  return {
    policy,
    requiredApprovals: required,
    eligibleApprovers: eligible,
    requiredAttestation: policy.requiredAttestation,
    attestationMaxAgeSec: policy.attestationMaxAgeSec,
    reason:
      `$${amount.toLocaleString()} matches "${policy.name}" ` +
      `(ceiling $${Number(policy.maxAmount).toLocaleString()}) → ` +
      `${required} of ${eligible.length} ${[...roles].join("/")} must approve` +
      (policy.requiredAttestation ? `, each with a live ${policy.requiredAttestation.replace("_", " ")}` : ""),
  };
}

export interface GateResult {
  allowed: boolean;
  code?:
    | "not_eligible"
    | "self_approval"
    | "already_decided"
    | "attestation_required"
    | "attestation_stale";
  message?: string;
}

/** Final check right before an approval is recorded. */
export function gateApproval(input: {
  decision: RoutingDecision;
  approver: Member;
  submitterId: string;
  alreadyDecided: boolean;
  attestationAgeSec: number | null;
}): GateResult {
  if (input.approver.id === input.submitterId && input.decision.policy.blockSelfApproval) {
    return { allowed: false, code: "self_approval", message: "You can't approve your own invoice." };
  }
  if (!input.decision.eligibleApprovers.some((m) => m.id === input.approver.id)) {
    return { allowed: false, code: "not_eligible", message: "You're not an approver on this policy tier." };
  }
  if (input.alreadyDecided) {
    return { allowed: false, code: "already_decided", message: "You've already decided on this invoice." };
  }
  if (input.decision.requiredAttestation) {
    if (input.attestationAgeSec === null) {
      return {
        allowed: false,
        code: "attestation_required",
        message: "Complete a Selfie Check to approve this payout.",
      };
    }
    if (input.attestationAgeSec > input.decision.attestationMaxAgeSec) {
      return {
        allowed: false,
        code: "attestation_stale",
        message: "Your Selfie Check has expired. Please verify again.",
      };
    }
  }
  return { allowed: true };
}

/** Default rulebook seeded for every new org. */
export const DEFAULT_POLICY_TIERS = [
  {
    name: "Fast lane",
    maxAmount: "500",
    requiredApprovals: 1,
    approverRoles: ["approver", "owner"],
    requiredAttestation: null,
    attestationMaxAgeSec: 300,
  },
  {
    name: "Standard",
    maxAmount: "5000",
    requiredApprovals: 1,
    approverRoles: ["approver", "owner"],
    requiredAttestation: "selfie_check" as const,
    attestationMaxAgeSec: 300,
  },
  {
    name: "High value",
    maxAmount: "25000",
    requiredApprovals: 2,
    approverRoles: ["approver", "owner"],
    requiredAttestation: "selfie_check" as const,
    attestationMaxAgeSec: 180,
  },
] as const;
