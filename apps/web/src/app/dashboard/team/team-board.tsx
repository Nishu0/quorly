"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconUserPlus, IconTrash } from "@tabler/icons-react";

import type { Member } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLES = [
  { v: "owner", label: "Owner", d: "Sets policy and manages the roster" },
  { v: "approver", label: "Approver", d: "Approves within policy limits" },
  { v: "finance", label: "Finance", d: "Executes payouts, cannot approve" },
  { v: "member", label: "Member", d: "Submits invoices only" },
];

export function TeamBoard({
  initial,
  me,
  approvingRoles,
  selfieTiers,
}: {
  initial: Member[];
  me: Member;
  approvingRoles: string[];
  selfieTiers: number;
}) {
  const router = useRouter();
  const canEdit = me.role === "owner";
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "That didn't work.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-medium">Roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Roles decide who may approve. Each approver holds one authorization key in the
            treasury&apos;s key quorum — so &ldquo;two approvals required&rdquo; isn&apos;t a flag
            in a database, it&apos;s the wallet&apos;s owner.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setInviting(true)}>
            <IconUserPlus />
            Invite
          </Button>
        )}
      </div>

      {error && <p className="rounded-lg bg-oxblood-soft p-3 text-sm text-oxblood">{error}</p>}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {initial.length} {initial.length === 1 ? "person" : "people"}
          </CardTitle>
          <CardDescription>
            {selfieTiers > 0
              ? `${selfieTiers} tier${selfieTiers === 1 ? "" : "s"} require a live Selfie Check before an approval counts.`
              : "No tier currently requires a Selfie Check."}
          </CardDescription>
        </CardHeader>

        <CardContent className="divide-y p-0">
          {initial.map((m) => {
            const canApprove = approvingRoles.includes(m.role);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium">
                  {(m.name ?? m.email).charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{m.name ?? m.email}</p>
                    {m.id === me.id && <Badge variant="secondary">you</Badge>}
                    {m.pending && (
                      <Badge variant="outline" title="Hasn't signed in yet">
                        invited
                      </Badge>
                    )}
                    {canApprove && !m.pending && (
                      <Badge className="bg-forest-soft text-forest">can approve</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {m.email}
                    {m.ensSubname && <span className="ml-2 font-mono">{m.ensSubname}</span>}
                    {m.slackUserId && <span className="ml-2 font-mono">{m.slackUserId}</span>}
                  </p>
                </div>

                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role}
                      onValueChange={async (role: string | null) => {
                        if (!role) return;
                        setBusyId(m.id);
                        await call(`/api/members/${m.id}`, "PATCH", { role });
                        setBusyId(null);
                      }}
                      disabled={busyId === m.id}
                    >
                      <SelectTrigger className="w-[130px]" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.v} value={r.v}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {m.id !== me.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-oxblood hover:text-oxblood"
                        disabled={busyId === m.id}
                        onClick={async () => {
                          setBusyId(m.id);
                          await call(`/api/members/${m.id}`, "DELETE");
                          setBusyId(null);
                        }}
                      >
                        <IconTrash />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r.v} className="rounded-lg border p-4">
            <p className="text-sm font-medium">{r.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{r.d}</p>
          </div>
        ))}
      </div>

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onInvite={async (body) => {
          const ok = await call("/api/members", "POST", body);
          if (ok) setInviting(false);
          return ok;
        }}
      />
    </>
  );
}

function InviteDialog({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (b: { email: string; name: string; role: string }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("approver");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            They claim this seat by signing in with the same email. Nothing is sent — hand them the
            link yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mel@acme.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v: string | null) => v && setRole(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.v} value={r.v}>
                    <span className="flex flex-col items-start">
                      <span>{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.d}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true);
              await onInvite({ email, name, role });
              setBusy(false);
            }}
          >
            {busy ? "Inviting…" : "Add to roster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
