import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- headers */

export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="reveal mb-14 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="label mb-4">{eyebrow}</p>}
        <h1 className="display text-[2.75rem] leading-[1.05] md:text-[3.5rem]">{title}</h1>
        {lede && (
          <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft">{lede}</p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/* ----------------------------------------------------------------- money */

/**
 * Amounts are always mono and tabular so a column of figures aligns to the
 * digit — the single most useful thing a finance UI can do.
 */
export function Amount({
  value,
  currency,
  size = "md",
  className,
}: {
  value: string | number;
  currency?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const n = Number(value);
  const [whole, cents] = n
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");

  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
    xl: "text-[2.5rem] leading-none",
  };

  return (
    <span className={cn("tnum font-mono", sizes[size], className)}>
      <span className="text-ink-faint">$</span>
      {whole}
      <span className="text-ink-faint">.{cents}</span>
      {currency && <span className="ml-1.5 text-[0.7em] text-ink-faint">{currency}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------- status */

const STATUS = {
  pending_approval: { label: "Awaiting approval", tone: "amber" },
  approved: { label: "Approved", tone: "forest" },
  scheduled: { label: "Settling", tone: "forest" },
  paid: { label: "Paid", tone: "forest" },
  rejected: { label: "Rejected", tone: "oxblood" },
  failed: { label: "Failed", tone: "oxblood" },
  draft: { label: "Draft", tone: "neutral" },
} as const;

const TONES = {
  forest: "bg-forest-soft text-forest",
  amber: "bg-amber-soft text-amber",
  oxblood: "bg-oxblood-soft text-oxblood",
  neutral: "bg-muted text-ink-soft",
} as const;

/** The accent stripe on a ledger row — lets the eye sort by state at a glance. */
export function StatusAccent({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? { tone: "neutral" as const };
  const bar = {
    forest: "bg-forest",
    amber: "bg-amber",
    oxblood: "bg-oxblood",
    neutral: "bg-rule-strong",
  }[s.tone];
  return <span aria-hidden className={cn("h-8 w-[3px] shrink-0 rounded-full", bar)} />;
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? { label: status, tone: "neutral" as const };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium tracking-wide",
        TONES[s.tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-60" />
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ data */

export function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-rule py-3.5 last:border-0">
      <dt className="shrink-0 text-sm text-ink-soft">{label}</dt>
      <dd className={cn("truncate text-right text-sm", mono && "tnum font-mono text-[0.8125rem]")}>
        {children}
      </dd>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-l border-rule pl-5">
      <p className="label mb-2.5">{label}</p>
      <div className="display text-3xl leading-none">{value}</div>
      {hint && <p className="mt-2 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule-strong px-8 py-20 text-center">
      <p className="display text-2xl">{title}</p>
      {body && <p className="mx-auto mt-3 max-w-sm text-sm text-ink-soft">{body}</p>}
    </div>
  );
}
