import type { Metadata } from "next";
import { api, type Member, type Policy } from "@/lib/api";
import { TeamBoard } from "./team-board";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const [me, members, policies] = await Promise.all([
    api<Member>("/api/me"),
    api<{ members: Member[] }>("/api/members"),
    api<{ policies: Policy[] }>("/api/policies"),
  ]);

  // Which roles can actually approve is a property of the policy, not a
  // constant — showing it here stops "why can't they approve?" questions.
  const approving = new Set(
    (policies.policies ?? []).filter((p) => p.Active).flatMap((p) => p.ApproverRoles ?? []),
  );

  return (
    <TeamBoard
      initial={members.members ?? []}
      me={me}
      approvingRoles={[...approving]}
      selfieTiers={(policies.policies ?? []).filter((p) => p.Active && p.RequiredAttestation).length}
    />
  );
}
