import { asc } from "drizzle-orm";
import { db, policies } from "@quorly/core/db";
import { Amount, PageHeader } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const tiers = await db.select().from(policies).orderBy(asc(policies.maxAmount)).catch(() => []);

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
          <article
            key={t.id}
            className="flex flex-col bg-card p-7"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="display text-2xl">{t.name}</h2>
              <span className="label">{String(i + 1).padStart(2, "0")}</span>
            </div>

            <p className="mb-1 text-xs text-ink-faint">up to</p>
            <Amount value={t.maxAmount} size="lg" className="mb-7" />

            <dl className="mt-auto space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Approvals</dt>
                <dd className="tnum font-mono">{t.requiredApprovals}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">From</dt>
                <dd className="text-right">{t.approverRoles.join(", ")}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Selfie Check</dt>
                <dd className={t.requiredAttestation ? "text-forest" : "text-ink-faint"}>
                  {t.requiredAttestation ? `within ${t.attestationMaxAgeSec}s` : "not required"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-soft">Self-approval</dt>
                <dd className={t.blockSelfApproval ? "text-oxblood" : "text-ink-faint"}>
                  {t.blockSelfApproval ? "blocked" : "allowed"}
                </dd>
              </div>
            </dl>

            {t.privyPolicyId && (
              <p className="mt-6 truncate border-t border-rule pt-4 font-mono text-[0.6875rem] text-ink-faint">
                {t.privyPolicyId}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
