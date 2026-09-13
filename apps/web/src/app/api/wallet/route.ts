import { proxy } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return proxy(req, "/api/wallet");
}
