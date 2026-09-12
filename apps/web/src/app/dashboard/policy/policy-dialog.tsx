"use client";

import { useEffect, useState } from "react";
import type { Policy } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLES = ["owner", "approver", "finance"] as const;

interface Form {
  name: string;
  maxAmount: string;
  requiredApprovals: string;
  approverRoles: string[];
  requireSelfieCheck: boolean;
  attestationMaxAgeSec: string;
  blockSelfApproval: boolean;
  active: boolean;
}

const BLANK: Form = {
  name: "",
  maxAmount: "",
  requiredApprovals: "1",
  approverRoles: ["approver", "owner"],
  requireSelfieCheck: true,
  attestationMaxAgeSec: "300",
  blockSelfApproval: true,
  active: true,
};

export function PolicyDialog({
  open,
  policy,
  onClose,
  onSaved,
}: {
  open: boolean;
  policy: Policy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(BLANK);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Reload whenever the dialog opens, so editing one tier then another doesn't
  // carry the first one's values across.
  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      policy
        ? {
            name: policy.Name,
            maxAmount: String(policy.MaxAmount),
            requiredApprovals: String(policy.RequiredApprovals),
            approverRoles: policy.ApproverRoles ?? ["approver"],
            requireSelfieCheck: Boolean(policy.RequiredAttestation),
            attestationMaxAgeSec: String(policy.AttestationMaxAgeSec || 300),
            blockSelfApproval: policy.BlockSelfApproval,
            active: policy.Active,
          }
        : BLANK,
    );
  }, [open, policy]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleRole = (role: string) =>
    setForm((f) => ({
      ...f,
      approverRoles: f.approverRoles.includes(role)
        ? f.approverRoles.filter((r) => r !== role)
        : [...f.approverRoles, role],
    }));

  async function save() {
    setBusy(true);
    setError("");

    const res = await fetch(policy ? `/api/policies/${policy.ID}` : "/api/policies", {
      method: policy ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        maxAmount: Number(form.maxAmount),
        requiredApprovals: Number(form.requiredApprovals),
        approverRoles: form.approverRoles,
        requireSelfieCheck: form.requireSelfieCheck,
        attestationMaxAgeSec: Number(form.attestationMaxAgeSec),
        blockSelfApproval: form.blockSelfApproval,
        active: form.active,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save that tier.");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{policy ? `Edit ${policy.Name}` : "New approval tier"}</DialogTitle>
          <DialogDescription>
            An invoice takes the cheapest tier whose ceiling covers it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Standard"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="max">Ceiling (QUSD)</Label>
              <Input
                id="max"
                type="number"
                min="1"
                value={form.maxAmount}
                onChange={(e) => set("maxAmount", e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="approvals">Approvals needed</Label>
              <Input
                id="approvals"
                type="number"
                min="1"
                max="10"
                value={form.requiredApprovals}
                onChange={(e) => set("requiredApprovals", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Who may approve</Label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => {
                const on = form.approverRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`rounded-full border px-3 py-1.5 text-xs capitalize transition-colors ${
                      on
                        ? "border-forest bg-forest-soft text-forest"
                        : "border-input text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="selfie" className="text-sm">
                  Require a live Selfie Check
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  The approver proves a live human is behind the click before it counts.
                </p>
              </div>
              <Switch
                id="selfie"
                checked={form.requireSelfieCheck}
                onCheckedChange={(v: boolean) => set("requireSelfieCheck", v)}
              />
            </div>

            {form.requireSelfieCheck && (
              <div className="grid gap-2 border-t pt-3">
                <Label htmlFor="window" className="text-xs">
                  Freshness window (seconds)
                </Label>
                <Input
                  id="window"
                  type="number"
                  min="30"
                  value={form.attestationMaxAgeSec}
                  onChange={(e) => set("attestationMaxAgeSec", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A proof older than this is refused. Presence has a short half-life.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="self" className="text-sm">
                Block self-approval
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Nobody clears their own invoice.
              </p>
            </div>
            <Switch
              id="self"
              checked={form.blockSelfApproval}
              onCheckedChange={(v: boolean) => set("blockSelfApproval", v)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="active" className="text-sm">
              Active
            </Label>
            <Switch
              id="active"
              checked={form.active}
              onCheckedChange={(v: boolean) => set("active", v)}
            />
          </div>

          {error && <p className="rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : policy ? "Save changes" : "Create tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
