import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quorly — face-verified approvals for company money",
  description:
    "Slack-native invoice approvals with Privy key quorums, enclave-enforced policies, and a live World ID Selfie Check at the moment money moves.",
};

const NAV = [
  { href: "/", label: "Invoices" },
  { href: "/policies", label: "Policies" },
  { href: "/team", label: "Team" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--color-line)]/60">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
            <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
              quorly<span className="text-[var(--color-accent)]">.</span>
            </Link>
            <nav className="flex gap-5 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="opacity-70 transition hover:opacity-100">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
