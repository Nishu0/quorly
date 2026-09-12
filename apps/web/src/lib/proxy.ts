import { cookies } from "next/headers";

const BASE = process.env.QUORLY_API_URL ?? "http://localhost:8080";

/**
 * Forwards a browser request to the Go server, carrying the session cookie.
 *
 * These exist so the browser only ever talks to its own origin. Calling Go
 * directly would put the Privy cookie in cross-origin territory, which means
 * SameSite=None and a class of problems not worth inviting.
 */
export async function proxy(req: Request, path: string): Promise<Response> {
  const jar = await cookies();
  const token = jar.get("privy-token")?.value;

  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Cookie", `privy-token=${token}`);

  const body = await req.text();

  const res = await fetch(BASE + path, {
    method: req.method,
    headers,
    body: body || undefined,
    cache: "no-store",
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
