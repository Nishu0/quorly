import { db, members } from "@quorly/core/db";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const roster = await db.select().from(members).catch(() => []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 max-w-2xl text-sm opacity-70">
          Roles decide who can approve. Each approver holds one authorization key in the treasury&apos;s
          Privy key quorum, and each has an ENSv2 subname under the org&apos;s name so payouts address a
          human, not a hex string.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)]/60">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide opacity-60">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">ENS</th>
              <th className="px-4 py-3 font-medium">Slack</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-line)]/50">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.name ?? m.email}</div>
                  <div className="text-xs opacity-60">{m.email}</div>
                </td>
                <td className="px-4 py-3">{m.role}</td>
                <td className="px-4 py-3 font-mono text-xs">{m.ensSubname ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs opacity-60">{m.slackUserId ?? "not linked"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
