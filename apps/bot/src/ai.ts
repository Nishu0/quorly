/**
 * The AI layer: turns "hey, pay this" + a PDF into a structured invoice, and
 * turns free-text Slack messages into bot actions.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@quorly/core";

const client = () => new Anthropic({ apiKey: env.ai.apiKey() });

export interface ExtractedInvoice {
  amount: string | null;
  currency: string | null;
  number: string | null;
  description: string | null;
  dueDate: string | null;
  vendor: string | null;
  confidence: number;
  missing: string[];
}

const EXTRACT_TOOL = {
  name: "record_invoice",
  description: "Record the structured fields extracted from an invoice document.",
  input_schema: {
    type: "object" as const,
    properties: {
      amount: { type: ["string", "null"], description: "Total due, digits only, e.g. 2400.00" },
      currency: { type: ["string", "null"], description: "ISO code or USDC. Default USD." },
      number: { type: ["string", "null"], description: "Invoice number" },
      description: { type: ["string", "null"], description: "One line describing the work billed" },
      dueDate: { type: ["string", "null"], description: "ISO 8601 date" },
      vendor: { type: ["string", "null"], description: "Who is billing" },
      confidence: { type: "number", description: "0-1 confidence in the extraction" },
      missing: { type: "array", items: { type: "string" }, description: "Required fields you could not find" },
    },
    required: ["amount", "confidence", "missing"],
  },
};

/** Extract invoice fields from an uploaded PDF or image. */
export async function extractInvoice(input: {
  fileBase64: string;
  mediaType: string;   // application/pdf | image/png | image/jpeg
  userText?: string;
}): Promise<ExtractedInvoice> {
  if (!env.ai.apiKey()) {
    return { amount: null, currency: null, number: null, description: null, dueDate: null, vendor: null, confidence: 0, missing: ["ANTHROPIC_API_KEY not set"] };
  }

  const isPdf = input.mediaType === "application/pdf";
  const doc = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: input.fileBase64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: input.mediaType as "image/png", data: input.fileBase64 } };

  const res = await client().messages.create({
    model: env.ai.model(),
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "record_invoice" },
    messages: [{
      role: "user",
      content: [
        doc,
        {
          type: "text",
          text:
            "Extract the invoice fields. Do not guess an amount you cannot see — " +
            "list it under `missing` instead. Money moves off this extraction, so " +
            "prefer null over a plausible-looking hallucination." +
            (input.userText ? `\n\nThe submitter also said: ${input.userText}` : ""),
        },
      ],
    }],
  });

  const tool = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!tool) throw new Error("Model returned no extraction");
  return tool.input as unknown as ExtractedInvoice;
}

export type BotIntent =
  | { kind: "submit_invoice"; amount?: string; description?: string }
  | { kind: "check_status" }
  | { kind: "list_pending" }
  | { kind: "set_reminder"; minutes: number }
  | { kind: "explain_policy" }
  | { kind: "unknown"; reply: string };

const INTENT_TOOL = {
  name: "route",
  description: "Route the user's Slack message to a Quorly action.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: { type: "string", enum: ["submit_invoice", "check_status", "list_pending", "set_reminder", "explain_policy", "unknown"] },
      amount: { type: ["string", "null"] },
      description: { type: ["string", "null"] },
      minutes: { type: ["number", "null"], description: "For set_reminder" },
      reply: { type: ["string", "null"], description: "For unknown: a short helpful reply" },
    },
    required: ["kind"],
  },
};

export async function classify(text: string): Promise<BotIntent> {
  if (!env.ai.apiKey()) return { kind: "unknown", reply: "AI routing is off — set ANTHROPIC_API_KEY." };

  const res = await client().messages.create({
    model: env.ai.model(),
    max_tokens: 2048,
    system:
      "You route messages for Quorly, a Slack bot for invoice approvals and stablecoin payouts. " +
      "Be decisive. If the user is uploading or describing work they want paid for, that's submit_invoice.",
    tools: [INTENT_TOOL],
    tool_choice: { type: "tool", name: "route" },
    messages: [{ role: "user", content: text }],
  });

  const tool = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  const out = (tool?.input ?? { kind: "unknown" }) as Record<string, unknown>;

  switch (out.kind) {
    case "submit_invoice":
      return { kind: "submit_invoice", amount: (out.amount as string) ?? undefined, description: (out.description as string) ?? undefined };
    case "check_status": return { kind: "check_status" };
    case "list_pending": return { kind: "list_pending" };
    case "set_reminder": return { kind: "set_reminder", minutes: Number(out.minutes ?? 60) };
    case "explain_policy": return { kind: "explain_policy" };
    default: return { kind: "unknown", reply: (out.reply as string) ?? "I can take invoices, chase approvals, and pay them out. Try uploading a PDF." };
  }
}
