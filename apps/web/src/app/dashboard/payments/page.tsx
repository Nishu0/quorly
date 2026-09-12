import type { Metadata } from "next";
import { api, apiOrNull, type Invoice } from "@/lib/api";
import { usd, shortAddress } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/quorly/primitives";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

interface Org {
  name: string;
  treasuryAddress: string | null;
  treasuryQuorumId: string | null;
  settlementToken: string;
  chainId: number;
}

const EXPLORER = "https://sepolia.basescan.org";

export default async function PaymentsPage() {
  const [org, data] = await Promise.all([
    apiOrNull<Org>("/api/org"),
    api<{ invoices: Invoice[] }>("/api/invoices"),
  ]);

  const invoices = data.invoices ?? [];
  // Anything past approval is on the money path, including the ones still
  // collecting quorum signatures — those are the ones worth watching.
  const settling = invoices.filter((i) =>
    ["approved", "scheduled", "failed"].includes(i.status),
  );
  const paid = invoices.filter((i) => i.status === "paid");
  const totalPaid = paid.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total settled</CardDescription>
            <CardTitle className="tnum font-mono text-2xl">{usd(totalPaid)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {paid.length} payment{paid.length === 1 ? "" : "s"} onchain
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In flight</CardDescription>
            <CardTitle className="tnum font-mono text-2xl">{settling.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">approved, awaiting the quorum</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Treasury</CardDescription>
            <CardTitle className="truncate font-mono text-sm">
              {shortAddress(org?.treasuryAddress)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="truncate text-xs text-muted-foreground">
              {org?.treasuryQuorumId ? `quorum ${org.treasuryQuorumId.slice(0, 12)}…` : "not provisioned"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>On the money path</CardTitle>
            <CardDescription>
              Approved and waiting on quorum signatures, or already settling.
            </CardDescription>
          </div>
          <Badge variant="secondary">{settling.length}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {settling.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing in flight.
            </p>
          ) : (
            <ul className="divide-y">
              {settling.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {i.description ?? i.number ?? i.id}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {i.privyIntentId ? `intent ${i.privyIntentId}` : "awaiting intent"}
                    </p>
                  </div>
                  <StatusPill status={i.status} />
                  <span className="tnum font-mono text-sm">{usd(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settled</CardTitle>
          <CardDescription>Every payment that reached the chain.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {paid.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing settled yet.
            </p>
          ) : (
            <ul className="divide-y">
              {paid.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {i.description ?? i.number ?? i.id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      to {i.payeeEns ?? shortAddress(i.payeeAddress)}
                      {i.paidAt && ` · ${new Date(i.paidAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  {i.txHash && (
                    <a
                      href={`${EXPLORER}/tx/${i.txHash}`}
                      className="font-mono text-xs text-forest hover:underline"
                    >
                      {i.txHash.slice(0, 12)}…
                    </a>
                  )}
                  <span className="tnum font-mono text-sm">{usd(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
