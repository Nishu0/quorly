const BASE = process.env.QUORLY_API_URL ?? "http://localhost:8080";

/**
 * Forwards a Slack request to the Go server byte-for-byte.
 *
 * Slack signs the raw body, so this must not re-encode it — parsing and
 * re-serialising would change the bytes and every signature check would fail.
 * The two signature headers have to survive the hop for the same reason.
 */
export async function proxySlack(req: Request, path: string): Promise<Response> {
  const body = Buffer.from(await req.arrayBuffer());

  const headers = new Headers();
  for (const name of [
    "content-type",
    "x-slack-signature",
    "x-slack-request-timestamp",
    "x-slack-retry-num",
    "x-slack-retry-reason",
  ]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const res = await fetch(BASE + path, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
  });
}

/**
 * Follows a redirect the Go server issues, without letting fetch chase it —
 * the browser has to make the hop itself so cookies and the address bar land
 * where Slack expects.
 */
export async function forwardRedirect(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: "manual", cache: "no-store" });

  const location = res.headers.get("location");
  if (location) return Response.redirect(location, 302);

  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
  });
}
