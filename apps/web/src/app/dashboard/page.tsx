import Link from "next/link";
import { api, apiOrNull, type Invoice, type Member } from "@/lib/api";
import { usd, shortAddress } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

interface Org {
  name: string;
  treasuryAddress: string | null;
  settlementToken: string;
}

export default async function OverviewPage() {
  const [me, org, data] = await Promise.all([
    api<Member>("/api/me"),
    apiOrNull<Org>("/api/org"),
    api<{ invoices: Invoice[] }>("/api/invoices"),
  ]);

  const invoices = data.invoices ?? [];
  const pending = invoices.filter((i) => i.status === "pending_approval");
  const paid = invoices.filter((i) => i.status === "paid");
  const outstanding = pending.reduce((s, i) => s + i.amount, 0);
  const settled = paid.reduce((s, i) => s + i.amount, 0);

  const stats = [
    { label: "Awaiting approval", value: usd(outstanding), hint: `${pending.length} invoice${pending.length === 1 ? "" : "s"}` },
    { label: "Settled", value: usd(settled), hint: `${paid.length} paid` },
    { label: "Treasury", value: org?.treasuryAddress ? "Live" : "Not set up", hint: shortAddress(org?.treasuryAddress) },
    { label: "Your role", value: me.role, hint: me.email },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="tnum font-mono text-2xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="truncate text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Needs a decision</CardTitle>
            <CardDescription>Invoices waiting on an approver right now.</CardDescription>
          </div>
          <Badge variant="secondary">{pending.length}</Badge>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing pending. Clean desk.
            </p>
          ) : (
            <ul className="divide-y">
              {pending.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/dashboard/invoices/${i.id}`}
                    className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {i.description ?? i.number ?? i.id}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {i.payeeEns ?? shortAddress(i.payeeAddress)}
                      </p>
                    </div>
                    <StatusPill status={i.status} />
                    <span className="tnum shrink-0 font-mono text-sm">{usd(i.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently settled</CardTitle>
          <CardDescription>Payments that reached the chain.</CardDescription>
        </CardHeader>
        <CardContent>
          {paid.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing settled yet.
            </p>
          ) : (
            <ul className="divide-y">
              {paid.slice(0, 5).map((i) => (
                <li key={i.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {i.description ?? i.number ?? i.id}
                    </p>
                    {i.txHash && (
                      <a
                        href={`https://sepolia.basescan.org/tx/${i.txHash}`}
                        className="truncate font-mono text-xs text-muted-foreground hover:underline"
                      >
                        {i.txHash.slice(0, 18)}…
                      </a>
                    )}
                  </div>
                  <span className="tnum shrink-0 font-mono text-sm">{usd(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
