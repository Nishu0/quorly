"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/quorly/nav";
import { SignInButton } from "@/components/quorly/auth";

/**
 * Marketing chrome for the public pages only.
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
  const bare = pathname.startsWith("/dashboard");
  const minimal = pathname.startsWith("/login");

  if (bare) return <>{children}</>;

  if (minimal) {
    return <div className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-10">{children}</div>;
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-rule bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6 lg:px-10">
          {logo}
          <Nav />
          <div className="ml-auto flex items-center gap-5">
            <span className="hidden items-center gap-2 rounded-full border border-rule px-2.5 py-1 lg:flex">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-forest opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-forest" />
              </span>
              <span className="label !text-ink-soft">Base Sepolia</span>
            </span>
            <SignInButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl grow px-6 py-14 lg:px-10 lg:py-20">{children}</main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-14 lg:px-10">
        <div className="flex flex-col gap-4 border-t border-rule pt-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-md text-sm leading-relaxed text-ink-faint">
            Approval authority comes from the treasury&apos;s key quorum. The Selfie Check only
            proves a live human was behind the click.
          </p>
          <div className="flex shrink-0 flex-wrap gap-5 text-xs text-ink-faint">
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <a
              href="mailto:itsnisargthakkar@gmail.com"
              className="transition-colors hover:text-foreground"
            >
              Support
            </a>
            <a
              href="https://github.com/Nishu0/quorly"
              className="transition-colors hover:text-foreground"
            >
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
