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
    <article className="dithered mx-auto max-w-2xl">
      <Link
        href="/"
        className="mb-10 inline-block text-sm panel-muted transition-colors hover:opacity-80"
      >
        ← Home
      </Link>

      <div className="panel overflow-hidden">
        <div className="panel-bar">
          <span className="panel-dot" />
          <span>{title.toUpperCase().replace(/ /g, "_")}.TXT</span>
        </div>
        <div className="p-7">
          <h1 className="display text-[2.5rem] leading-[1.08]">{title}</h1>
          <p className="panel-faint mt-3 font-mono text-xs">Last updated {updated}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/55 bg-[#fdf4e3]/85 p-5 backdrop-blur-md">
        <p className="text-sm leading-relaxed text-[#8a5a00]">
          <strong>Quorly is a hackathon project</strong>, built for ETHOnline 2026. It runs on test
          networks with test tokens, it is not a licensed financial service, and it carries no
          warranty or uptime commitment. Please don&apos;t use it for real money or real payroll.
        </p>
      </div>

      <div className="panel-flat legal panel-muted mt-6 space-y-7 p-7 text-[0.9375rem] leading-relaxed">
        {children}
      </div>

      <div className="panel-flat panel-faint mt-6 p-5 text-sm">
        Questions about any of this?{" "}
        <a
          href="mailto:itsnisargthakkar@gmail.com"
          className="underline underline-offset-4 hover:opacity-80"
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
      <h2 className="display mb-2.5 text-xl" style={{ color: "var(--panel-ink)" }}>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
