"""Builds the demo invoice PDF.

Written for the demo, but written the way a real one would be: the extractor
reads this with Claude, so the fields it looks for — amount, invoice number,
description — each appear once, unambiguously, in plain text. A prettier
invoice with the total buried in a graphic is a worse test of the pipeline.

    python scripts/make_invoice.py        # writes Invoice-INV-2041.pdf
"""

from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#8A8A8A")
LINE = colors.HexColor("#DDDBD4")
BLUE = colors.HexColor("#0851BF")

NUMBER = "INV-2041"
AMOUNT = 1500.00
CURRENCY = "USD"

FROM = {
    "name": "Nishu",
    "email": "itsthakkarnisarg@gmail.com",
    "role": "Contract engineering",
}
TO = {
    "name": "Nisarg Org",
    "attn": "Accounts Payable",
}

LINES = [
    ("Sprint 15 — backend engineering", "55 hrs", 20.00, 1100.00),
    ("On-call cover, week 37", "1 wk", 200.00, 200.00),
    ("Infrastructure review", "4 hrs", 20.00, 80.00),
    ("Reimbursement — AI API usage (Claude, OpenRouter)", "—", 120.00, 120.00),
]

W, H = A4


def rule(c, y, x0=20 * mm, x1=W - 20 * mm, colour=LINE, width=0.7):
    c.setStrokeColor(colour)
    c.setLineWidth(width)
    c.line(x0, y, x1, y)


def build(path="Invoice-INV-2041.pdf"):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Invoice {NUMBER} — {FROM['name']}")
    c.setAuthor(FROM["name"])

    issued = date.today()

    # ── header ────────────────────────────────────────────────────────────
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(20 * mm, H - 30 * mm, "INVOICE")

    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawRightString(W - 20 * mm, H - 26 * mm, "Invoice number")
    c.drawRightString(W - 20 * mm, H - 38 * mm, "Date issued")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(W - 20 * mm, H - 32 * mm, NUMBER)
    c.setFont("Helvetica", 11)
    c.drawRightString(W - 20 * mm, H - 44 * mm, issued.strftime("%d %B %Y"))

    rule(c, H - 64 * mm)

    # ── parties ───────────────────────────────────────────────────────────
    y = H - 76 * mm
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(20 * mm, y, "FROM")
    c.drawString(105 * mm, y, "BILL TO")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y - 7 * mm, FROM["name"])
    c.drawString(105 * mm, y - 7 * mm, TO["name"])

    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(20 * mm, y - 13 * mm, FROM["email"])
    c.drawString(20 * mm, y - 19 * mm, FROM["role"])
    c.drawString(105 * mm, y - 13 * mm, TO["attn"])

    # ── line items ────────────────────────────────────────────────────────
    y = H - 108 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "DESCRIPTION")
    c.drawString(122 * mm, y, "QTY")
    c.drawRightString(160 * mm, y, "RATE")
    c.drawRightString(W - 20 * mm, y, "AMOUNT")
    rule(c, y - 3 * mm)

    y -= 12 * mm
    for desc, qty, rate, amount in LINES:
        c.setFillColor(INK)
        c.setFont("Helvetica", 10.5)
        c.drawString(20 * mm, y, desc)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 10)
        c.drawString(122 * mm, y, qty)
        c.drawRightString(160 * mm, y, f"${rate:,.2f}")
        c.setFillColor(INK)
        c.setFont("Helvetica", 11)
        c.drawRightString(W - 20 * mm, y, f"${amount:,.2f}")
        y -= 9 * mm

    y -= 2 * mm
    rule(c, y)

    # ── total. Stated once, in words a reader and a model both parse. ─────
    y -= 12 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawRightString(150 * mm, y, "Subtotal")
    c.setFillColor(INK)
    c.setFont("Helvetica", 11)
    c.drawRightString(W - 20 * mm, y, f"${AMOUNT:,.2f}")

    y -= 8 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawRightString(150 * mm, y, "Tax")
    c.setFillColor(INK)
    c.setFont("Helvetica", 11)
    c.drawRightString(W - 20 * mm, y, "$0.00")

    y -= 12 * mm
    rule(c, y + 5 * mm, x0=110 * mm, colour=INK, width=1.0)
    c.setFillColor(INK)
    # Label left of its own column, not right-aligned into the number.
    c.setFont("Helvetica-Bold", 13)
    c.drawString(118 * mm, y - 2 * mm, "Total due")
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(W - 20 * mm, y - 3 * mm, f"${AMOUNT:,.2f} {CURRENCY}")

    # ── payment ───────────────────────────────────────────────────────────
    y -= 26 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "PAYMENT")
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y - 7 * mm,
                 "Payable in stablecoin to the wallet on file for this contractor.")
    c.drawString(20 * mm, y - 13 * mm, "Reference the invoice number on payment.")

    # ── footer ────────────────────────────────────────────────────────────
    rule(c, 28 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, 22 * mm, f"{FROM['name']} · {FROM['email']}")
    c.drawRightString(W - 20 * mm, 22 * mm, f"{NUMBER} · Page 1 of 1")

    c.showPage()
    c.save()
    print(f"wrote {path}")


if __name__ == "__main__":
    build()
