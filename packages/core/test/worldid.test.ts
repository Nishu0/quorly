import { describe, expect, test } from "bun:test";
import { approvalSignal, verifySelfieCheck, SELFIE_CHECK_TTL_MS } from "../src/worldid";

describe("approvalSignal", () => {
  test("binds a proof to exactly one invoice and one approver", () => {
    expect(approvalSignal("inv_1", "mel")).toBe("inv_1:mel");
  });

  test("a proof for one invoice cannot match another", () => {
    expect(approvalSignal("inv_1", "mel")).not.toBe(approvalSignal("inv_2", "mel"));
  });

  test("a proof for one approver cannot match another on the same invoice", () => {
    expect(approvalSignal("inv_1", "mel")).not.toBe(approvalSignal("inv_1", "dana"));
  });
});

describe("verifySelfieCheck (demo mode)", () => {
  test("passes through without a relying-party key so the flow is demoable", async () => {
    const r = await verifySelfieCheck({
      proof: { proof: "x", nullifier_hash: "nh_1" },
      action: "approve-payout",
      signal: "inv_1:mel",
    });
    expect(r.ok).toBe(true);
    expect(r.nullifier).toBe("nh_1");
  });

  test("still yields a distinct nullifier per signal, so replay tests stay meaningful", async () => {
    const a = await verifySelfieCheck({ proof: { proof: "x", nullifier_hash: "" }, action: "a", signal: "inv_1:mel" });
    const b = await verifySelfieCheck({ proof: { proof: "x", nullifier_hash: "" }, action: "a", signal: "inv_2:mel" });
    expect(a.nullifier).not.toBe(b.nullifier);
  });
});

test("selfie check credentials expire after 90 days", () => {
  expect(SELFIE_CHECK_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
});
