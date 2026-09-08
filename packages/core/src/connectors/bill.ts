/**
 * BILL (bill.com) connector — the "system of record" side of the loop.
 *
 * Quorly does not replace AP software; it wraps the approval step in Slack and
 * settles in stablecoin. Bills created here mirror into BILL so accounting
 * stays intact. Sandbox sign-up is self-serve:
 * https://developer.bill.com/docs/api-sandbox-sign-up
 */
import { env } from "../env";

const BASE = process.env.BILL_API_BASE ?? "https://gateway.stage.bill.com/connect/v3";

export interface BillSession {
  sessionId: string;
  organizationId: string;
}

export interface BillBill {
  id: string;
  invoiceNumber?: string;
  amount: number;
  dueDate?: string;
  vendorId: string;
  approvalStatus?: string;
  approvers?: { userId: string; status: string }[];
}

export class BillConnector {
  private session?: BillSession;

  constructor(
    private devKey = process.env.BILL_DEV_KEY ?? "",
    private username = process.env.BILL_USERNAME ?? "",
    private password = process.env.BILL_PASSWORD ?? "",
    private orgId = process.env.BILL_ORG_ID ?? "",
  ) {}

  get configured() {
    return Boolean(this.devKey && this.username && this.password && this.orgId);
  }

  async login(): Promise<BillSession> {
    if (this.session) return this.session;
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", devKey: this.devKey },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        organizationId: this.orgId,
      }),
    });
    if (!res.ok) throw new Error(`BILL login failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { sessionId: string };
    this.session = { sessionId: json.sessionId, organizationId: this.orgId };
    return this.session;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const s = await this.login();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        devKey: this.devKey,
        sessionId: s.sessionId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`BILL ${method} ${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  listBills(max = 50) {
    return this.call<{ results: BillBill[] }>("GET", `/bills?max=${max}`);
  }

  /** Bills whose approval policy names the signed-in user as an approver. */
  pendingApprovals() {
    return this.call<{ results: BillBill[] }>("GET", "/bills/approvals");
  }

  createBill(input: {
    vendorId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amount: number;
    description?: string;
  }) {
    return this.call<BillBill>("POST", "/bills", {
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      billLineItems: [{ amount: input.amount, description: input.description ?? "" }],
    });
  }

  /** Mirror a Quorly decision back into BILL so both systems agree. */
  decide(billId: string, decision: "approve" | "deny", comment?: string) {
    return this.call<{ status: string }>("POST", `/bills/${billId}/approvals/${decision}`, {
      comment: comment ?? "Decided in Quorly (Slack) with a live Selfie Check",
    });
  }
}

export const billConnector = () => new BillConnector();
