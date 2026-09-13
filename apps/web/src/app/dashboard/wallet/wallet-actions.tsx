"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconCopy } from "@tabler/icons-react";

const EXPLORER = "https://sepolia.basescan.org";

export function WalletActions({
  address,
  balance,
  canSend,
  reason,
}: {
  address: string;
  balance: string;
  canSend: boolean;
  reason: string;
}) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState("");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be refused; the address is on screen either way.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/wallet/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, amount }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json.error ?? "That didn't go through.");
        return;
      }
      setHash(json.hash);
      setState("sent");
      setTo("");
      setAmount("");
      // The balance is rendered on the server, so it only moves on a refresh.
      router.refresh();
    } catch {
      setState("error");
      setMessage("Network error.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-rule bg-card p-5">
        <p className="label mb-2">Your address</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{address || "—"}</code>
          {address && (
            <>
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? "Address copied" : "Copy address"}
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {copied ? (
                  <IconCheck className="size-4 text-forest" />
                ) : (
                  <IconCopy className="size-4" />
                )}
              </button>
              <a
                href={`${EXPLORER}/address/${address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Explorer
              </a>
            </>
          )}
        </div>
      </div>

      {state === "sent" && (
        <div className="rounded-md bg-forest-soft p-5 text-sm text-forest">
          <p className="font-medium">Sent.</p>
          <a
            href={`${EXPLORER}/tx/${hash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 block truncate font-mono text-xs underline-offset-2 hover:underline"
          >
            {hash}
          </a>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="to" className="label mb-2 block">
            Recipient
          </label>
          <input
            id="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 font-mono text-sm outline-none focus:border-foreground"
          />
        </div>

        <div>
          <label htmlFor="amount" className="label mb-2 block">
            Amount
          </label>
          <div className="flex items-center gap-3">
            <input
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 font-mono text-sm outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => setAmount(balance)}
              className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Max
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSend || state === "sending" || !to || !amount}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Send QUSD"}
        </button>

        {reason && <p className="text-xs leading-relaxed text-ink-faint">{reason}</p>}
        {state === "error" && (
          <p className="rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{message}</p>
        )}
      </form>
    </div>
  );
}
