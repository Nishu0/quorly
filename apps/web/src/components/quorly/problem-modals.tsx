"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The three problems, one click deep.
 *
 * Putting them behind cards rather than on the page keeps the hero honest —
 * anyone who wants the argument can have it, and anyone who just wants to sign
 * in isn't made to scroll past it.
 */
const PROBLEMS = [
  {
    k: "01",
    title: "A click is not a person",
    teaser: "Approval today is authenticated by a session cookie.",
    body: [
      "Every finance tool treats “approve” as a button press behind a login. That login is a cookie in a browser — and a cookie can be stolen, forwarded, or left open on an unlocked laptop.",
      "So the control that releases company money rests on something that never proves a human was there. The audit log records who was signed in, not who decided.",
      "Quorly makes the approver pass a liveness check at the moment of approval. The proof is bound to that one invoice and that one approver, and it expires in minutes.",
    ],
  },
  {
    k: "02",
    title: "Policy that software can flip",
    teaser: "“Two approvals required” is usually a boolean in a database.",
    body: [
      "Approval thresholds normally live as application state. A bug, a migration, or anyone with database access can change what it takes to move money — and nothing downstream would notice.",
      "Quorly mirrors the rules into a wallet the application does not control. The treasury is owned by an m-of-n key quorum, and the spend policy is enforced inside a secure enclave.",
      "Two approvals means the enclave counts two signatures over that specific transfer. A fully compromised Quorly server still cannot drain the treasury.",
    ],
  },
  {
    k: "03",
    title: "Approvals live where work doesn't",
    teaser: "Another portal, another login, another thing to chase.",
    body: [
      "Invoice approval sits in a system nobody opens daily. Requests wait, reminders go unread, and contractors chase payment through a tool they were onboarded into once.",
      "Quorly puts the whole loop in Slack. A contractor sends a PDF; the bot reads it, routes it against policy, and asks exactly the people who can approve.",
      "The only time anyone leaves Slack is to prove they're a live human — and then only above a threshold the organisation sets itself.",
    ],
  },
];

export function ProblemModals() {
  const [open, setOpen] = useState<number | null>(null);
  const active = open === null ? null : PROBLEMS[open];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <button
            key={p.k}
            onClick={() => setOpen(i)}
            className="panel group p-6 text-left transition-transform duration-150 hover:-translate-y-0.5"
          >
            <div className="mb-4 flex items-center gap-2.5">
              <span className="pixel grid size-6 place-items-center rounded-md border border-white/50 bg-white/35 text-[0.625rem] text-[var(--panel-ink)]">
                {p.k}
              </span>
              <span className="dither-rule flex-1" />
            </div>
            <h3 className="display text-lg leading-snug">{p.title}</h3>
            <p className="panel-muted mt-2 text-sm leading-relaxed">{p.teaser}</p>
            <span className="panel-faint pixel mt-4 inline-flex items-center gap-1.5 text-[0.625rem] uppercase transition-colors group-hover:text-[var(--panel-accent)]">
              Read more
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          showCloseButton={false}
          className="dithered panel max-w-lg gap-0 overflow-hidden border-white/55 p-0 sm:rounded-[18px]"
        >
          {active && (
            <>
              <div className="panel-bar justify-between">
                <span className="flex items-center gap-2">
                  <span className="panel-dot" />
                  <span>PROBLEM_{active.k}.TXT</span>
                </span>
                <button
                  onClick={() => setOpen(null)}
                  aria-label="Close"
                  className="pixel rounded-md border border-white/50 bg-white/30 px-2 py-0.5 text-[0.625rem] text-white transition-colors hover:bg-white/50"
                >
                  X
                </button>
              </div>

              <div className="p-7">
                <DialogHeader className="space-y-0 text-left">
                  <DialogTitle className="display text-2xl leading-snug text-[var(--panel-ink)]">
                    {active.title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">{active.teaser}</DialogDescription>
                </DialogHeader>

                <div className="dither-rule my-5" />

                <div className="panel-muted space-y-4 text-[0.9375rem] leading-relaxed">
                  {active.body.map((para) => (
                    <p key={para.slice(0, 24)}>{para}</p>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
