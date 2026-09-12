import Link from "next/link";
import { api, apiOrNull, type Invoice, type Member } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { Amount, Empty, PageHeader, StatusPill, Stat } from "@/components/quorly/primitives";
import { SignInButton } from "@/components/quorly/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await apiOrNull<Member>("/api/me");

  if (!me) {
    return (
      <div className="reveal mx-auto max-w-lg py-16 text-center">
        <h1 className="display text-[3rem] leading-[1.05]">
          Money moves when a<br />
          <em className="italic">live human</em> says so.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-[0.9375rem] leading-relaxed text-ink-soft">
          Slack-native invoice approvals. Above a threshold, the approver passes a live World ID
          Selfie Check before the payout leaves a treasury wallet governed by a key quorum.
        </p>
        <div className="mx-auto mt-10 max-w-xs">
          <SignInButton full />
        </div>
        <p className="mt-8 text-xs text-ink-faint">
          No workspace yet?{" "}
          <a href="/slack/install" className="underline underline-offset-2">
            Add Quorly to Slack
          </a>
        </p>
      </div>
    );
  }

  const { invoices } = await api<{ invoices: Invoice[] }>("/api/invoices");
  const list = invoices ?? [];

  const pending = list.filter((i) => i.status === "pending_approval");
  const outstanding = pending.reduce((sum, i) => sum + i.amount, 0);
  const settled = list.filter((i) => i.status === "paid").length;

  return (
    <div>
      <PageHeader
        eyebrow={me.role}
        title={
          <>
            Money moves when a<br />
            <em className="italic">live human</em> says so.
          </>
        }
        lede="Every invoice below arrived through Slack. Approvals above the fast-lane ceiling need a live Selfie Check, and payouts leave a treasury wallet whose spend rules are enforced inside a secure enclave."
      />

      <section className="reveal mb-16 grid gap-8 sm:grid-cols-3" style={{ animationDelay: "80ms" }}>
        <Stat
          label="Awaiting approval"
          value={<Amount value={outstanding} size="lg" />}
          hint={`${pending.length} invoice${pending.length === 1 ? "" : "s"}`}
        />
        <Stat label="Settled" value={settled} hint="paid out this period" />
        <Stat label="Signed in as" value={me.name ?? me.email.split("@")[0]} hint={me.email} />
      </section>

      <section className="reveal" style={{ animationDelay: "160ms" }}>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="label">Ledger</h2>
          <span className="text-xs text-ink-faint">{list.length} records</span>
        </div>

        {list.length === 0 ? (
          <Empty
            title="Nothing filed yet"
            body="Send the Quorly bot an invoice PDF in Slack and it'll appear here."
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
                    {!invoice.payeeEns && invoice.payeeAddress && (
                      <span className="ml-2">→ {shortAddress(invoice.payeeAddress)}</span>
                    )}
                  </p>
                </div>

                <div className="hidden justify-self-start sm:block">
                  <StatusPill status={invoice.status} />
                </div>

                <div className="justify-self-end text-right">
                  <Amount value={invoice.amount} currency={invoice.currency} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
