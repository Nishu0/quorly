import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, invoices, orgs } from "@quorly/core/db";
import { Amount, Empty, PageHeader, StatusPill, Stat } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [list, org] = await Promise.all([
    db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(50).catch(() => []),
    db.query.orgs.findFirst({ where: eq(orgs.id, "org_demo_acme") }).catch(() => undefined),
  ]);

  const pending = list.filter((i) => i.status === "pending_approval");
  const outstanding = pending.reduce((sum, i) => sum + Number(i.amount), 0);
  const settled = list.filter((i) => i.status === "paid").length;

  return (
    <div>
      <PageHeader
        eyebrow={org?.name ?? "Treasury"}
        title={
          <>
            Money moves when a<br />
            <em className="italic">live human</em> says so.
          </>
        }
        lede="Every invoice below arrived through Slack. Approvals above the fast-lane ceiling require a Selfie Check at the moment of the click, and payouts leave a treasury wallet whose spend rules are enforced inside a secure enclave."
      />

      <section className="reveal mb-16 grid gap-8 sm:grid-cols-3" style={{ animationDelay: "80ms" }}>
        <Stat
          label="Awaiting approval"
          value={<Amount value={outstanding} size="lg" />}
          hint={`${pending.length} invoice${pending.length === 1 ? "" : "s"}`}
        />
        <Stat label="Settled" value={settled} hint="paid out this period" />
        <Stat
          label="Treasury"
          value={org?.treasuryAddress ? "Live" : "—"}
          hint={
            org?.treasuryAddress
              ? `${org.treasuryAddress.slice(0, 10)}…${org.treasuryAddress.slice(-6)}`
              : "run setup:treasury"
          }
        />
      </section>

      <section className="reveal" style={{ animationDelay: "160ms" }}>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="label">Ledger</h2>
          <span className="text-xs text-ink-faint">{list.length} records</span>
        </div>

        {list.length === 0 ? (
          <Empty
            title="Nothing filed yet"
            body={
              <>
                Send the Quorly bot an invoice in Slack, or run{" "}
                <code className="font-mono text-xs">bun run demo:slack 2400</code>.
              </>
            }
          />
        ) : (
          <div className="rule">
            {list.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-6 border-b border-rule py-5 transition-colors duration-200 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_10rem_9rem]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {invoice.description ?? invoice.number ?? invoice.id}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-ink-faint">
                    {invoice.number ?? invoice.id}
                    {invoice.payeeEns && <span className="ml-2">→ {invoice.payeeEns}</span>}
                  </p>
                </div>

                <div className="hidden justify-self-start sm:block">
                  <StatusPill status={invoice.status} />
                </div>

                <div className="justify-self-end text-right">
                  <Amount value={invoice.amount} currency={invoice.currency} />
                  <p className="mt-1 text-xs text-ink-faint sm:hidden">
                    {invoice.status.replace("_", " ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
