import { apiOrNull, type Member } from "@/lib/api";
import { Empty, PageHeader } from "@/components/quorly/primitives";

export const dynamic = "force-dynamic";

const ROLE_COPY: Record<string, string> = {
  owner: "Edits policy and quorum membership",
  approver: "Approves within policy limits",
  finance: "Executes payouts, cannot approve",
  member: "Submits invoices",
};

export default async function TeamPage() {
  const data = await apiOrNull<{ members: Member[] }>("/api/members");

  if (!data) {
    return <Empty title="Sign in to see your team" body="The roster is per organisation." />;
  }

  const roster = data.members ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Organisation"
        title={
          <>
            Who can say
            <br />
            <em className="italic">yes</em>.
          </>
        }
        lede="Roles decide who may approve. Each approver holds one authorization key in the treasury's Privy key quorum — so 'two approvals required' isn't a flag in a database, it's the wallet's owner."
      />

      <div className="reveal rule">
        {roster.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 border-b border-rule py-5"
          >
            <span className="display grid size-10 place-items-center rounded-full bg-muted text-base text-ink-soft">
              {(m.name ?? m.email).charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0">
              <p className="truncate font-medium">{m.name ?? m.email}</p>
              <p className="mt-0.5 truncate text-xs text-ink-faint">
                {m.ensSubname ? <span className="font-mono">{m.ensSubname}</span> : m.email}
                <span className="mx-2 text-rule-strong">·</span>
                {ROLE_COPY[m.role] ?? m.role}
              </p>
            </div>

            <div className="text-right">
              <p className="label">{m.role}</p>
              <p className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
                {m.slackUserId ?? "slack not linked"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
