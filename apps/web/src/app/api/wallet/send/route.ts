import { proxy } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxy(req, "/api/wallet/send");
}
