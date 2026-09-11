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
  });

  test("pins the destination contract to USDC", () => {
    const r = rules.find((x) => x.name.includes("USDC"))!;
    expect(r.conditions[0]!.value).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(r.action).toBe("ALLOW");
  });

  test("restricts transfer recipients to the allowlist", () => {
    const r = rules.find((x) => x.name.includes("Allowlisted"))!;
    expect(r.conditions[0]!.field).toBe("transfer.recipient");
    expect(r.conditions[0]!.value).toEqual(["0xpriya"]);
  });
});
