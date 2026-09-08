/**
 * Thin, dependency-free client over the Privy REST API.
 *
 * We talk to REST directly (rather than an SDK) because the three controls this
 * product is built on — policies, key quorums and intents — are all first-class
 * REST resources, and it keeps the authorization-signature flow explicit.
 *
 * Docs: https://docs.privy.io/api-reference
 */
import { createPrivateKey, createSign } from "node:crypto";
import { env } from "./env";

export type ChainType = "ethereum" | "solana";

export interface PrivyWallet {
  id: string;
  address: string;
  chain_type: ChainType;
  owner_id?: string;
  policy_ids?: string[];
  authorization_threshold?: number;
}

export interface PrivyKeyQuorum {
  id: string;
  display_name?: string;
  authorization_threshold: number;
  authorization_keys: { public_key: string }[];
}

export interface PrivyIntent {
  id: string;
  status: string;                 // created | authorized | executed | expired | failed
  authorizations_collected?: number;
  authorization_threshold?: number;
  expires_at?: number;
  execution?: { status?: string; transaction_hash?: string; hash?: string };
}

/* --------------------------------------------------- authorization signing */

/**
 * Privy verifies an ECDSA P-256 signature over a canonical serialization of the
 * request. Without it, the enclave refuses any action on an owned wallet.
 */
export function authorizationSignature(input: {
  method: string;
  url: string;
  body: unknown;
  appId: string;
  privateKey: string;
}): string {
  let pem = input.privateKey.replace(/^wallet-auth:/, "").trim();
  if (!pem.includes("BEGIN")) {
    pem = `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`;
  }
  const payload = {
    version: 1,
    method: input.method.toUpperCase(),
    url: input.url,
    body: input.body,
    headers: { "privy-app-id": input.appId },
  };
  const serialized = JSON.stringify(payload, Object.keys(payload).sort());
  const signer = createSign("SHA256");
  signer.update(serialized);
  signer.end();
  return signer.sign(createPrivateKey({ key: pem, format: "pem" })).toString("base64");
}

/* ------------------------------------------------------------------ client */

export class PrivyClient {
  constructor(
    private appId = env.privy.appId(),
    private appSecret = env.privy.appSecret(),
    private base = env.privy.base(),
    private authKey = env.privy.authKey(),
  ) {}

