"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Signs in, then claims the roster seat for the verified email. The sync call
 * is what turns a Privy identity into a Quorly member.
 */
export function useQuorlySession() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [sync, setSync] = useState<{ state: "idle" | "syncing" | "ok" | "error"; message?: string }>(
    { state: "idle" },
  );
  const router = useRouter();

  useEffect(() => {
    if (!ready || !authenticated || sync.state !== "idle") return;
    setSync({ state: "syncing" });
    fetch("/api/auth/sync", { method: "POST" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setSync({ state: "error", message: j.error });
          return;
        }
        setSync({ state: "ok" });
        router.refresh();
      })
      .catch(() => setSync({ state: "error", message: "Network error" }));
  }, [ready, authenticated, sync.state, router]);

  return { ready, authenticated, user, login, logout, sync };
}

export function SignInButton({ full }: { full?: boolean }) {
  const { ready, authenticated, user, login, logout, sync } = useQuorlySession();

  if (!ready) {
    return <span className="text-sm text-ink-faint">…</span>;
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className={
          full
            ? "w-full rounded-md bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            : "rounded-md border border-input px-3.5 py-1.5 text-sm transition-colors hover:border-foreground"
        }
      >
        Sign in
      </button>
    );
  }

  if (sync.state === "error") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-oxblood">{sync.message}</span>
        <button onClick={logout} className="text-xs text-ink-soft underline underline-offset-2">
          Sign out
        </button>
      </div>
    );
  }

  const label =
    user?.email?.address ??
    user?.google?.email ??
    user?.wallet?.address?.slice(0, 8) ??
    "Signed in";

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[14rem] truncate text-sm text-ink-soft sm:inline">{label}</span>
      <button
        onClick={logout}
        className="text-sm text-ink-faint transition-colors hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
