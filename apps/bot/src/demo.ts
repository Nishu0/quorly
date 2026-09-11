/**
 * Files a demo invoice and actually delivers the approval card to Slack, so the
 * approval flow can be exercised without uploading a PDF.
 *
 * This lives in the bot package because the card is Slack presentation — core
 * has no business knowing about Block Kit.
 *
 *   bun run demo:slack           # $2,400, standard tier, selfie check required
 *   bun run demo:slack 300       # fast lane, no biometric
 *   bun run demo:slack 20000     # high value, two approvers
 */
import { WebClient } from "@slack/web-api";
import { createInvoice, env, usd } from "@quorly/core";
import { invoiceCard } from "./blocks";

const amount = process.argv[2] ?? "2400";

const { invoice, decision } = await createInvoice({
  orgId: "org_demo_acme",
  submitterId: "mem_demo_contractor",
  amount,
  description: "Sprint 14 — contract engineering",
  number: `INV-${Math.floor(Math.random() * 9000 + 1000)}`,
  payeeAddress: "0x1111111111111111111111111111111111111111",
  payeeEns: "priya.acmelabs.eth",
});

console.log(`\nFiled ${invoice.id} for ${usd(amount)}`);
console.log(`Routing: ${decision.reason}\n`);

const slack = new WebClient(env.slack.botToken());
const submitter = { id: "mem_demo_contractor", name: "Priya (Contractor)", email: "priya@acme.test" };

let delivered = 0;
for (const approver of decision.eligibleApprovers) {
  if (!approver.slackUserId) {
    console.log(`  ${approver.name}: not linked to Slack — open ${env.appUrl()}/verify/${invoice.id}?member=${approver.id}`);
    continue;
  }
  await slack.chat.postMessage({
    channel: approver.slackUserId,
    text: `Approval needed: ${usd(invoice.amount)} to ${submitter.name}`,
    blocks: invoiceCard({
      invoice,
      submitter: submitter as never,
      decision,
      appUrl: env.appUrl(),
    }),
  });
  delivered++;
  console.log(`  sent approval card to ${approver.name} (${approver.slackUserId})`);
}

if (delivered === 0) {
  console.log("\nNobody to notify. Set SEED_SLACK_APPROVER in .env and re-run `bun run seed`.");
}
console.log(`\nInvoice page: ${env.appUrl()}/invoices/${invoice.id}\n`);
process.exit(0);
