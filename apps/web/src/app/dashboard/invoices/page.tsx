import type { Metadata } from "next";
import { api, type Invoice, type Member } from "@/lib/api";
import { InvoiceBoard } from "./invoice-board";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [me, data] = await Promise.all([
    api<Member>("/api/me"),
    api<{ invoices: Invoice[] }>("/api/invoices"),
  ]);

  return <InvoiceBoard initial={data.invoices ?? []} me={me} />;
}
