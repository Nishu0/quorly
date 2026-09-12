"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTrash, IconPencil } from "@tabler/icons-react";

import type { Policy } from "@/lib/api";
import { usd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PolicyDialog } from "./policy-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Relative time reads faster than a timestamp when scanning for what changed. */
function ago(iso?: string) {
  if (!iso) return "—";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function PolicyBoard({ initial, canEdit }: { initial: Policy[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Policy | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Cheapest-first is the order the engine evaluates in, so it's the order to
  // show — sorted any other way, the list misrepresents how routing works.
  const tiers = [...initial].sort((a, b) => a.MaxAmount - b.MaxAmount);

  async function remove(p: Policy) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/policies/${p.ID}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not delete that tier.");
      setDeleting(null);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-medium">Approval tiers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Evaluated cheapest-first: an invoice takes the first tier whose ceiling covers it. Each
            is mirrored into Privy&apos;s policy engine, which enforces the same limits inside a
            secure enclave.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <IconPlus />
            New tier
          </Button>
        )}
      </div>

      {error && <p className="rounded-lg bg-oxblood-soft p-3 text-sm text-oxblood">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map((t, i) => (
          <Card key={t.ID} className={t.Active ? "" : "opacity-60"}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardDescription className="font-mono text-[0.6875rem]">
                    TIER {String(i + 1).padStart(2, "0")}
                  </CardDescription>
                  <CardTitle className="mt-1 text-xl">{t.Name}</CardTitle>
                </div>
                {!t.Active && <Badge variant="outline">paused</Badge>}
              </div>
              <p className="tnum pt-2 font-mono text-2xl">{usd(t.MaxAmount)}</p>
              <p className="text-xs text-muted-foreground">ceiling per invoice</p>
            </CardHeader>

            <CardContent className="space-y-3">
              <dl className="space-y-2 text-sm">
                <Row k="Approvals" v={String(t.RequiredApprovals)} mono />
                <Row k="From" v={(t.ApproverRoles ?? []).join(", ")} />
                <Row
                  k="Selfie Check"
                  v={t.RequiredAttestation ? `within ${t.AttestationMaxAgeSec}s` : "not required"}
                  tone={t.RequiredAttestation ? "good" : "muted"}
                />
                <Row
                  k="Self-approval"
                  v={t.BlockSelfApproval ? "blocked" : "allowed"}
                  tone={t.BlockSelfApproval ? "bad" : "muted"}
                />
              </dl>

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">Updated {ago(t.UpdatedAt)}</span>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <IconPencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-oxblood hover:text-oxblood"
                      onClick={() => setDeleting(t)}
                    >
                      <IconTrash />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Only an owner can change these. Ask one if a tier needs moving.
        </p>
      )}

      <PolicyDialog
        open={creating || editing !== null}
        policy={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          router.refresh();
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.Name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoices in this range will route to the next tier that covers them. Invoices already
              filed keep the tier they were filed under, so the audit trail stays accurate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) void remove(deleting);
              }}
            >
              {busy ? "Deleting…" : "Delete tier"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({
  k,
  v,
  mono,
  tone,
}: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: "good" | "bad" | "muted";
}) {
  const color =
    tone === "good"
      ? "text-forest"
      : tone === "bad"
        ? "text-oxblood"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`${mono ? "tnum font-mono" : ""} ${color} text-right`}>{v}</dd>
    </div>
  );
}
