import { eq, desc, and } from "drizzle-orm";
import { db, invoices, members, approvals, attestations, auditLog } from "@quorly/core/db";
import { usd, routeInvoice } from "@quorly/core";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!invoice) return <p className="text-sm opacity-70">Invoice not found.</p>;

  const [decision, decisions, trail] = await Promise.all([
    routeInvoice(invoice),
    db.select().from(approvals).where(eq(approvals.invoiceId, invoice.id)),
    db.select().from(auditLog).where(eq(auditLog.subject, `invoice:${invoice.id}`)).orderBy(desc(auditLog.createdAt)),
  ]);

  const roster = await db.select().from(members).where(eq(members.orgId, invoice.orgId));
  const nameOf = (mid: string | null) => roster.find((m) => m.id === mid)?.name ?? mid ?? "system";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest opacity-50">{invoice.status.replace("_", " ")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {usd(invoice.amount)} {invoice.currency}
        </h1>
        <p className="mt-1 text-sm opacity-70">{invoice.description}</p>
      </header>

      <section className="rounded-xl border border-[var(--color-line)]/60 p-5">
        <h2 className="text-sm font-semibold">Why this routing</h2>
        <p className="mt-2 text-sm opacity-75">{decision.reason}</p>
        {invoice.txHash && (
          <p className="mt-3 font-mono text-xs">
            tx <a className="underline" href={`https://sepolia.basescan.org/tx/${invoice.txHash}`}>{invoice.txHash}</a>
          </p>
        )}
        {invoice.privyIntentId && (
          <p className="mt-1 font-mono text-xs opacity-60">privy intent {invoice.privyIntentId}</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Decisions</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">No decisions yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)]/50 px-4 py-3">
                <span className={d.decision === "approve" ? "text-emerald-700" : "text-rose-700"}>
                  {d.decision === "approve" ? "✓" : "✕"}
                </span>
                <span className="font-medium">{nameOf(d.approverId)}</span>
                {d.attestationId && (
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">selfie-verified</span>
                )}
                {d.note && <span className="opacity-60">— {d.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Audit trail</h2>
        <ol className="mt-2 space-y-1 font-mono text-xs opacity-70">
          {trail.map((t) => (
            <li key={t.id}>
              {t.createdAt.toISOString()} · {t.event} · {nameOf(t.actorId)}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
