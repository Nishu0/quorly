import { asc } from "drizzle-orm";
import { db, policies } from "@quorly/core/db";
import { usd } from "@quorly/core";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const tiers = await db.select().from(policies).orderBy(asc(policies.maxAmount)).catch(() => []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Approval policy</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Tiers are evaluated cheapest-first. Each one is mirrored into Privy&apos;s policy engine,
          which enforces the same ceilings and payee allowlist inside a secure enclave — so even a
          fully compromised Quorly server cannot move money outside these rules.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.id} className="rounded-xl border border-[var(--color-line)]/60 p-5">
            <h2 className="font-medium">{t.name}</h2>
            <p className="mt-1 font-mono text-xs opacity-60">up to {usd(t.maxAmount)}</p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li>{t.requiredApprovals} approval{t.requiredApprovals > 1 ? "s" : ""} required</li>
              <li className="opacity-70">from {t.approverRoles.join(", ")}</li>
              <li className={t.requiredAttestation ? "text-[var(--color-accent)]" : "opacity-50"}>
                {t.requiredAttestation
                  ? `live ${t.requiredAttestation.replace("_", " ")} · ${t.attestationMaxAgeSec}s freshness`
                  : "no biometric check"}
              </li>
              <li className="opacity-70">{t.blockSelfApproval ? "self-approval blocked" : "self-approval allowed"}</li>
            </ul>
            {t.privyPolicyId && (
              <p className="mt-3 truncate font-mono text-[10px] opacity-40">privy: {t.privyPolicyId}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
