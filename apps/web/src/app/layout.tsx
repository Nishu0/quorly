import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SignInButton } from "@/components/quorly/auth";
import { Logo } from "@/components/quorly/logo";
import { Nav } from "@/components/quorly/nav";
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
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Quorly — face-verified approvals for company money",
    template: "%s · Quorly",
  },
  description:
    "Slack-native invoice approvals with Privy key quorums, enclave-enforced policies, and a live World ID Selfie Check at the moment money moves.",
  openGraph: {
    title: "Quorly",
    description: "Money moves when a live human says so.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <div className="relative z-10 flex min-h-screen flex-col">
            <header className="sticky top-0 z-20 border-b border-rule bg-background/75 backdrop-blur-xl">
              <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6 lg:px-10">
                <Logo />
                <Nav />

                <div className="ml-auto flex items-center gap-5">
                  <span
                    className="hidden items-center gap-2 rounded-full border border-rule px-2.5 py-1 lg:flex"
                    title="Settlement network"
                  >
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

            <main className="mx-auto w-full max-w-6xl grow px-6 py-14 lg:px-10 lg:py-20">
              {children}
            </main>

            <footer className="mx-auto w-full max-w-6xl px-6 pb-14 lg:px-10">
              <div className="flex flex-col gap-4 border-t border-rule pt-6 sm:flex-row sm:items-start sm:justify-between">
                <p className="max-w-md text-sm leading-relaxed text-ink-faint">
                  Approval authority comes from the treasury&apos;s key quorum. The Selfie Check
                  only proves a live human was behind the click.
                </p>
                <div className="flex shrink-0 gap-5 text-xs text-ink-faint">
                  <a
                    href="https://github.com/Nishu0/quorly"
                    className="transition-colors hover:text-foreground"
                  >
                    Source
                  </a>
                  <a href="/slack/install" className="transition-colors hover:text-foreground">
                    Add to Slack
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
