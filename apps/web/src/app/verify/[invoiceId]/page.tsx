import { eq } from "drizzle-orm";
import { db, invoices, members } from "@quorly/core/db";
import { usd, routeInvoice, env } from "@quorly/core";
import { SelfieCheck } from "./selfie-check";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const { invoiceId } = await params;
  const { member: memberId } = await searchParams;

  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return <Shell title="Invoice not found" />;
  if (!memberId) return <Shell title="Missing approver" body="Open this link from the Slack approval card." />;

  const approver = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!approver) return <Shell title="Unknown approver" />;

  const decision = await routeInvoice(invoice);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest opacity-50">Approval checkpoint</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Release {usd(invoice.amount)} {invoice.currency}?
        </h1>
        <p className="mt-2 text-sm opacity-70">{invoice.description}</p>
      </div>

      <dl className="rounded-xl border border-[var(--color-line)]/60 p-4 text-sm">
        <Row k="Payee" v={invoice.payeeEns ?? invoice.payeeAddress ?? "—"} mono />
        <Row k="Policy tier" v={decision.policy.name} />
        <Row k="Approvals needed" v={`${decision.requiredApprovals}`} />
        <Row k="Approver" v={approver.name ?? approver.email} />
      </dl>

      <div className="rounded-xl border border-[var(--color-line)]/60 p-5">
        <h2 className="text-sm font-semibold">Prove you&apos;re here, right now</h2>
        <p className="mt-1 text-sm opacity-70">
          A stolen Slack session can click a button. It can&apos;t pass a liveness check. Selfie Check
          binds this approval to a live human in front of a camera — and the proof is bound to this
          one invoice, so it can never be replayed against another payment.
        </p>

        <SelfieCheck
          invoiceId={invoice.id}
          memberId={approver.id}
          appId={env.world.appId()}
          demo={!env.world.rpId() || !env.world.signingKey()}
        />

        <p className="mt-4 text-xs opacity-50">
          Selfie Check is a medium-assurance credential: liveness and facial similarity, valid for
          90 days. Quorly never treats it as identity — your authority to approve comes from the
          Privy key quorum. This only proves the click was live.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--color-line)]/40 py-2 last:border-0">
      <dt className="opacity-60">{k}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : ""}>{v}</dd>
    </div>
  );
}

function Shell({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {body && <p className="mt-2 text-sm opacity-70">{body}</p>}
    </div>
  );
}
