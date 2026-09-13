"""Draws the one-slide flow: Alice invoices, Nisarg approves with his face, the
quorum pays.

Deliberately five steps and no more. The real sequence has fourteen, which is
the right level of detail for a README and the wrong one for a slide somebody
has to explain out loud in twenty seconds.

Palette matches the Prezi template it sits in.

    python scripts/make_flow_image.py      # writes assets/prezi/flow-simple.png
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "prezi" / "flow-simple.png"
LOGO = ROOT / "apps" / "web" / "public" / "logo.png"

W, H = 2000, 760
CREAM = (252, 251, 227)
CORAL = (232, 130, 108)
GREEN = (60, 107, 93)
INK = (26, 38, 34)
MUTED = (122, 138, 130)
WHITE = (255, 255, 255)

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


F_TITLE = font(BOLD, 62)
F_NODE = font(BOLD, 34)
F_BODY = font(REG, 26)
F_SMALL = font(REG, 22)
F_STEP = font(BOLD, 24)
F_AMT = font(BOLD, 44)


def centre(d, text, cx, y, f, fill):
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text((cx - w / 2, y), text, font=f, fill=fill)


def card(d, cx, cy, w, h, fill, radius=28, outline=None, width=3):
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
                        radius=radius, fill=fill, outline=outline, width=width)


def arrow(d, x0, x1, y, colour=GREEN, width=6):
    d.line([(x0, y), (x1 - 22, y)], fill=colour, width=width)
    d.polygon([(x1, y), (x1 - 24, y - 13), (x1 - 24, y + 13)], fill=colour)


def build():
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)

    d.text((90, 60), "How $2,000 gets paid", font=F_TITLE, fill=INK)
    d.text((92, 140), "Five steps. About sixty seconds.", font=F_BODY, fill=MUTED)

    y = 430                    # centre line the whole row hangs off
    xs = [270, 640, 1010, 1380, 1740]
    cw, ch = 300, 240

    # 1 — Alice raises the invoice
    card(d, xs[0], y, cw, ch, WHITE, outline=CORAL)
    centre(d, "ALICE", xs[0], y - 92, F_NODE, INK)
    centre(d, "Contractor", xs[0], y - 50, F_SMALL, MUTED)
    centre(d, "$2,000", xs[0], y + 4, F_AMT, CORAL)
    centre(d, "invoice, by Slack", xs[0], y + 62, F_SMALL, MUTED)
    centre(d, "or dashboard", xs[0], y + 92, F_SMALL, MUTED)

    # 2 — Quorly reads and routes it. Logo sits here.
    card(d, xs[1], y, cw, ch, WHITE, outline=GREEN)
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA").resize((84, 84))
        img.paste(logo, (int(xs[1] - 42), int(y - 100)), logo)
    centre(d, "QUORLY", xs[1], y - 4, F_NODE, INK)
    centre(d, "reads the PDF,", xs[1], y + 44, F_SMALL, MUTED)
    centre(d, "routes on policy", xs[1], y + 74, F_SMALL, MUTED)

    # 3 — Nisarg approves, and proves he is there
    card(d, xs[2], y, cw, ch, WHITE, outline=CORAL)
    centre(d, "NISARG", xs[2], y - 92, F_NODE, INK)
    centre(d, "Manager", xs[2], y - 50, F_SMALL, MUTED)
    centre(d, "approves", xs[2], y - 2, F_BODY, INK)
    d.rounded_rectangle([xs[2] - 118, y + 40, xs[2] + 118, y + 96],
                        radius=16, fill=(238, 246, 242))
    centre(d, "+ World ID selfie", xs[2], y + 54, F_SMALL, GREEN)

    # 4 — the quorum, not a person, releases it
    card(d, xs[3], y, cw, ch, WHITE, outline=GREEN)
    centre(d, "PRIVY", xs[3], y - 92, F_NODE, INK)
    centre(d, "Key quorum", xs[3], y - 50, F_SMALL, MUTED)
    for i in range(3):
        cx = xs[3] - 58 + i * 58
        filled = i < 2
        d.ellipse([cx - 20, y - 4, cx + 20, y + 36],
                  fill=GREEN if filled else None,
                  outline=GREEN if filled else MUTED, width=3)
        if filled:
            d.line([(cx - 9, y + 16), (cx - 2, y + 24), (cx + 10, y + 6)],
                   fill=WHITE, width=4)
    centre(d, "2 of 3 sign", xs[3], y + 62, F_SMALL, MUTED)

    # 5 — and it lands back with Alice
    card(d, xs[4], y, cw, ch, GREEN, outline=GREEN)
    centre(d, "PAID", xs[4], y - 88, F_NODE, WHITE)
    centre(d, "$2,000", xs[4], y - 34, F_AMT, WHITE)
    centre(d, "QUSD to Alice's", xs[4], y + 28, F_SMALL, (214, 232, 224))
    centre(d, "own wallet", xs[4], y + 58, F_SMALL, (214, 232, 224))

    for a, b in zip(xs, xs[1:]):
        arrow(d, a + cw / 2 + 14, b - cw / 2 - 8, y)

    # Step numbers, so it can be talked through by number.
    for i, x in enumerate(xs, 1):
        d.ellipse([x - 22, y - ch / 2 - 46, x + 22, y - ch / 2 - 2], fill=CORAL)
        centre(d, str(i), x, y - ch / 2 - 39, F_STEP, WHITE)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
