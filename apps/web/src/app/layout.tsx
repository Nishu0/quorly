import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/quorly/site-chrome";
import { Logo } from "@/components/quorly/logo";
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
          <SiteChrome logo={<Logo />}>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
