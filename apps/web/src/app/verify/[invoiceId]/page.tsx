import { eq } from "drizzle-orm";
import { db, invoices } from "@quorly/core/db";
import { routeInvoice, env } from "@quorly/core";
import { Amount, Field } from "@/components/quorly/primitives";
import { SignInButton } from "@/components/quorly/auth";
import { currentMember } from "@/lib/session";
import { SelfieCheck } from "./selfie-check";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return <Shell title="Invoice not found" />;

  // Authority comes from the session, never from the URL. The Slack card still
  // carries ?member=, but it is a hint about which card was clicked — nothing
  // more. Trusting it would let anyone holding the link approve as anyone.
  const approver = await currentMember();

  if (!approver) {
    return (
      <Shell
        title="Sign in to approve"
        body="Approvals are tied to your account, not to this link."
      >
        <div className="mx-auto mt-8 max-w-xs">
          <SignInButton full />
        </div>
      </Shell>
    );
  }

  const decision = await routeInvoice(invoice);
  const eligible = decision.eligibleApprovers.some((m) => m.id === approver.id);

  if (!eligible) {
    return (
      <Shell
        title="Not your approval"
        body={`${approver.name ?? approver.email} isn't an approver on the ${decision.policy.name} tier for this invoice.`}
      />
    );
  }

  if (invoice.status !== "pending_approval") {
    return <Shell title={`Already ${invoice.status.replace("_", " ")}`} />;
  }

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

function Shell({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="display text-3xl">{title}</h1>
      {body && <p className="mx-auto mt-3 max-w-sm text-sm text-ink-soft">{body}</p>}
      {children}
    </div>
  );
}
