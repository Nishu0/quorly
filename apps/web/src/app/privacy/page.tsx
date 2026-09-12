import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/quorly/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="12 September 2026">
      <Section title="What we store">
        <p>
          Your email address and display name, so we can match you to a seat on your
          organisation&apos;s roster. Your Slack user and team IDs, so the bot knows who is talking
          to it. Your Privy user ID and wallet address. The invoices, approvals, and audit entries
          your organisation creates.
        </p>
        <p>
          Slack bot tokens for installed workspaces are stored so the bot can post on their behalf.
        </p>
      </Section>

      <Section title="What we deliberately do not store">
        <p>
          <strong className="text-[var(--panel-ink)]">No biometric data, ever.</strong> The Selfie Check
          happens entirely inside World App on your own device. Quorly never sees your face, an
          image of it, or any template derived from it. What reaches our server is a cryptographic
          proof and a nullifier — an opaque identifier that says a check passed, and nothing about
          who you are or what you look like.
        </p>
        <p>
          We don&apos;t hold private keys for your wallet. Privy does that, inside a secure enclave,
          and even Privy cannot move funds without a signature from a key it does not have.
        </p>
      </Section>

      <Section title="Who it's shared with">
        <p>
          Nobody, except the services required to make it work: Privy (authentication and wallets),
          World ID (proof verification), Slack (messages), and Neon (database hosting). We
          don&apos;t sell data, and there is no advertising or analytics tracking on this site.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          This is a hackathon project. Data lives as long as the demo does, and may be deleted at
          any time without notice. If you want your data removed sooner, email the address below
          and it will be.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          One session cookie, set by Privy, identifies you while signed in. There are no analytics,
          advertising, or tracking cookies.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, corrections, or deletion requests:{" "}
          <a
            href="mailto:itsnisargthakkar@gmail.com"
            className="underline underline-offset-4 hover:opacity-80"
          >
            itsnisargthakkar@gmail.com
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
