"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IDKitRequestWidget, selfieCheckLegacy, type RpContext } from "@worldcoin/idkit";

type State = "idle" | "preparing" | "verifying" | "done" | "error";

/**
 * Watches the payout land.
 *
 * The approval returns the moment it is recorded, but the money leaves in a
 * background job a second or two later. Without this the page sits on "paying
 * out" with nothing moving, which reads like a hang rather than a queue.
 * Refreshing pulls the server-rendered status until it says paid.
 */
function Settling() {
  const router = useRouter();
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    // Stop after two minutes. A payout that has not landed by then has failed,
    // and a spinner that never stops is a lie.
    if (waited > 120) return;
    const t = window.setTimeout(() => {
      setWaited((w) => w + 4);
      router.refresh();
    }, 4000);
    return () => window.clearTimeout(t);
  }, [waited, router]);

  return (
    <div className="flex items-center gap-3 rounded-md border border-rule bg-card px-4 py-3">
      <span
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-rule border-t-forest"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {waited > 120 ? "Still settling" : "Releasing payment onchain…"}
        </p>
        <p className="text-xs text-ink-faint">
          {waited > 120
            ? "Taking longer than usual. The invoice page will show the transaction when it lands."
            : "The quorum is signing and broadcasting. This page updates itself."}
        </p>
      </div>
    </div>
  );
}

export function SelfieCheck(props: {
  invoiceId: string;
  memberId: string;
  appId: string;
  demo: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [settling, setSettling] = useState(false);
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
      body: JSON.stringify({ invoiceId: props.invoiceId, result }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Verification failed");

    setState("done");
    setMessage(
      json.fullyApproved
        ? "Approved and paying out. You can close this tab."
        : `Approved (${json.collected}/${json.required}). Waiting on the rest of the quorum.`,
    );
    // The status pill, the decisions list and the approval count are all
    // rendered on the server. Without this the page keeps saying nobody has
    // decided, on the very screen where you just decided.
    if (json.fullyApproved) setSettling(true);
    router.refresh();
  }

  /** Fetch a freshly signed, single-use rp_context, then open World App. */
  async function start() {
    setState("preparing");
    setMessage("");
    try {
      const res = await fetch("/api/world/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: props.invoiceId }),
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
    return (
      <div className="mt-6 space-y-3">
        <div className="rounded-md bg-forest-soft p-4 text-sm text-forest">✓ {message}</div>
        {settling && <Settling />}
      </div>
    );
  }

  return (
    <div className="mt-7 space-y-3">
      {props.demo ? (
        <button
          onClick={() =>
            submit({ protocol_version: "3.0", nonce: `demo_${Date.now()}`, responses: [] }).catch((e) => {
              setState("error");
              setMessage(e.message);
            })
          }
          disabled={state === "verifying"}
          className="w-full rounded-md bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
        >
          {state === "verifying" ? "Approving…" : "Simulate Selfie Check (World ID not configured)"}
        </button>
      ) : (
        <>
          <button
            onClick={start}
            disabled={state === "preparing" || state === "verifying"}
            className="w-full rounded-md bg-primary px-4 py-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
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

      {state === "error" && <p className="rounded-md bg-oxblood-soft p-3 text-sm text-oxblood">{message}</p>}
    </div>
  );
}
