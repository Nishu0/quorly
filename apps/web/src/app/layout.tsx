import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono, Silkscreen } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/quorly/site-chrome";
import { BrandMark } from "@/components/quorly/brand-mark";
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

// Chrome only: title bars, window labels, the small uppercase runs. A bitmap
// face is the whole point at those sizes and unreadable at any other.
const pixel = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
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
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} ${pixel.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <SiteChrome logo={<BrandMark />}>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
