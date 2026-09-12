"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus, IconSearch } from "@tabler/icons-react";

import type { Invoice, Member } from "@/lib/api";
import { usd, shortAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/quorly/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FILTERS = [
  { v: "all", label: "All" },
  { v: "pending_approval", label: "Pending" },
  { v: "approved", label: "Approved" },
  { v: "paid", label: "Paid" },
  { v: "rejected", label: "Rejected" },
];

export function InvoiceBoard({ initial, me }: { initial: Invoice[]; me: Member }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return [i.number, i.description, i.payeeEns, i.payeeAddress, i.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [initial, filter, query]);

  const total = rows.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v: string) => setFilter(v)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.v} value={f.v}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-48 pl-8"
            />
          </div>
          <Button onClick={() => setCreating(true)}>
            <IconPlus />
            New invoice
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {initial.length === 0
                ? "Nothing filed yet. DM the Quorly bot an invoice PDF in Slack, or create one here."
                : "Nothing matches that filter."}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/dashboard/invoices/${i.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {i.description ?? i.number ?? i.id}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {i.number ?? i.id} · {i.payeeEns ?? shortAddress(i.payeeAddress)}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <StatusPill status={i.status} />
                    </div>
                    <span className="tnum justify-self-end font-mono text-sm">{usd(i.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {rows.length} shown · <span className="tnum font-mono">{usd(total)}</span> total
      </p>

      <NewInvoiceDialog open={creating} onClose={() => setCreating(false)} me={me} />
    </>
  );
}

function NewInvoiceDialog({
  open,
  onClose,
  me,
}: {
  open: boolean;
  onClose: () => void;
  me: Member;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [number, setNumber] = useState("");
  const [payee, setPayee] = useState(me.walletAddress ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        description: description || null,
        number: number || null,
        payeeAddress: payee || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not file that invoice.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>File an invoice</DialogTitle>
          <DialogDescription>
            It routes against policy the moment it&apos;s filed, and the approvers it names are
            notified in Slack.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (QUSD)</Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="2400"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="number">Invoice number</Label>
              <Input
                id="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="INV-1042"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sprint 14 — contract engineering"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payee">Payee address</Label>
            <Input
              id="payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to pay your own wallet. The treasury policy only permits allowlisted
              payees, so a new address needs adding there first.
            </p>
          </div>

          {error && <p className="rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !amount}>
            {busy ? "Filing…" : "File invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
