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
      <header className="sticky top-0 z-30 px-5 pt-4 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href="/"
            className="navchip group flex shrink-0 items-center gap-2.5 py-1.5 pl-1.5 pr-4"
          >
            {logo}
            <span className="pixel hidden text-[0.8125rem] leading-none text-[#0b1f31] sm:block">
              QUORLY
            </span>
          </Link>

          <div className="flex flex-1 justify-center">
            <Nav />
          </div>

          <AuthButtons />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl grow px-6 pb-14 pt-10 lg:px-10 lg:pb-16 lg:pt-12">{children}</main>

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
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="navchip navlink hidden px-4 py-2 text-[0.8125rem] sm:block"
      >
        {signedIn ? "Dashboard" : "Log in"}
      </Link>
      <a href="/slack/install" className="navcta px-4 py-2 text-[0.8125rem] font-medium">
        Add to Slack
      </a>
    </div>
  );
}
