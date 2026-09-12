import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { apiOrNull, type Member } from "@/lib/api";
import { LoginPanel } from "./login-panel";
import { BrandMark } from "@/components/quorly/brand-mark";
import { DitherBackground } from "@/components/quorly/dither-background";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";


export default async function LoginPage() {
  // Already signed in? There's nothing to do here.
  const me = await apiOrNull<Member>("/api/me");
  if (me) redirect("/dashboard");

  return (
    <div className="dithered grid min-h-[calc(100vh-4rem)] gap-10 lg:grid-cols-2 lg:gap-16">
      <DitherBackground light="#ffffff" dark="#5ea6e5" scale={3} />
      <div className="flex flex-col justify-between py-2">
        <Link href="/" className="navchip group inline-flex w-fit items-center py-1.5 pl-1.5 pr-4">
          <BrandMark />
        </Link>

        <div className="panel max-w-md p-8">
          <h1 className="display text-[2.75rem] leading-[1.05]">Welcome to Quorly</h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed panel-muted">
            Quorly is the approval checkpoint for company money: policy decides who signs, a live
            Selfie Check proves they were there, and a key quorum releases the payment.
          </p>

          <div className="mt-10">
            <LoginPanel />
          </div>

          <p className="mt-6 max-w-sm text-xs leading-relaxed panel-faint">
            Signing in matches you to a seat on your organisation&apos;s roster by email. If nobody
            has invited you yet, ask an owner — or{" "}
            <a href="/slack/install" className="underline underline-offset-4 hover:opacity-80">
              add Quorly to your Slack workspace
            </a>{" "}
            to create one.
          </p>
        </div>

        <div className="panel-flat panel-faint space-y-3 p-5 text-xs">
          <p>
            By continuing, I agree to Quorly&apos;s{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:opacity-80">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:opacity-80">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:opacity-80">
              Terms
            </Link>
            <Link href="/privacy" className="hover:opacity-80">
              Privacy
            </Link>
            <a href="mailto:itsnisargthakkar@gmail.com" className="hover:opacity-80">
              Support
            </a>
          </div>
        </div>
      </div>

      <div className="panel relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          <Image
            src="/logo.png"
            alt=""
            width={200}
            height={200}
            className="size-14 rounded-xl"
          />
          <p className="pixel text-[0.6875rem] uppercase tracking-[0.24em] text-[var(--panel-ink)]">
            Route. Prove. Pay.
          </p>
        </div>

        {/* A single soft bloom, so the panel reads as depth rather than a flat block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.18]"
          style={{
            background: "radial-gradient(circle, #ffffff 0%, transparent 60%)",
          }}
        />
      </div>
    </div>
  );
}
