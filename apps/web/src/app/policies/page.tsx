import { apiOrNull, type Policy } from "@/lib/api";
import { Amount, Empty, PageHeader } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const data = await apiOrNull<{ policies: Policy[] }>("/api/policies");

  if (!data) {
    return <Empty title="Sign in to see your policy" body="Approval tiers are per organisation." />;
  }

  const tiers = data.policies ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Controls"
        title={
          <>
            Friction, priced to
            <br />
            the <em className="italic">risk</em>.
          </>
        }
        lede="Tiers are evaluated cheapest-first. Each is mirrored into Privy's policy engine, which enforces the same ceiling and payee allowlist inside a secure enclave — so even a fully compromised Quorly server cannot move money outside these rules."
      />

      <div className="reveal grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-3">
        {tiers.map((t, i) => (
          <article key={t.ID} className="flex flex-col bg-card p-7">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="display text-2xl">{t.Name}</h2>
              <span className="label">{String(i + 1).padStart(2, "0")}</span>
            </div>

            <p className="mb-1 text-xs text-ink-faint">up to</p>
            <Amount value={t.MaxAmount} size="lg" className="mb-7" />

            <dl className="mt-auto space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Approvals</dt>
                <dd className="tnum font-mono">{t.RequiredApprovals}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">From</dt>
                <dd className="text-right">{(t.ApproverRoles ?? []).join(", ")}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Selfie Check</dt>
                <dd className={t.RequiredAttestation ? "text-forest" : "text-ink-faint"}>
                  {t.RequiredAttestation ? `within ${t.AttestationMaxAgeSec}s` : "not required"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Self-approval</dt>
                <dd className={t.BlockSelfApproval ? "text-oxblood" : "text-ink-faint"}>
                  {t.BlockSelfApproval ? "blocked" : "allowed"}
                </dd>
              </div>
            </dl>

            {t.PrivyPolicyID && (
              <p className="mt-6 truncate border-t border-rule pt-4 font-mono text-[0.6875rem] text-ink-faint">
                {t.PrivyPolicyID}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
