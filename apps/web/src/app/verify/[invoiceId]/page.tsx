import { apiOrNull, type Invoice, type Member, type Routing } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { Amount, Field } from "@/components/quorly/primitives";
import { SignInButton } from "@/components/quorly/auth";
import { SelfieCheck } from "./selfie-check";

export const dynamic = "force-dynamic";

interface Detail {
  invoice: Invoice;
  routing: Routing;
  worldConfigured: boolean;
}

export default async function VerifyPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;

  // Authority comes from the session, never from the URL. The Slack card still
  // links here directly, but who you are is decided by the Go server.
  const me = await apiOrNull<Member>("/api/me");
  if (!me) {
    return (
      <Shell title="Sign in to approve" body="Approvals are tied to your account, not to this link.">
        <div className="mx-auto mt-8 max-w-xs">
          <SignInButton full />
        </div>
      </Shell>
    );
  }

  const detail = await apiOrNull<Detail>(`/api/invoices/${invoiceId}`);
  if (!detail) return <Shell title="Invoice not found" />;

  const { invoice, routing } = detail;

  if (invoice.status !== "pending_approval") {
    return <Shell title={`Already ${invoice.status.replace("_", " ")}`} />;
  }
  if (!routing.eligibleApprovers.some((a) => a.id === me.id)) {
    return (
      <Shell
        title="Not your approval"
        body={`${me.name ?? me.email} isn't an approver on the ${routing.policy} tier for this invoice.`}
      />
    );
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
          {invoice.payeeEns ?? shortAddress(invoice.payeeAddress)}
        </Field>
        <Field label="Policy tier">{routing.policy}</Field>
        <Field label="Approvals needed" mono>
          {routing.requiredApprovals}
        </Field>
        <Field label="Approving as">{me.name ?? me.email}</Field>
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
          memberId={me.id}
          appId={process.env.NEXT_PUBLIC_WORLD_APP_ID ?? ""}
          demo={!detail.worldConfigured}
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
