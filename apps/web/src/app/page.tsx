import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, invoices } from "@quorly/core/db";
import { usd } from "@quorly/core";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-900",
  approved: "bg-blue-100 text-blue-900",
  scheduled: "bg-blue-100 text-blue-900",
  paid: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  failed: "bg-rose-100 text-rose-900",
  draft: "bg-neutral-200 text-neutral-800",
};

export default async function Home() {
  const list = await db
    .select()
    .from(invoices)
    .orderBy(desc(invoices.createdAt))
    .limit(50)
    .catch(() => []);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Every row here was filed in Slack. Approvals above the fast-lane ceiling need a live
          World ID Selfie Check, and payouts leave a Privy treasury wallet whose spend rules are
          enforced inside a secure enclave.
        </p>
      </section>

      {list.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]/60">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide opacity-60">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Approvals</th>
              </tr>
            </thead>
            <tbody>
              {list.map((invoice) => (
                <tr key={invoice.id} className="border-t border-[var(--color-line)]/50">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                      {invoice.number ?? invoice.id.slice(0, 14)}
                    </Link>
                    {invoice.description && (
                      <div className="text-xs opacity-60">{invoice.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{usd(invoice.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[invoice.status] ?? ""}`}>
                      {invoice.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs opacity-70">
                    0 / {invoice.requiredApprovals}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line)] p-10 text-center">
      <p className="text-sm opacity-70">
        No invoices yet. DM the Quorly bot a PDF in Slack, or run <code className="font-mono">bun run seed</code>.
      </p>
    </div>
  );
}
