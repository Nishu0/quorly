/**
 * Quorly Slack bot.
 *
 * Socket Mode on purpose: no tunnel, no public URL, works on a hackathon wifi.
 * The web app (Next.js) is the only thing that must be publicly reachable,
 * because World App has to redirect a real browser back to it.
 */
import { App, LogLevel } from "@slack/bolt";
import { eq, and, desc } from "drizzle-orm";
import {
  createInvoice, decide, executePayout, memberBySlackId, orgMembers,
  routeInvoice, env, usd, audit,
} from "@quorly/core";
import { db, invoices, members, orgs } from "@quorly/core/db";
import { invoiceCard, verifyPrompt, paidCard, rejectModal } from "./blocks";
import { classify, extractInvoice } from "./ai";

const app = new App({
  token: env.slack.botToken(),
  appToken: env.slack.appToken(),
  socketMode: true,
  logLevel: LogLevel.INFO,
});

const APP_URL = env.appUrl();
const EXPLORER = "https://sepolia.basescan.org";

/* ------------------------------------------------------------- utilities */

async function requireMember(slackUserId: string, say: (msg: string) => Promise<unknown>) {
  const member = await memberBySlackId(slackUserId);
  if (!member) {
    await say(
      `I don't have you on an Acme roster yet. Ask an admin to add your Slack ID \`${slackUserId}\` at ${APP_URL}/team.`,
    );
    return null;
  }
  return member;
}

/** Post the approval card to every eligible approver's DM. */
async function fanOutForApproval(invoiceId: string) {
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return;
  const submitter = await db.query.members.findFirst({ where: eq(members.id, invoice.submitterId) });
  const decision = await routeInvoice(invoice);
  if (!submitter) return;

  const blocks = invoiceCard({ invoice, submitter, decision, appUrl: APP_URL });

  for (const approver of decision.eligibleApprovers) {
    if (!approver.slackUserId) continue;
    await app.client.chat.postMessage({
      channel: approver.slackUserId,
      text: `Approval needed: ${usd(invoice.amount)} to ${submitter.name ?? submitter.email}`,
      blocks,
    });
  }
}

async function settleIfApproved(invoiceId: string, notifyChannel?: string) {
  const result = await executePayout(invoiceId);
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice) return;

  const channel = notifyChannel ?? invoice.slackChannelId;
  if (!channel) return;

  if (result.ok && result.txHash) {
    await app.client.chat.postMessage({
      channel,
      text: `Paid ${usd(invoice.amount)}`,
      blocks: paidCard({ invoice, txHash: result.txHash, explorer: EXPLORER }),
    });
  } else if (result.ok && result.intentId) {
    await app.client.chat.postMessage({
      channel,
      text: `Payout queued — Privy intent \`${result.intentId}\` is waiting on quorum signatures.`,
    });
  } else {
    await app.client.chat.postMessage({ channel, text: `:x: Payout failed: ${result.error}` });
  }
}

/* ------------------------------------------------------- invoice intake */

app.event("message", async ({ event, say, client }) => {
  const msg = event as unknown as {
    subtype?: string; channel_type?: string; user?: string; text?: string; channel: string;
    files?: { id: string; mimetype: string; url_private: string; name: string }[];
  };
  if (msg.subtype === "bot_message" || !msg.user) return;
  if (msg.channel_type !== "im") return;

  const member = await requireMember(msg.user, async (t) => say(t));
  if (!member) return;

  // --- an uploaded document is the main path ---
  const file = msg.files?.[0];
  if (file) {
    await say(":mag: Reading your invoice…");

    const res = await fetch(file.url_private, {
      headers: { Authorization: `Bearer ${env.slack.botToken()}` },
    });
    const buf = Buffer.from(await res.arrayBuffer());

    let extracted;
    try {
      extracted = await extractInvoice({
        fileBase64: buf.toString("base64"),
        mediaType: file.mimetype,
        userText: msg.text,
      });
    } catch (err) {
      await say(`:warning: I couldn't read that file. ${err instanceof Error ? err.message : ""}`);
      return;
    }

    if (!extracted.amount) {
      await say(
        `:warning: I couldn't find an amount on that document${
          extracted.missing.length ? ` (missing: ${extracted.missing.join(", ")})` : ""
        }. Tell me the amount and I'll file it.`,
      );
      return;
    }

    const { invoice, decision } = await createInvoice({
      orgId: member.orgId,
      submitterId: member.id,
      amount: extracted.amount,
      currency: extracted.currency === "USD" ? "USDC" : extracted.currency ?? "USDC",
      number: extracted.number ?? undefined,
      description: extracted.description ?? msg.text ?? undefined,
      dueDate: extracted.dueDate ? new Date(extracted.dueDate) : undefined,
      fileUrl: file.url_private,
      extracted: extracted as unknown as Record<string, unknown>,
      slackChannelId: msg.channel,
    });

    await client.chat.postMessage({
      channel: msg.channel,
      text: `Filed invoice for ${usd(invoice.amount)}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `:receipt: Filed *${usd(invoice.amount)} ${invoice.currency}*.\n` +
              `${decision.reason}\n` +
              `I've pinged ${decision.eligibleApprovers.map((a) => (a.slackUserId ? `<@${a.slackUserId}>` : a.name)).join(", ")}.`,
          },
        },
      ],
    });

    await fanOutForApproval(invoice.id);
    return;
  }

  // --- otherwise, free text ---
  if (!msg.text) return;
  const intent = await classify(msg.text);

  switch (intent.kind) {
    case "list_pending": {
      const rows = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.orgId, member.orgId), eq(invoices.status, "pending_approval")))
        .orderBy(desc(invoices.createdAt))
        .limit(10);
      await say(
        rows.length
          ? `*Open invoices*\n${rows.map((r) => `• ${usd(r.amount)} — ${r.description ?? r.id}`).join("\n")}`
          : "Nothing pending. Clean desk.",
      );
      break;
    }
    case "check_status": {
      const mine = await db
        .select()
        .from(invoices)
        .where(eq(invoices.submitterId, member.id))
        .orderBy(desc(invoices.createdAt))
        .limit(5);
      await say(
        mine.length
          ? mine.map((r) => `• ${usd(r.amount)} — *${r.status}*${r.txHash ? ` (${EXPLORER}/tx/${r.txHash})` : ""}`).join("\n")
          : "You haven't submitted anything yet. Drop a PDF in here.",
      );
      break;
    }
    case "explain_policy": {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.orgId, member.orgId), orderBy: desc(invoices.createdAt),
      });
      if (!invoice) { await say("No invoices yet to explain."); break; }
      const d = await routeInvoice(invoice);
      await say(`:scales: ${d.reason}`);
      break;
    }
    case "submit_invoice":
      await say("Upload the invoice PDF or image here and I'll file it, route it, and chase the approver.");
      break;
    default:
      await say(intent.kind === "unknown" ? intent.reply : "On it.");
  }
});

