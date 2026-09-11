import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quorly — face-verified approvals for company money",
  description:
    "Slack-native invoice approvals with Privy key quorums, enclave-enforced policies, and a live World ID Selfie Check at the moment money moves.",
};

const NAV = [
  { href: "/", label: "Invoices" },
  { href: "/policies", label: "Policy" },
  { href: "/team", label: "Team" },
  { href: "/faucet", label: "Faucet" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <div className="relative z-10">
          <header className="sticky top-0 z-20 border-b border-rule bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6 lg:px-10">
              <Link href="/" className="group flex items-baseline gap-[3px]">
                <span className="display text-xl leading-none">Quorly</span>
                <span
                  aria-hidden
                  className="mb-[3px] size-[5px] rounded-full bg-forest transition-transform duration-300 group-hover:scale-150"
                />
              </Link>

              <nav className="flex items-center gap-7 text-sm">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="text-ink-soft transition-colors duration-200 hover:text-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto hidden items-center gap-2 sm:flex">
                <span className="size-1.5 rounded-full bg-forest" />
                <span className="label !text-ink-soft">Base Sepolia</span>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-14 lg:px-10 lg:py-20">{children}</main>

          <footer className="mx-auto max-w-6xl px-6 pb-16 lg:px-10">
            <div className="rule pt-6">
              <p className="max-w-xl text-sm leading-relaxed text-ink-faint">
                Approval authority comes from the treasury&apos;s key quorum. The Selfie Check only
                proves a live human was behind the click.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
