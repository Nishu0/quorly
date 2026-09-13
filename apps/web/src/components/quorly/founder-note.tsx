/**
 * A note from the person who built it.
 *
 * Deliberately the last thing on the page: everything above argues the case,
 * and this one says who is making it. Kept in the product's own voice rather
 * than a testimonial voice — no claims about customers, revenue or a company,
 * because there aren't any yet and a landing page that overreaches is the
 * fastest way to lose someone who reads carefully.
 */
export function FounderNote() {
  return (
    <section className="panel reveal mt-8 overflow-hidden" style={{ animationDelay: "360ms" }}>
      <div className="dither-fill p-8 sm:p-12">
        <p className="panel-faint pixel mb-8 text-[0.625rem] tracking-wider uppercase">
          A note from the founder
        </p>

        <div className="max-w-2xl space-y-5 text-[0.9375rem] leading-relaxed">
          <p style={{ color: "var(--panel-ink)" }}>Dear whoever signs the payments,</p>

          <p className="panel-muted">
            I&apos;ve watched an invoice sit for four days because the one person who could
            approve it was in a different timezone and the approval lived in a tool they never
            open. Nobody was blocking it. Nobody was ignoring it. It was simply somewhere they
            weren&apos;t.
          </p>

          <p className="panel-muted">
            You know the feeling. The contractor asking, politely, for the third time. The
            approval flow that takes days to move a payment everyone already agreed on. The
            finance tool that emails a link to a login you forgot you had. And the quiet worry
            underneath all of it — that the click releasing the money proves nothing about who
            actually clicked.
          </p>

          <p className="panel-muted">
            So I built what I wanted to use. The invoice arrives where the work already happens.
            The policy decides who must approve before anyone is asked. Above a threshold, the
            approver shows their face. And the money leaves a treasury that no single person can
            open — not because the database says two approvals, but because the wallet itself
            refuses to move without them.
          </p>

          <p className="panel-muted">
            It&apos;s a hackathon project, honestly labelled. But the approvals are real, the
            quorum is real, and the payment lands onchain in about a minute.
          </p>

          <p style={{ color: "var(--panel-ink)" }}>Yours, from one timezone,</p>
        </div>

        <div className="mt-8">
          <Signature />
          <p className="mt-3 text-sm font-medium" style={{ color: "var(--panel-ink)" }}>
            itsnishu
          </p>
          <p className="panel-muted text-xs">Building Quorly</p>
        </div>
      </div>
    </section>
  );
}

/** A drawn mark rather than a font, so it reads as a hand and not as type. */
function Signature() {
  return (
    <svg
      viewBox="0 0 260 90"
      className="h-16 w-auto"
      role="img"
      aria-label="itsnishu, signed"
      fill="none"
      stroke="currentColor"
      style={{ color: "var(--panel-accent)" }}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 66 C 22 40, 30 28, 36 30 C 42 32, 34 56, 40 62 C 46 68, 58 44, 62 32" />
      <path d="M74 30 C 70 46, 68 58, 74 62 C 82 67, 92 46, 96 32 C 98 46, 96 58, 102 62 C 110 67, 120 44, 124 30" />
      <path d="M136 62 C 140 44, 146 30, 152 30 C 158 30, 152 52, 158 60 C 164 68, 178 48, 186 26" />
      <path d="M196 24 C 190 44, 188 58, 194 63 C 202 69, 216 52, 224 34" />
      <path d="M226 60 C 236 58, 246 54, 252 48" />
      <path d="M96 18 L 98 18" />
      <path d="M152 16 L 154 16" />
    </svg>
  );
}
