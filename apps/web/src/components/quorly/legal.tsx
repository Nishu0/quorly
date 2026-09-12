import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl">
      <Link
        href="/"
        className="mb-10 inline-block text-sm text-ink-soft transition-colors hover:text-foreground"
      >
        ← Home
      </Link>

      <h1 className="display text-[2.5rem] leading-[1.08]">{title}</h1>
      <p className="mt-3 font-mono text-xs text-ink-faint">Last updated {updated}</p>

      <div className="mt-10 rounded-xl border border-amber/30 bg-amber-soft p-5">
        <p className="text-sm leading-relaxed text-amber">
          <strong>Quorly is a hackathon project</strong>, built for ETHOnline 2026. It runs on test
          networks with test tokens, it is not a licensed financial service, and it carries no
          warranty or uptime commitment. Please don&apos;t use it for real money or real payroll.
        </p>
      </div>

      <div className="legal mt-10 space-y-7 text-[0.9375rem] leading-relaxed text-ink-soft">
        {children}
      </div>

      <div className="mt-14 border-t border-rule pt-6 text-sm text-ink-faint">
        Questions about any of this?{" "}
        <a
          href="mailto:itsnisargthakkar@gmail.com"
          className="underline underline-offset-4 hover:text-foreground"
        >
          itsnisargthakkar@gmail.com
        </a>
      </div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display mb-2.5 text-xl text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
