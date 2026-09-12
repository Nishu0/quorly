import { forwardRedirect } from "@/lib/slack-proxy";

export const dynamic = "force-dynamic";

const BASE = process.env.QUORLY_API_URL ?? "http://localhost:8080";

export async function GET(req: Request) {
  const query = new URL(req.url).search;
  return forwardRedirect(`${BASE}/slack/oauth/callback${query}`);
}
