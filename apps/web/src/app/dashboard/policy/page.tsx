import type { Metadata } from "next";
import { api, type Member, type Policy } from "@/lib/api";
import { PolicyBoard } from "./policy-board";

export const metadata: Metadata = { title: "Policy" };
export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const [me, data] = await Promise.all([
    api<Member>("/api/me"),
    api<{ policies: Policy[] }>("/api/policies"),
  ]);

  return <PolicyBoard initial={data.policies ?? []} canEdit={me.role === "owner"} />;
}
