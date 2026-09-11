import { describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { authorizationSignature, buildTreasuryPolicyRules, canonicalJson } from "../src/privy";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const req = {
  method: "POST",
  url: "https://api.privy.io/v1/wallets/w_1/transfer",
  body: { amount: "2400000000", recipient: "0xabc" },
  appId: "app_1",
  privateKey,
};

/**
 * Reimplemented independently of the source, on purpose: if the test imported
 * the module's own serializer, a bug in it would cancel out on both sides and
 * the test would pass while the real signature covered nothing.
 */
function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}

function verify(sig: string, over: Partial<typeof req> = {}) {
  const payload = {
    version: 1,
    method: (over.method ?? req.method).toUpperCase(),
    url: over.url ?? req.url,
    body: over.body ?? req.body,
    headers: { "privy-app-id": over.appId ?? req.appId },
  };
  const v = createVerify("SHA256");
  v.update(canon(payload));
  v.end();
  return v.verify(publicKey, Buffer.from(sig, "base64"));
}

describe("authorizationSignature", () => {
  test("produces a P-256 signature Privy's enclave can verify", () => {
    expect(verify(authorizationSignature(req))).toBe(true);
  });

  test("a signature does not carry over to a different recipient", () => {
    const sig = authorizationSignature(req);
    expect(verify(sig, { body: { ...req.body, recipient: "0xattacker" } })).toBe(false);
  });

  test("a signature does not carry over to a different amount", () => {
    const sig = authorizationSignature(req);
    expect(verify(sig, { body: { ...req.body, amount: "999999000000" } })).toBe(false);
  });

  test("a signature does not carry over to a different wallet", () => {
    const sig = authorizationSignature(req);
    expect(verify(sig, { url: "https://api.privy.io/v1/wallets/w_2/transfer" })).toBe(false);
  });

  test("accepts a raw base64 key with Privy's wallet-auth: prefix", () => {
    const raw = privateKey.replace(/-----[A-Z ]+-----|\n/g, "");
    expect(verify(authorizationSignature({ ...req, privateKey: `wallet-auth:${raw}` }))).toBe(true);
  });
});

describe("canonical serialization", () => {
  test("nested transfer fields survive into the signed payload", () => {
    // The bug this guards: an array replacer would render body as "{}".
    expect(canonicalJson({ body: { amount: "1", recipient: "0xabc" } }))
      .toBe('{"body":{"amount":"1","recipient":"0xabc"}}');
  });

  test("key order in the source object does not change the bytes", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe("buildTreasuryPolicyRules", () => {
  const rules = buildTreasuryPolicyRules({
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    allowedRecipients: ["0xpriya"],
    maxAmountBaseUnits: 25_000_000_000n,
  });

  test("emits a single rule, so the conditions AND together", () => {
    // As separate rules each would independently permit a transfer — the
    // opposite of a treasury control.
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toBe("ALLOW");
  });

  test("pins the destination contract to USDC", () => {
    const c = rules[0]!.conditions.find((x) => x.field === "to")!;
    expect(c.value).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  });

  test("caps the transfer amount as hex base units", () => {
    const c = rules[0]!.conditions.find((x) => x.field === "transfer.amount")!;
    expect(c.operator).toBe("lte");
    expect(BigInt(c.value as string)).toBe(25_000_000_000n);
  });

  test("restricts recipients to the allowlist", () => {
    const c = rules[0]!.conditions.find((x) => x.field === "transfer.recipient")!;
    expect(c.value).toEqual(["0xpriya"]);
  });

  test("every calldata condition carries the ABI Privy requires", () => {
    for (const c of rules[0]!.conditions) {
      if (c.field_source === "ethereum_calldata") expect(c.abi).toBeDefined();
    }
  });

  test("omits the payee condition when the allowlist is empty", () => {
    // `in []` would deny every transfer, including legitimate ones.
    const r = buildTreasuryPolicyRules({ usdcAddress: "0xusdc", allowedRecipients: [] });
    expect(r[0]!.conditions.some((c) => c.field === "transfer.recipient")).toBe(false);
    expect(r[0]!.conditions.some((c) => c.field === "to")).toBe(true);
  });
});
