"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Nav } from "@/components/quorly/nav";

/**
 * Marketing chrome for public pages only.
 *
 * The dashboard brings its own sidebar and header, and the login page is a
 * full-bleed split — wrapping either in this would give them two headers.
 */
export function SiteChrome({
  children,
  logo,
}: {
  children: React.ReactNode;
  logo?: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard")) return <>{children}</>;

  if (pathname.startsWith("/login")) {
    return <div className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-10">{children}</div>;
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30">
        <div className="titlebar-dither" />
        <div className="titlebar">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 lg:px-8">
            <Link href="/" className="group flex shrink-0 items-center gap-2.5">
              {logo}
              <span className="hidden leading-none sm:block">
                <span className="pixel block text-sm text-white">QUORLY</span>
                <span className="pixel mt-1 block text-[0.5rem] tracking-[0.08em] text-[var(--bar-dim)]">
                  ROUTE. PROVE. PAY.
                </span>
              </span>
            </Link>

            <div className="flex flex-1 justify-center">
              <Nav />
            </div>

            <AuthButtons />
          </div>
        </div>
        <div className="titlebar-dither rotate-180" />
      </header>

      <main className="mx-auto w-full max-w-6xl grow px-6 py-14 lg:px-10 lg:py-16">{children}</main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-14 lg:px-10">
        <div className="dithered">
          <div className="panel-flat flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
            <p className="panel-muted max-w-md text-sm leading-relaxed">
              Approval authority comes from the treasury&apos;s key quorum. The Selfie Check only
              proves a live human was behind the click.
            </p>
            <div className="panel-faint pixel flex shrink-0 flex-wrap gap-5 text-[0.625rem] uppercase">
              <Link href="/terms" className="hover:text-[var(--panel-accent)]">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-[var(--panel-accent)]">
                Privacy
              </Link>
              <a
                href="mailto:itsnisargthakkar@gmail.com"
                className="hover:text-[var(--panel-accent)]"
              >
                Support
              </a>
              <a href="https://github.com/Nishu0/quorly" className="hover:text-[var(--panel-accent)]">
                Source
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AuthButtons() {
  const { ready, authenticated } = usePrivy();

  // Render the signed-out pair until Privy settles: a spinner in the corner is
  // noisier than a link that briefly points the wrong way.
  const signedIn = ready && authenticated;

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="hidden px-3 py-1.5 text-[0.8125rem] text-[var(--bar-dim)] transition-colors hover:text-white sm:block"
      >
        {signedIn ? "Dashboard" : "Log in"}
      </Link>
      <a
        href="/slack/install"
        className="titlebar-btn bg-white px-4 py-2 text-[0.8125rem] font-medium text-[#0d1f30]"
      >
        Add to Slack
      </a>
    </div>
  );
}
