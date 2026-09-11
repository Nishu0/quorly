import { eq } from "drizzle-orm";
import { db, invoices, members } from "@quorly/core/db";
import { routeInvoice, env } from "@quorly/core";
import { Amount, Field } from "@/components/quorly/primitives";
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
  if (!memberId) {
    return <Shell title="Missing approver" body="Open this link from the Slack approval card." />;
  }

  const approver = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!approver) return <Shell title="Unknown approver" />;

  const decision = await routeInvoice(invoice);

  return (
    <div className="reveal mx-auto max-w-lg">
      <p className="label mb-5">Approval checkpoint</p>

      <h1 className="display text-[2.5rem] leading-[1.1]">
        Release <Amount value={invoice.amount} size="xl" className="align-baseline" />
        <br />
        to {invoice.payeeEns ?? "this payee"}?
      </h1>

      {invoice.description && (
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">{invoice.description}</p>
      )}

      <dl className="mt-10 rounded-lg border border-rule bg-card px-6 py-2">
        <Field label="Payee" mono>
          {invoice.payeeEns ?? invoice.payeeAddress ?? "—"}
        </Field>
        <Field label="Policy tier">{decision.policy.name}</Field>
        <Field label="Approvals needed" mono>
          {decision.requiredApprovals}
        </Field>
        <Field label="Approving as">{approver.name ?? approver.email}</Field>
      </dl>

      <section className="mt-10 rounded-lg border border-rule bg-card p-7">
        <h2 className="display text-2xl leading-tight">
          Prove you&apos;re here, <em className="italic">right now</em>.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          A stolen Slack session can click a button. It can&apos;t pass a liveness check. This proof
          is bound to this one invoice and this one approver, so it can never be replayed against
          another payment.
        </p>

        <SelfieCheck
          invoiceId={invoice.id}
          memberId={approver.id}
          appId={env.world.appId()}
          demo={!env.world.rpId() || !env.world.signingKey()}
        />
      </section>

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        Selfie Check is a medium-assurance credential: liveness and facial similarity, valid 90
        days. Quorly never treats it as identity — your authority to approve comes from the Privy
        key quorum. This only proves the click was live.
      </p>
    </div>
  );
}

function Shell({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="display text-3xl">{title}</h1>
      {body && <p className="mt-3 text-sm text-ink-soft">{body}</p>}
    </div>
  );
}
