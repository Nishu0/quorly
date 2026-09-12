import Link from "next/link";
import { notFound } from "next/navigation";
import { apiOrNull, type Approval, type AuditEntry, type Invoice, type Member, type Routing } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { Amount, Field, PageHeader, StatusPill } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

const EVENT_COPY: Record<string, string> = {
  "invoice.submitted": "Filed",
  "attestation.verified": "Selfie Check passed",
  "invoice.approved": "Approved",
  "invoice.rejected": "Rejected",
  "payout.intent_created": "Payout proposed to quorum",
  "invoice.paid": "Settled onchain",
};

interface Detail {
  invoice: Invoice;
  routing: Routing;
  approvals: Approval[] | null;
  audit: AuditEntry[] | null;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, roster] = await Promise.all([
    apiOrNull<Detail>(`/api/invoices/${id}`),
    apiOrNull<{ members: Member[] }>("/api/members"),
  ]);

  if (!detail) notFound();

  const { invoice, routing } = detail;
  const approvals = detail.approvals ?? [];
  const audit = detail.audit ?? [];
  const nameOf = (mid: string | null) =>
    (roster?.members ?? []).find((m) => m.id === mid)?.name ?? mid ?? "system";

  return (
    <div>
      <Link
        href="/dashboard/invoices"
        className="mb-10 inline-block text-sm text-ink-soft transition-colors hover:text-foreground"
      >
        ← Invoices
      </Link>

      <PageHeader
        eyebrow={invoice.number ?? invoice.id}
        title={<Amount value={invoice.amount} currency={invoice.currency} size="xl" />}
        lede={invoice.description ?? undefined}
        aside={<StatusPill status={invoice.status} />}
      />

      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-14">
          <section className="reveal">
            <h2 className="label mb-4">Why it routed here</h2>
            <p className="display text-xl leading-snug">{routing.reason}</p>
          </section>

          <section className="reveal" style={{ animationDelay: "80ms" }}>
            <h2 className="label mb-4">Decisions</h2>
            {approvals.length === 0 ? (
              <p className="text-sm text-ink-soft">Nobody has decided yet.</p>
            ) : (
              <div className="rule">
                {approvals.map((d) => (
                  <div key={d.ID} className="flex items-center gap-4 border-b border-rule py-4 text-sm">
                    <span className={d.Decision === "approve" ? "text-forest" : "text-oxblood"}>
                      {d.Decision === "approve" ? "✓" : "✕"}
                    </span>
                    <span className="font-medium">{nameOf(d.ApproverID)}</span>
                    {d.AttestationID && (
                      <span className="rounded-full bg-forest-soft px-2 py-0.5 text-[0.6875rem] text-forest">
                        selfie verified
                      </span>
                    )}
                    {d.Note && <span className="truncate text-ink-soft">— {d.Note}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="reveal" style={{ animationDelay: "160ms" }}>
            <h2 className="label mb-4">Audit trail</h2>
            <ol className="relative space-y-0">
              {audit.map((t, i) => (
                <li key={t.id} className="relative flex gap-5 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-forest" />
                    {i < audit.length - 1 && <span className="mt-1 w-px flex-1 bg-rule" />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm font-medium">{EVENT_COPY[t.event] ?? t.event}</p>
                    <p className="mt-0.5 font-mono text-xs text-ink-faint">
                      {t.createdAt.replace("T", " ").slice(0, 19)} · {nameOf(t.actorId)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="reveal lg:pt-2" style={{ animationDelay: "120ms" }}>
          <div className="rounded-lg border border-rule bg-card p-6">
            <h2 className="label mb-2">Settlement</h2>
            <dl>
              <Field label="Payee" mono>
                {invoice.payeeEns ?? shortAddress(invoice.payeeAddress)}
              </Field>
              <Field label="Tier">{routing.policy}</Field>
              <Field label="Approvals" mono>
                {approvals.filter((d) => d.Decision === "approve").length} /{" "}
                {routing.requiredApprovals}
              </Field>
              {invoice.privyIntentId && (
                <Field label="Privy intent" mono>
                  {invoice.privyIntentId}
                </Field>
              )}
              {invoice.txHash && (
                <Field label="Transaction" mono>
                  <a
                    href={`https://sepolia.basescan.org/tx/${invoice.txHash}`}
                    className="text-forest underline-offset-2 hover:underline"
                  >
                    {invoice.txHash.slice(0, 10)}…
                  </a>
                </Field>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
