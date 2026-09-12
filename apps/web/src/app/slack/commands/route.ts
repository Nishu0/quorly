import { proxySlack } from "@/lib/slack-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxySlack(req, "/slack/commands");
}
