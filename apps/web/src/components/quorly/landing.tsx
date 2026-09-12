import Link from "next/link";
import { DitherBackground } from "@/components/quorly/dither-background";
import { FlowDiagram } from "@/components/quorly/flow-diagram";
import { ProblemModals } from "@/components/quorly/problem-modals";

const FEATURES = [
  {
    t: "Approvals where work happens",
    d: "A contractor DMs an invoice PDF. The bot reads it, routes it against policy, and asks exactly the people who can approve. No portal.",
  },
  {
    t: "Friction priced to risk",
    d: "Under $500 clears in one click. Above it, a live Selfie Check. Above that, two approvers within three minutes of each other.",
  },
  {
    t: "Rules the app can't flip",
    d: "The treasury is owned by an m-of-n key quorum with its spend policy enforced inside a secure enclave — not by a boolean in our database.",
  },
  {
    t: "An audit trail worth reading",
    d: "Who approved, what proved they were live, which transaction settled it. Append-only, and readable by someone who wasn't there.",
  },
];

export function Landing() {
  return (
    <>
      <DitherBackground light="#faf7f0" dark="#5ea6e5" scale={3} />

      <div className="mx-auto max-w-5xl">
        <section className="reveal rounded-2xl border border-rule bg-card/85 px-6 py-16 text-center backdrop-blur-md sm:px-12">
          <p className="label mb-6">Treasury approvals</p>
          <h1 className="display text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02]">
            Money moves when a<br />
            <em className="italic">live human</em> says so.
          </h1>
          <p className="mx-auto mt-7 max-w-lg text-[0.9375rem] leading-relaxed text-ink-soft">
            Slack-native invoice approvals. Above a threshold the approver passes a live World ID
            Selfie Check, and the payout leaves a treasury wallet governed by a key quorum.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/slack/install"
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 sm:w-auto"
            >
              <SlackMark />
              Add to Slack
            </a>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-input px-6 py-3.5 text-sm font-medium transition-colors duration-200 hover:border-foreground sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section className="reveal mt-6" style={{ animationDelay: "100ms" }}>
          <ProblemModals />
        </section>

        <section
          className="reveal mt-6 rounded-2xl border border-rule bg-card/85 p-8 backdrop-blur-md sm:p-10"
          style={{ animationDelay: "180ms" }}
        >
          <h2 className="display text-2xl leading-snug">One path, four checkpoints</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Every invoice takes the same route. What changes with the amount is how many
            checkpoints it has to clear.
          </p>
          <div className="mt-8 overflow-x-auto">
            <div className="min-w-[680px]">
              <FlowDiagram />
            </div>
          </div>
        </section>

        <section
          className="reveal mt-6 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2"
          style={{ animationDelay: "240ms" }}
        >
          {FEATURES.map((f) => (
            <article key={f.t} className="bg-card/90 p-8 backdrop-blur">
              <h3 className="display text-xl leading-snug">{f.t}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{f.d}</p>
            </article>
          ))}
        </section>

        <section
          className="reveal mt-6 rounded-2xl border border-rule bg-card/85 p-8 backdrop-blur-md sm:p-10"
          style={{ animationDelay: "300ms" }}
        >
          <h2 className="label mb-4">What Selfie Check is, and isn&apos;t</h2>
          <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">
            It&apos;s a medium-assurance credential — liveness and facial similarity, valid 90 days,
            with no one-person-one-account guarantee. So Quorly never treats it as identity.
            Authority to approve comes from the key quorum. Selfie Check answers one narrower
            question:{" "}
            <em className="italic text-foreground">was a live human behind this click?</em>
          </p>
        </section>
      </div>
    </>
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
