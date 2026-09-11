/**
 * Files a demo invoice and prints the approval link, so the web flow can be
 * exercised without a Slack workspace. `bun run demo:invoice [amount]`
 */
import { createInvoice } from "./service";
import { env } from "./env";

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

console.log(`\nFiled ${invoice.id} for $${amount}`);
console.log(`Routing: ${decision.reason}\n`);

if (decision.eligibleApprovers.length === 0) {
  console.log("No eligible approvers — did you run `bun run seed`?");
  process.exit(1);
}

console.log("Approve as:");
for (const a of decision.eligibleApprovers) {
  console.log(`  ${a.name}\n    ${env.appUrl()}/verify/${invoice.id}?member=${a.id}`);
}
console.log(`\nInvoice page: ${env.appUrl()}/invoices/${invoice.id}\n`);
process.exit(0);
