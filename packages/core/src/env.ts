import "./load-env";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: () => req("DATABASE_URL"),

  privy: {
    appId: () => req("PRIVY_APP_ID"),
    appSecret: () => req("PRIVY_APP_SECRET"),
    authKey: () => opt("PRIVY_AUTHORIZATION_PRIVATE_KEY"),
    quorumId: () => opt("PRIVY_TREASURY_QUORUM_ID"),
    base: () => opt("PRIVY_API_BASE", "https://api.privy.io"),
  },

  world: {
    appId: () => opt("NEXT_PUBLIC_WORLD_APP_ID"),
    action: () => opt("NEXT_PUBLIC_WORLD_ACTION", "approve-payout"),
    rpId: () => opt("WORLD_RP_ID"),
    signingKey: () => opt("WORLD_RP_SIGNING_KEY"),
    base: () => opt("WORLD_API_BASE", "https://developer.world.org"),
    /** "staging" while testing in Sandbox, "production" for real World App. */
    environment: () => opt("WORLD_ENVIRONMENT", "staging"),
  },

  slack: {
    botToken: () => req("SLACK_BOT_TOKEN"),
    appToken: () => req("SLACK_APP_TOKEN"),
    signingSecret: () => opt("SLACK_SIGNING_SECRET"),
  },

  ai: {
    apiKey: () => opt("ANTHROPIC_API_KEY"),
    model: () => opt("ANTHROPIC_MODEL", "claude-opus-5"),
  },

  chain: {
    id: () => Number(opt("CHAIN_ID", "84532")),
    rpc: () => opt("RPC_URL", "https://sepolia.base.org"),
    usdc: () => opt("USDC_ADDRESS", "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  },

  appUrl: () => opt("APP_URL", "http://localhost:3000"),

  /** Demo mode: skip live third-party calls so the app runs with no keys. */
  demo: () => process.env.DEMO_MODE === "1" || !process.env.PRIVY_APP_ID,
};
