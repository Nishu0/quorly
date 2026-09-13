/**
 * The product, six tiles.
 *
 * Every tile shows something the system actually does — there is no FX here,
 * no virtual accounts, no multi-currency treasury, because Quorly has none of
 * that and a grid full of borrowed capabilities is the fastest way to lose a
 * judge who clicks through. The mock UI inside each card mirrors the real
 * screens rather than inventing prettier ones.
 */
export function Bento() {
  return (
    <section className="reveal mt-8" style={{ animationDelay: "270ms" }}>
      <p className="panel-faint pixel mb-5 text-center text-[0.625rem] tracking-wider uppercase">
        What you get on both sides
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2" title="Invoices arrive where you work"
          body="A contractor DMs the bot a PDF. It reads the amount, routes it, and pings only the people with authority to approve.">
          <div className="flex flex-col items-end gap-2">
            <Chip name="Priya" note="$2,400 · filed" />
            <Chip name="Kishan" note="$820 · approved" muted />
          </div>
        </Card>

        <Card title="Approvals priced to risk"
          body="Small amounts move on one nod. Larger ones demand more people, and a face.">
          <div className="space-y-1.5">
            <Tier label="Under $500" detail="1 approval" />
            <Tier label="$500 – $5,000" detail="1 + selfie" />
            <Tier label="Over $5,000" detail="2 + selfie" />
          </div>
        </Card>

        <Card title="A live human, not a session"
          body="Above a threshold the approver passes a World ID Selfie Check. The proof is bound to one invoice and expires in minutes.">
          <div className="flex items-center gap-3">
            <div
              className="grid size-11 place-items-center rounded-full border-2"
              style={{ borderColor: "var(--panel-accent)" }}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ color: "var(--panel-accent)" }}>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-medium" style={{ color: "var(--panel-ink)" }}>Verified 12s ago</p>
              <p className="panel-muted">Single use · this invoice only</p>
            </div>
          </div>
        </Card>

        <Card title="A treasury no one person can open"
          body="The wallet is owned by a key quorum. Two of three signatures, checked inside a secure enclave — not a flag in a database.">
          <div className="flex items-center gap-2">
            <Sig on />
            <Sig on />
            <Sig />
            <span className="panel-muted ml-1 text-xs">2 of 3 signed</span>
          </div>
        </Card>

        <Card className="md:col-span-2" title="Paid onchain, in about a minute"
          body="Once the quorum is met the payout leaves for the contractor's own wallet. Who approved, what proved they were live, and which transaction settled it all land in an append-only trail.">
          <div className="panel-flat flex items-center justify-between gap-4 rounded-lg px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--panel-ink)" }}>INV-4717 · settled</p>
              <p className="panel-muted truncate font-mono text-[0.6875rem]">0xbb14dea2…b9e1ec8c</p>
            </div>
            <span className="shrink-0 text-sm font-medium" style={{ color: "var(--panel-ink)" }}>
              $2,000.00
            </span>
          </div>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1" title="The money is yours"
          body="Everyone on the roster gets a wallet. Hold what you're paid, send it on, or export the key and walk away with it.">
          <div className="panel-flat rounded-lg px-4 py-3">
            <p className="panel-muted text-[0.625rem] tracking-wide uppercase">Balance</p>
            <p className="mt-1 text-lg font-medium" style={{ color: "var(--panel-ink)" }}>
              2,000.00 <span className="panel-muted text-xs">QUSD</span>
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Card({
  title, body, children, className = "",
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel-flat flex min-h-[19rem] flex-col p-7 ${className}`}>
      <div className="mb-6">{children}</div>
      <div className="mt-auto">
        <h3 className="display text-xl leading-snug">{title}</h3>
        <p className="panel-muted mt-2 text-sm leading-relaxed">{body}</p>
      </div>
    </article>
  );
}

function Chip({ name, note, muted }: { name: string; note: string; muted?: boolean }) {
  return (
    <div
      className={`panel-flat flex w-full max-w-[17rem] items-center gap-3 rounded-l-2xl px-3 py-2.5 ${muted ? "opacity-60" : ""}`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--panel-soft)] text-xs font-medium text-white">
        {name.charAt(0)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: "var(--panel-ink)" }}>{name}</p>
        <p className="panel-muted truncate text-xs">{note}</p>
      </div>
    </div>
  );
}

function Tier({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="panel-flat flex items-center justify-between rounded-md px-3 py-2 text-xs">
      <span style={{ color: "var(--panel-ink)" }}>{label}</span>
      <span className="panel-muted">{detail}</span>
    </div>
  );
}

function Sig({ on }: { on?: boolean }) {
  return (
    <span
      className="grid size-8 place-items-center rounded-full border"
      style={{
        borderColor: on ? "var(--panel-accent)" : "var(--panel-line)",
        background: on ? "var(--panel-accent)" : "transparent",
        color: on ? "#fff" : "var(--panel-line)",
      }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
