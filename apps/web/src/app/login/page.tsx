import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { apiOrNull, type Member } from "@/lib/api";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

function hasLogo() {
  return ["apps/web/public/logo.png", "public/logo.png"].some((p) =>
    existsSync(join(process.cwd(), p)),
  );
}

export default async function LoginPage() {
  // Already signed in? There's nothing to do here.
  const me = await apiOrNull<Member>("/api/me");
  if (me) redirect("/dashboard");

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex flex-col justify-between py-2">
        <Link href="/" className="flex items-center gap-2.5 text-sm">
          {hasLogo() && (
            <Image src="/logo.png" alt="" width={200} height={200} className="size-7 rounded-md" />
          )}
          <span className="display text-lg">Quorly</span>
        </Link>

        <div className="max-w-md py-16">
          <h1 className="display text-[2.75rem] leading-[1.05]">Welcome to Quorly</h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink-soft">
            Quorly is the approval checkpoint for company money: policy decides who signs, a live
            Selfie Check proves they were there, and a key quorum releases the payment.
          </p>

          <div className="mt-10">
            <LoginPanel />
          </div>

          <p className="mt-6 max-w-sm text-xs leading-relaxed text-ink-faint">
            Signing in matches you to a seat on your organisation&apos;s roster by email. If nobody
            has invited you yet, ask an owner — or{" "}
            <a href="/slack/install" className="underline underline-offset-4 hover:text-foreground">
              add Quorly to your Slack workspace
            </a>{" "}
            to create one.
          </p>
        </div>

        <div className="space-y-3 text-xs text-ink-faint">
          <p>
            By continuing, I agree to Quorly&apos;s{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <a href="mailto:itsnisargthakkar@gmail.com" className="hover:text-foreground">
              Support
            </a>
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden rounded-2xl border border-rule bg-ink lg:block">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          {hasLogo() && (
            <Image
              src="/logo.png"
              alt=""
              width={200}
              height={200}
              className="size-14 rounded-xl opacity-90"
            />
          )}
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.3em] text-white/40">
            Route. Prove. Release.
          </p>
        </div>

        {/* A single soft bloom, so the panel reads as depth rather than a flat block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.18]"
          style={{
            background: "radial-gradient(circle, var(--forest) 0%, transparent 62%)",
          }}
        />
      </div>
    </div>
  );
}
