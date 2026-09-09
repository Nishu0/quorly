import type { KnownBlock } from "@slack/types";
import { usd, type Invoice, type Member, type RoutingDecision } from "@quorly/core";

export function invoiceCard(input: {
  invoice: Invoice;
  submitter: Member;
  decision: RoutingDecision;
  collected?: number;
  appUrl: string;
}): KnownBlock[] {
  const { invoice, submitter, decision } = input;
  const collected = input.collected ?? 0;

  const facts = [
    `*Amount*\n${usd(invoice.amount)} ${invoice.currency}`,
    `*From*\n${submitter.name ?? submitter.email}`,
    `*Policy*\n${decision.policy.name}`,
    `*Approvals*\n${collected} of ${decision.requiredApprovals}`,
  ];

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Invoice ${invoice.number ?? invoice.id.slice(0, 12)}`, emoji: true },
    },
    { type: "section", fields: facts.map((t) => ({ type: "mrkdwn", text: t })) },
  ];

  if (invoice.description) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `_${invoice.description}_` } });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `:scales: ${decision.reason}` }],
  });

  if (decision.requiredAttestation) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: ":selfie: This tier requires a live *Selfie Check* at the moment of approval.",
      }],
    });
  }

  if (invoice.status === "pending_approval") {
    blocks.push({
      type: "actions",
      block_id: `inv_actions:${invoice.id}`,
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "Approve", emoji: true },
          action_id: "approve_invoice",
          value: invoice.id,
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "Reject", emoji: true },
          action_id: "reject_invoice",
          value: invoice.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Remind me later", emoji: true },
          action_id: "remind_invoice",
          value: invoice.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Open in Quorly", emoji: true },
          url: `${input.appUrl}/invoices/${invoice.id}`,
          action_id: "open_invoice",
        },
      ],
    });
  }

  return blocks;
}

export function verifyPrompt(input: { invoiceId: string; memberId: string; appUrl: string; reason: string }): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:lock: *${input.reason}*\nThis payout tier needs proof that a live human is behind the click — not a stolen Slack session or a bot.`,
      },
    },
    {
      type: "actions",
      elements: [{
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Verify with World ID", emoji: true },
        url: `${input.appUrl}/verify/${input.invoiceId}?member=${input.memberId}`,
        action_id: "goto_verify",
      }],
    },
    {
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: "Selfie Check takes ~10 seconds in World App. Your proof is bound to this one invoice and can't be reused.",
      }],
    },
  ];
}

export function paidCard(input: { invoice: Invoice; txHash?: string; explorer: string }): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:white_check_mark: *Paid* — ${usd(input.invoice.amount)} ${input.invoice.currency} sent to \`${input.invoice.payeeEns ?? input.invoice.payeeAddress}\``,
      },
    },
    ...(input.txHash
      ? [{
          type: "context" as const,
          elements: [{ type: "mrkdwn" as const, text: `<${input.explorer}/tx/${input.txHash}|View transaction>` }],
        }]
      : []),
  ];
}

export function rejectModal(invoiceId: string) {
  return {
    type: "modal" as const,
    callback_id: "reject_modal",
    private_metadata: invoiceId,
    title: { type: "plain_text" as const, text: "Reject invoice" },
    submit: { type: "plain_text" as const, text: "Reject" },
    blocks: [
      {
        type: "input" as const,
        block_id: "reason",
        label: { type: "plain_text" as const, text: "Why are you rejecting this?" },
        element: {
          type: "plain_text_input" as const,
          action_id: "value",
          multiline: true,
          placeholder: { type: "plain_text" as const, text: "Missing PO number, wrong rate, duplicate…" },
        },
      },
    ],
  };
}
