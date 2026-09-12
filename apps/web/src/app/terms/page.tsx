import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/quorly/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="12 September 2026">
      <Section title="What Quorly is">
        <p>
          Quorly routes invoice approvals through Slack and settles them from a wallet governed by
          a key quorum. It was built for the ETHOnline 2026 hackathon as a demonstration of that
          idea, and it is offered as-is.
        </p>
        <p>
          The service runs on Base Sepolia using QUSD, a test token with no monetary value. Nothing
          here moves real funds, and nothing here should be relied on as though it did.
        </p>
      </Section>

      <Section title="Using it">
        <p>
          You need an invitation to an organisation, or you can create one by installing the Slack
          app in a workspace you administer. You are responsible for who you invite and what role
          you give them — an owner can change policy, and an approver can release payments within
          it.
        </p>
        <p>
          Don&apos;t use Quorly to break the law, to impersonate someone, or to try to get around
          the approval controls it exists to enforce.
        </p>
      </Section>

      <Section title="No warranty, no liability">
        <p>
          Quorly is provided without warranty of any kind. There is no uptime commitment, no
          support obligation, and no guarantee that data will be retained. The database may be
          reset without notice.
        </p>
        <p>
          To the extent the law allows, the author is not liable for any loss arising from your use
          of it — including any loss of test funds, data, or time.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          Quorly depends on Privy for wallets and authentication, World ID for the Selfie Check,
          Slack for the bot, and Base Sepolia for settlement. Each has its own terms, and Quorly
          can&apos;t offer guarantees on their behalf.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may change as the project does. Continuing to use Quorly after a change means
          you accept it.
        </p>
        <p>
          Reach the author at{" "}
          <a
            href="mailto:itsnisargthakkar@gmail.com"
            className="underline underline-offset-4 hover:text-foreground"
          >
            itsnisargthakkar@gmail.com
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
