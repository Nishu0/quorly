import { describe, expect, test } from "bun:test";
import { gateApproval, route, selectPolicy, NoPolicyError } from "../src/policy";
import { DANA, MEL, PRIYA, ROSTER, TIERS, member, policy } from "./fixtures";

const invoice = (amount: string, submitterId = PRIYA.id) => ({
  id: "inv_1", amount, submitterId,
});

describe("selectPolicy", () => {
  test("picks the cheapest tier that still covers the amount", () => {
    expect(selectPolicy(TIERS, 100).name).toBe("Fast lane");
    expect(selectPolicy(TIERS, 500).name).toBe("Fast lane");   // boundary is inclusive
    expect(selectPolicy(TIERS, 501).name).toBe("Standard");
    expect(selectPolicy(TIERS, 5000).name).toBe("Standard");
    expect(selectPolicy(TIERS, 5001).name).toBe("High value");
  });

  test("an amount above every ceiling falls to the strictest tier, never to none", () => {
    expect(selectPolicy(TIERS, 10_000_000).name).toBe("High value");
  });

  test("ignores inactive tiers", () => {
    const tiers = [policy({ id: "p_off", name: "Fast lane", maxAmount: "500", active: false }), TIERS[1]!];
    expect(selectPolicy(tiers, 100).name).toBe("Standard");
  });

  test("throws when the org has no active policy at all", () => {
    expect(() => selectPolicy([], 100)).toThrow(NoPolicyError);
  });
});

describe("route", () => {
  test("the submitter is never among the eligible approvers", () => {
    const d = route({ invoice: invoice("2400", MEL.id), policies: TIERS, members: ROSTER });
    expect(d.eligibleApprovers.map((m) => m.id)).toEqual([DANA.id]);
  });

  test("members without an approver role are excluded", () => {
    const d = route({ invoice: invoice("100"), policies: TIERS, members: ROSTER });
    expect(d.eligibleApprovers.map((m) => m.id).sort()).toEqual([DANA.id, MEL.id].sort());
  });

  test("required approvals never exceed the number of people who can give them", () => {
    const d = route({ invoice: invoice("20000", DANA.id), policies: TIERS, members: ROSTER });
    expect(d.policy.name).toBe("High value");
    expect(d.eligibleApprovers).toHaveLength(1); // only Mel is left
    expect(d.requiredApprovals).toBe(1);         // clamped down from 2, not deadlocked
  });

  test("carries the tier's attestation requirement", () => {
    expect(route({ invoice: invoice("100"), policies: TIERS, members: ROSTER }).requiredAttestation).toBeNull();
    expect(route({ invoice: invoice("2400"), policies: TIERS, members: ROSTER }).requiredAttestation).toBe("selfie_check");
  });

  test("explains itself in one human-readable line", () => {
    const d = route({ invoice: invoice("2400"), policies: TIERS, members: ROSTER });
    expect(d.reason).toContain("Standard");
    expect(d.reason).toContain("selfie check");
  });
});

describe("gateApproval", () => {
  const base = route({ invoice: invoice("2400"), policies: TIERS, members: ROSTER });

  const gate = (over: Partial<Parameters<typeof gateApproval>[0]> = {}) =>
    gateApproval({
      decision: base,
      approver: MEL,
      submitterId: PRIYA.id,
      alreadyDecided: false,
      attestationAgeSec: 10,
      ...over,
    });

  test("allows a fresh, eligible, first-time approval", () => {
    expect(gate().allowed).toBe(true);
  });

  test("blocks self-approval", () => {
    const d = route({ invoice: invoice("2400", MEL.id), policies: TIERS, members: ROSTER });
    expect(gate({ decision: d, submitterId: MEL.id }).code).toBe("self_approval");
  });

  test("blocks someone who isn't an approver on this tier", () => {
    // Not the submitter, so this can only be the role check firing.
    const sam = member({ id: "sam", role: "finance" });
    expect(gate({ approver: sam }).code).toBe("not_eligible");
  });

  test("blocks a second decision from the same approver", () => {
    expect(gate({ alreadyDecided: true }).code).toBe("already_decided");
  });

  test("blocks approval with no selfie check when the tier demands one", () => {
    expect(gate({ attestationAgeSec: null }).code).toBe("attestation_required");
  });

  test("blocks a stale selfie check", () => {
    expect(gate({ attestationAgeSec: 301 }).code).toBe("attestation_stale");
    expect(gate({ attestationAgeSec: 299 }).allowed).toBe(true);
  });

  test("the fast lane needs no attestation at all", () => {
    const d = route({ invoice: invoice("100"), policies: TIERS, members: ROSTER });
    expect(gate({ decision: d, attestationAgeSec: null }).allowed).toBe(true);
  });
});
