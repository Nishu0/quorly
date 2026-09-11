"use client";

import { useState } from "react";
import { IDKitRequestWidget, selfieCheckLegacy, type RpContext } from "@worldcoin/idkit";

type State = "idle" | "preparing" | "verifying" | "done" | "error";

export function SelfieCheck(props: {
  invoiceId: string;
  memberId: string;
  appId: string;
  demo: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<{ rp_context: RpContext; action: string; environment: string } | null>(null);

  /**
   * The signal binds the proof to this invoice and this approver, so a proof
   * harvested for one payout is meaningless against any other.
   */
  const signal = `${props.invoiceId}:${props.memberId}`;

  async function submit(result: unknown) {
    setState("verifying");
    const res = await fetch("/api/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: props.invoiceId, memberId: props.memberId, result }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Verification failed");

    setState("done");
    setMessage(
      json.fullyApproved
        ? "Approved and paying out. You can close this tab."
        : `Approved (${json.collected}/${json.required}). Waiting on the rest of the quorum.`,
    );
  }

  /** Fetch a freshly signed, single-use rp_context, then open World App. */
  async function start() {
    setState("preparing");
    setMessage("");
    try {
      const res = await fetch("/api/world/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: props.invoiceId, memberId: props.memberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start verification");
      setCtx(json);
      setOpen(true);
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Network error");
    }
  }

  if (state === "done") {
    return <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">✓ {message}</div>;
  }

  return (
    <div className="mt-4 space-y-3">
      {props.demo ? (
        <button
          onClick={() =>
            submit({ protocol_version: "3.0", nonce: `demo_${Date.now()}`, responses: [] }).catch((e) => {
              setState("error");
              setMessage(e.message);
            })
          }
          disabled={state === "verifying"}
          className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "verifying" ? "Approving…" : "Simulate Selfie Check (World ID not configured)"}
        </button>
      ) : (
        <>
          <button
            onClick={start}
            disabled={state === "preparing" || state === "verifying"}
            className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {state === "preparing" ? "Preparing…" : state === "verifying" ? "Verifying…" : "Verify with World ID"}
          </button>

          {ctx && (
            <IDKitRequestWidget
              open={open}
              onOpenChange={setOpen}
              app_id={props.appId as `app_${string}`}
              action={ctx.action}
              rp_context={ctx.rp_context}
              environment={ctx.environment as "production" | "staging"}
              allow_legacy_proofs
              preset={selfieCheckLegacy({ signal })}
              handleVerify={submit}
              onSuccess={() => setOpen(false)}
              onError={(code) => {
                setState("error");
                setMessage(`Selfie Check failed (${code}).`);
              }}
            />
          )}
        </>
      )}

      {state === "error" && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">{message}</p>}
    </div>
  );
}