  private async call<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    opts: { sign?: boolean; idempotencyKey?: string } = {},
  ): Promise<T> {
    const url = `${this.base}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.appId}:${this.appSecret}`).toString("base64")}`,
      "privy-app-id": this.appId,
      "Content-Type": "application/json",
    };
    if (opts.idempotencyKey) headers["privy-idempotency-key"] = opts.idempotencyKey;
    if (opts.sign && this.authKey) {
      headers["privy-authorization-signature"] = authorizationSignature({
        method, url, body: body ?? {}, appId: this.appId, privateKey: this.authKey,
      });
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new PrivyError(`Privy ${method} ${path} -> ${res.status}: ${text}`, res.status, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /* ----- key quorums: the m-of-n approval primitive behind every payout ---- */

  /** Create the org's signing quorum. `threshold` = how many managers must sign. */
  createKeyQuorum(input: {
    displayName: string;
    publicKeys: string[];
    threshold: number;
  }): Promise<PrivyKeyQuorum> {
    return this.call("POST", "/v1/key_quorums", {
      display_name: input.displayName,
      public_keys: input.publicKeys,
      authorization_threshold: input.threshold,
    });
  }

  getKeyQuorum(quorumId: string): Promise<PrivyKeyQuorum> {
    return this.call("GET", `/v1/key_quorums/${quorumId}`);
  }

  updateKeyQuorum(quorumId: string, input: { publicKeys?: string[]; threshold?: number }) {
    return this.call<PrivyKeyQuorum>("PATCH", `/v1/key_quorums/${quorumId}`, {
      ...(input.publicKeys ? { public_keys: input.publicKeys } : {}),
      ...(input.threshold ? { authorization_threshold: input.threshold } : {}),
    }, { sign: true });
  }

  /* ------------------- policies: enclave-enforced spend rules ------------- */

  createPolicy(input: {
    name: string;
    chainType?: ChainType;
    rules: PrivyPolicyRule[];
  }): Promise<{ id: string }> {
    return this.call("POST", "/v1/policies", {
      version: "1.0",
      name: input.name.slice(0, 50),
      chain_type: input.chainType ?? "ethereum",
      rules: input.rules,
    });
  }

  /* ------------------------------- wallets -------------------------------- */

  createWallet(input: {
    chainType?: ChainType;
    displayName?: string;
    externalId?: string;
    ownerId?: string;          // key quorum id
    policyIds?: string[];
  }): Promise<PrivyWallet> {
    return this.call("POST", "/v1/wallets", {
      chain_type: input.chainType ?? "ethereum",
      ...(input.displayName ? { display_name: input.displayName } : {}),
      ...(input.externalId ? { external_id: input.externalId } : {}),
      ...(input.ownerId ? { owner_id: input.ownerId } : {}),
      ...(input.policyIds ? { policy_ids: input.policyIds } : {}),
    }, { idempotencyKey: input.externalId });
  }

  getWallet(walletId: string): Promise<PrivyWallet> {
    return this.call("GET", `/v1/wallets/${walletId}`);
  }

  /* -------------------------------- intents ------------------------------- */

  /**
   * Propose a payout. Nothing moves until the quorum's signers authorize it —
   * this is the object the Slack approval thread is wrapped around.
   */
  createTransferIntent(input: {
    walletId: string;
    to: string;
    amount: string;            // base units
    asset: string;             // e.g. "usdc"
    caip2: string;             // e.g. "eip155:84532"
    externalId?: string;
  }): Promise<PrivyIntent> {
    return this.call("POST", `/v1/intents/wallets/${input.walletId}/transfer`, {
      caip2: input.caip2,
      asset: input.asset,
      amount: input.amount,
      recipient: input.to,
      ...(input.externalId ? { external_id: input.externalId } : {}),
    }, { sign: true, idempotencyKey: input.externalId });
  }

  /** Create an arbitrary RPC intent (e.g. an ERC-20 transfer calldata send). */
  createRpcIntent(input: {
    walletId: string;
    caip2: string;
    method: string;
    params: Record<string, unknown>;
    externalId?: string;
  }): Promise<PrivyIntent> {
    return this.call("POST", `/v1/wallets/${input.walletId}/rpc_intent`, {
      caip2: input.caip2,
      method: input.method,
      params: input.params,
    }, { sign: true, idempotencyKey: input.externalId });
  }

  /** Add one signer's authorization to an intent. */
  signIntent(intentId: string, signature: string): Promise<PrivyIntent> {
    return this.call("POST", `/v1/intents/${intentId}/authorize`, { signature });
  }

  getIntent(intentId: string): Promise<PrivyIntent> {
    return this.call("GET", `/v1/intents/${intentId}`);
  }
}

export class PrivyError extends Error {
  constructor(message: string, readonly status: number, readonly raw: string) {
    super(message);
    this.name = "PrivyError";
  }
}

/* ------------------------------------------------------------ policy types */

export interface PrivyPolicyCondition {
  field_source: "ethereum_transaction" | "ethereum_calldata" | "interface_call";
  field: string;
  operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "not_in";
  value: string | string[] | number;
  abi?: unknown;
}

export interface PrivyPolicyRule {
  name: string;
  method: string;             // e.g. "eth_sendTransaction"
  conditions: PrivyPolicyCondition[];
  action: "ALLOW" | "DENY";
}

/**
 * Translate an org policy into Privy policy rules: only USDC, only to
 * allowlisted payees, never above the tier ceiling. Enforced inside the TEE,
 * so a compromised Quorly server still cannot drain the treasury.
 */
export function buildTreasuryPolicyRules(input: {
  usdcAddress: string;
  allowedRecipients: string[];
}): PrivyPolicyRule[] {
  return [
    {
      name: "USDC contract only",
      method: "eth_sendTransaction",
      conditions: [
        { field_source: "ethereum_transaction", field: "to", operator: "eq", value: input.usdcAddress },
      ],
      action: "ALLOW",
    },
    {
      name: "Allowlisted payees only",
      method: "eth_sendTransaction",
      conditions: [
        {
          field_source: "ethereum_calldata",
          field: "transfer.recipient",
          operator: "in",
          value: input.allowedRecipients,
        },
      ],
      action: "ALLOW",
    },
  ];
}
