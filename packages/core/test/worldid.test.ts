import { describe, expect, test } from "bun:test";
import { approvalSignal, explainVerifyError, verifySelfieCheck, SELFIE_CHECK_TTL_MS } from "../src/worldid";

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
  const result = (nonce: string) => ({ protocol_version: "3.0", nonce, responses: [] });

  test("passes through without a relying-party key so the flow is demoable", async () => {
    const r = await verifySelfieCheck({ result: result("n_1"), action: "approve-payout" });
    expect(r.ok).toBe(true);
    expect(r.environment).toBe("demo");
  });

  test("derives the nullifier from the challenge nonce, so each check is distinct", async () => {
    const a = await verifySelfieCheck({ result: result("n_1"), action: "a" });
    const b = await verifySelfieCheck({ result: result("n_2"), action: "a" });
    expect(a.nullifier).not.toBe(b.nullifier);
  });
});

describe("explainVerifyError", () => {
  test("turns verifier codes into copy a manager can act on", () => {
    expect(explainVerifyError("all_verifications_failed")).toContain("lighting");
    expect(explainVerifyError("user_presence_failed")).toContain("Liveness");
  });

  test("falls back to the verifier's own detail when the code is unknown", () => {
    expect(explainVerifyError("weird_code", "Something specific")).toBe("Something specific");
  });
});

test("selfie check credentials expire after 90 days", () => {
  expect(SELFIE_CHECK_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
});
