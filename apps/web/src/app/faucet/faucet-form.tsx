"use client";

import { useState } from "react";

export function FaucetForm({ treasury, deployed }: { treasury?: string; deployed: boolean }) {
  const [address, setAddress] = useState(treasury ?? "");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json.error ?? "Something went wrong.");
        return;
      }
      setState("sent");
      setHash(json.hash);
    } catch {
      setState("error");
      setMessage("Network error.");
    }
  }

  if (!deployed) {
    return (
      <p className="rounded-md bg-amber-soft p-4 text-sm text-amber">
        QUSD isn&apos;t deployed yet. Fund the deployer with Base Sepolia ETH, then run{" "}
        <code className="font-mono text-xs">bun run deploy:qusd</code>.
      </p>
    );
  }

  if (state === "sent") {
    return (
      <div className="rounded-md bg-forest-soft p-5 text-sm text-forest">
        <p className="font-medium">10,000 QUSD sent.</p>
        <a
          href={`https://sepolia.basescan.org/tx/${hash}`}
          className="mt-2 block truncate font-mono text-xs underline-offset-2 hover:underline"
        >
          {hash}
        </a>
        <button
          onClick={() => setState("idle")}
          className="mt-4 text-xs underline underline-offset-2"
        >
          Send to another address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="label block" htmlFor="addr">
        Destination address
      </label>
      <input
        id="addr"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x…"
        spellCheck={false}
        className="w-full rounded-md border border-input bg-background px-4 py-3 font-mono text-sm outline-none transition-colors focus:border-forest"
      />
      <button
        type="submit"
        disabled={state === "sending" || !address}
        className="w-full rounded-md bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
      >
        {state === "sending" ? "Sending…" : "Send 10,000 QUSD"}
      </button>
      {state === "error" && (
        <p className="rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{message}</p>
      )}
    </form>
  );
}
