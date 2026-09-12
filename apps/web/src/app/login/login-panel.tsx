"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuorlySession } from "@/components/quorly/auth";

export function LoginPanel() {
  const { ready, authenticated, login, logout, sync } = useQuorlySession();
  const router = useRouter();

  // Land on the dashboard as soon as the roster seat is claimed — signing in
  // and then being left on the sign-in page is a dead end.
  useEffect(() => {
    if (sync.state === "ok") router.replace("/dashboard");
  }, [sync.state, router]);

  if (!ready) {
    return <div className="h-[52px] animate-pulse rounded-full bg-muted" aria-hidden />;
  }

  if (sync.state === "error") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-oxblood-soft p-4 text-sm text-oxblood">{sync.message}</p>
        <button
          onClick={logout}
          className="text-sm text-ink-soft underline underline-offset-4 hover:text-foreground"
        >
          Try a different account
        </button>
      </div>
    );
  }

  const busy = authenticated || sync.state === "syncing";

  return (
    <div className="space-y-3">
      <button
        onClick={login}
        disabled={busy}
        className="flex w-full items-center justify-between gap-3 rounded-full bg-foreground px-6 py-4 text-sm font-medium text-background transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
      >
        <span className="flex items-center gap-3">
          <MailIcon />
          {busy ? "Signing you in…" : "Continue with email"}
        </span>
        <span className="text-xs font-normal opacity-60">Privy</span>
      </button>

      <button
        onClick={login}
        disabled={busy}
        className="flex w-full items-center gap-3 rounded-full border border-input px-6 py-4 text-sm font-medium transition-colors duration-200 hover:border-foreground disabled:opacity-60"
      >
        <WalletIcon />
        Continue with a wallet
      </button>

      <p className="pt-1 text-xs leading-relaxed text-ink-faint">
        Privy creates an embedded wallet on first sign-in. That wallet is where your authorization
        key lives — it&apos;s your seat in the quorum, and signing in never moves funds.
      </p>
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </svg>
  );
}
