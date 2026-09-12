import { SignInButton } from "@/components/quorly/auth";

const STEPS = [
  {
    n: "01",
    t: "A contractor DMs an invoice",
    d: "The bot reads the PDF, pulls out the amount, and files it — no portal, no form.",
  },
  {
    n: "02",
    t: "Policy decides who approves",
    d: "Tiers route by amount. Nobody approves their own invoice, ever.",
  },
  {
    n: "03",
    t: "The approver proves they're live",
    d: "Above a threshold, a World ID Selfie Check bound to that one invoice.",
  },
  {
    n: "04",
    t: "The quorum releases the money",
    d: "A treasury wallet whose spend rules are enforced inside a secure enclave.",
  },
];

export function Landing() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="reveal text-center">
        <p className="label mb-6">Treasury approvals</p>
        <h1 className="display text-[clamp(2.5rem,7vw,4.25rem)] leading-[1.03]">
          Money moves when a<br />
          <em className="italic">live human</em> says so.
        </h1>
        <p className="mx-auto mt-7 max-w-lg text-[0.9375rem] leading-relaxed text-ink-soft">
          Today &ldquo;approve&rdquo; is a button click authenticated by a session cookie. A stolen
          laptop can click it. Quorly makes the human in the loop provably live, at the moment money
          moves.
        </p>

        <div className="mx-auto mt-10 max-w-xs">
          <SignInButton full />
        </div>

        <p className="mt-5 text-xs text-ink-faint">
          No workspace yet?{" "}
          <a href="/slack/install" className="underline underline-offset-4 hover:text-foreground">
            Add Quorly to Slack
          </a>
        </p>
      </section>

      <section
        className="reveal mt-24 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2"
        style={{ animationDelay: "120ms" }}
      >
        {STEPS.map((s) => (
          <article key={s.n} className="bg-card p-7">
            <p className="label mb-3 !text-forest">{s.n}</p>
            <h2 className="display text-xl leading-snug">{s.t}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{s.d}</p>
          </article>
        ))}
      </section>

      <section
        className="reveal mt-16 rounded-xl border border-rule bg-card p-8"
        style={{ animationDelay: "200ms" }}
      >
        <h2 className="label mb-4">What Selfie Check is, and isn&apos;t</h2>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
          It&apos;s a medium-assurance credential — liveness and facial similarity, valid 90 days,
          with no one-person-one-account guarantee. So Quorly never treats it as identity. Authority
          to approve comes from the key quorum. Selfie Check answers one narrower question:{" "}
          <em className="italic text-foreground">was a live human behind this click?</em>
        </p>
      </section>
    </div>
  );
}
