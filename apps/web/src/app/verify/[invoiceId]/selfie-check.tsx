"use client";

import { useState } from "react";
import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";

type State = "idle" | "verifying" | "approving" | "done" | "error";

export function SelfieCheck(props: {
  invoiceId: string;
  memberId: string;
  appId: string;
  action: string;
  demo: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string>("");

  /**
   * The signal is what makes this safe: the proof is cryptographically bound to
   * `${invoiceId}:${memberId}`, so a proof harvested for one payout is useless
   * against any other.
   */
  const signal = `${props.invoiceId}:${props.memberId}`;

  async function submit(proof: Partial<ISuccessResult>) {
    setState("approving");
    try {
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: props.invoiceId, memberId: props.memberId, proof }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState("error");
        setMessage(json.error ?? "Verification failed");
        return;
      }
      setState("done");
      setMessage(
        json.fullyApproved
          ? "Approved and paying out. You can close this tab."
          : `Approved (${json.collected}/${json.required}). Waiting on the rest of the quorum.`,
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Network error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
        ✓ {message}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {props.demo ? (
        <button
          onClick={() => submit({ nullifier_hash: `demo_${signal}`, proof: "demo", verification_level: "selfie_check_demo" as never })}
          disabled={state === "approving"}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "approving" ? "Approving…" : "Simulate Selfie Check (sandbox not connected)"}
        </button>
      ) : (
        <IDKitWidget
          app_id={props.appId as `app_${string}`}
          action={props.action}
          signal={signal}
          verification_level={VerificationLevel.Device}
          onSuccess={(result) => void submit(result)}
        >
          {({ open }) => (
            <button
              onClick={open}
              className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white"
            >
              Verify with World ID
            </button>
          )}
        </IDKitWidget>
      )}

      {state === "error" && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{message}</p>
      )}
    </div>
  );
}