/* --------------------------------------------------------- approve/reject */

app.action("approve_invoice", async ({ ack, body, client, respond }) => {
  await ack();
  const invoiceId = (body as any).actions[0].value as string;
  const slackUserId = (body as any).user.id as string;

  const member = await memberBySlackId(slackUserId);
  if (!member) { await respond("I don't know who you are in Quorly."); return; }

  const outcome = await decide({ invoiceId, approverId: member.id, decision: "approve" });

  if (!outcome.ok && outcome.verifyUrl) {
    await client.chat.postEphemeral({
      channel: (body as any).channel?.id ?? slackUserId,
      user: slackUserId,
      text: outcome.message ?? "Selfie Check required",
      blocks: verifyPrompt({
        invoiceId, memberId: member.id, appUrl: APP_URL,
        reason: outcome.message ?? "Selfie Check required",
      }),
    });
    return;
  }

  if (!outcome.ok) { await respond(`:no_entry: ${outcome.message}`); return; }

  if (outcome.fullyApproved) {
    await respond(`:white_check_mark: Approved — quorum met (${outcome.collected}/${outcome.required}). Paying now.`);
    await settleIfApproved(invoiceId, slackUserId);
  } else {
    await respond(`:white_check_mark: Your approval is in (${outcome.collected}/${outcome.required}). Waiting on the rest of the quorum.`);
  }
});

app.action("reject_invoice", async ({ ack, body, client }) => {
  await ack();
  await client.views.open({
    trigger_id: (body as any).trigger_id,
    view: rejectModal((body as any).actions[0].value),
  });
});

app.view("reject_modal", async ({ ack, body, view, client }) => {
  await ack();
  const invoiceId = view.private_metadata;
  const note = view.state.values.reason?.value?.value ?? undefined;
  const member = await memberBySlackId(body.user.id);
  if (!member) return;

  const outcome = await decide({ invoiceId, approverId: member.id, decision: "reject", note });
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  const submitter = invoice
    ? await db.query.members.findFirst({ where: eq(members.id, invoice.submitterId) })
    : undefined;

  if (outcome.ok && submitter?.slackUserId) {
    await client.chat.postMessage({
      channel: submitter.slackUserId,
      text: `:x: Your invoice was rejected${note ? `: ${note}` : "."}`,
    });
  }
});

/* ------------------------------------------------------------- reminders */

app.action("remind_invoice", async ({ ack, body, client, respond }) => {
  await ack();
  const invoiceId = (body as any).actions[0].value as string;
  const slackUserId = (body as any).user.id as string;
  const inSeconds = 60 * 60; // 1 hour

  await client.chat.scheduleMessage({
    channel: slackUserId,
    post_at: Math.floor(Date.now() / 1000) + inSeconds,
    text: `:alarm_clock: Reminder — invoice \`${invoiceId}\` is still waiting on you. ${APP_URL}/invoices/${invoiceId}`,
  });

  await respond(":alarm_clock: I'll nudge you in an hour.");
});

/* ------------------------------------------------------- slash commands */

app.command("/quorly", async ({ ack, command, respond }) => {
  await ack();
  const member = await memberBySlackId(command.user_id);
  if (!member) { await respond(`Not on a roster. Add \`${command.user_id}\` at ${APP_URL}/team.`); return; }

  const [sub] = command.text.trim().split(/\s+/);
  switch (sub) {
    case "pending": {
      const rows = await db.select().from(invoices)
        .where(and(eq(invoices.orgId, member.orgId), eq(invoices.status, "pending_approval")));
      await respond(rows.length
        ? rows.map((r) => `• ${usd(r.amount)} — ${r.description ?? r.id}`).join("\n")
        : "Nothing pending.");
      break;
    }
    case "team": {
      const roster = await orgMembers(member.orgId);
      await respond(roster.map((m) => `• ${m.name ?? m.email} — _${m.role}_${m.ensSubname ? ` (${m.ensSubname})` : ""}`).join("\n"));
      break;
    }
    default:
      await respond(
        "*Quorly*\n" +
        "• DM me an invoice PDF to file it\n" +
        "• `/quorly pending` — open invoices\n" +
        "• `/quorly team` — the roster and who can approve\n" +
        `• Dashboard: ${APP_URL}`,
      );
  }
});

/* ------------------------------------------------------------------ boot */

const PORT = Number(process.env.BOT_PORT ?? 3010);
await app.start(PORT);
console.log(`⚡ Quorly bot running (socket mode). Web app: ${APP_URL}`);
