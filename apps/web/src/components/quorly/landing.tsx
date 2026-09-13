import Link from "next/link";
import { DitherBackground } from "@/components/quorly/dither-background";
import { FlowDiagram } from "@/components/quorly/flow-diagram";
import { ProblemModals } from "@/components/quorly/problem-modals";
import { FounderNote } from "@/components/quorly/founder-note";
import { Bento } from "@/components/quorly/bento";


export function Landing() {
  return (
    <div className="dithered">
      <DitherBackground light="#ffffff" dark="#5ea6e5" scale={3} />

      <div className="mx-auto max-w-5xl">
        {/* Hero */}
        <section className="panel reveal overflow-hidden">
          <div className="panel-bar">
            <span className="panel-dot" />
            <span className="panel-dot" />
            <span className="panel-dot" />
            <span className="ml-1">QUORLY.EXE — GET PAID, PAY OUT</span>
          </div>

          <div className="px-6 py-16 text-center sm:px-12">
            <h1 className="display text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02]">
              The easiest way to pay,
              <br />
              and to <em className="italic">get paid</em>.
            </h1>
            <p className="panel-muted mx-auto mt-7 max-w-xl text-[0.9375rem] leading-relaxed">
              Pay contractors anywhere in the world without a wire, a week, or a chase. Bill
              clients and see the money land the moment it clears approval. Both sides live in
              Slack, and above a threshold the person approving shows their face.
            </p>

            {/* Named plainly, because a page that sells to one side leaves the
                other wondering whose tool this is. */}
            <div className="panel-muted mx-auto mt-7 flex max-w-md flex-col gap-2 text-left text-sm sm:flex-row sm:gap-6">
              <p className="flex-1">
                <span className="font-medium" style={{ color: "var(--panel-ink)" }}>
                  Paying?
                </span>{" "}
                Approvals that route themselves, and a treasury no one person can open.
              </p>
              <p className="flex-1">
                <span className="font-medium" style={{ color: "var(--panel-ink)" }}>
                  Getting paid?
                </span>{" "}
                Send the invoice, watch it clear, hold it in a wallet that&apos;s yours.
              </p>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/slack/install"
                className="navcta inline-flex w-full items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-medium sm:w-auto"
              >
                <SlackMark />
                Add to Slack
              </a>
              <Link
                href="/login"
                className="navchip inline-flex w-full items-center justify-center px-6 py-3.5 text-sm font-medium text-[var(--panel-ink)] transition-transform duration-150 hover:-translate-y-px active:translate-y-0 sm:w-auto"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="dither-rule" />
        </section>

        {/* The problem, three ways */}
        <section className="reveal mt-8" style={{ animationDelay: "100ms" }}>
          <ProblemModals />
        </section>

        {/* Flow */}
        <section className="panel reveal mt-8 overflow-hidden" style={{ animationDelay: "180ms" }}>
          <div className="panel-bar">
            <span className="panel-dot" />
            <span className="ml-1">APPROVAL_PATH.DIAGRAM</span>
          </div>
          <div className="p-8 sm:p-10">
            <h2 className="display text-2xl leading-snug">One path, four checkpoints</h2>
            <p className="panel-muted mt-2 max-w-xl text-sm leading-relaxed">
              Every invoice takes the same route. What changes with the amount is how many
              checkpoints it has to clear.
            </p>
            <div className="mt-8 overflow-x-auto">
              <div className="min-w-[680px]">
                <FlowDiagram />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}

        {/* The honest caveat */}
        <section className="panel reveal mt-8 overflow-hidden" style={{ animationDelay: "300ms" }}>
          <div className="dither-fill p-8 sm:p-10">
            <p className="panel-faint pixel mb-3 text-[0.625rem] uppercase">
              What Selfie Check is, and isn&apos;t
            </p>
            <p className="panel-muted max-w-2xl text-[0.9375rem] leading-relaxed">
              It&apos;s a medium-assurance credential — liveness and facial similarity, valid 90
              days, with no one-person-one-account guarantee. So Quorly never treats it as
              identity. Authority to approve comes from the key quorum. Selfie Check answers one
              narrower question:{" "}
              <em className="italic" style={{ color: "var(--panel-ink)" }}>
                was a live human behind this click?
              </em>
            </p>
          </div>
        </section>

        <Bento />

        <FounderNote />
      </div>
    </div>
  );
}

function SlackMark() {
  return (
    <svg viewBox="0 0 122 122" className="size-4" aria-hidden fill="currentColor">
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" />
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" />
      <path d="M96.9 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H96.9V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.6 5.8 70.4 0 77.5 0s12.9 5.8 12.9 12.9v32.3z" />
      <path d="M77.5 96.9c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V96.9h12.9zm0-6.4c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.5z" />
    </svg>
  );
}
