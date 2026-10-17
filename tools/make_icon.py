"""Draw the home-screen icon: two interlocked rings on the board colour.

    python -I tools/make_icon.py        -> src/icons/icon-180.png, icon-512.png

Drawn, not taken from the APK: no Nebula art ships in this game."""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "icons")


def ring(d, cx, cy, r, w, col, dark, light, gap_dir, gap):
    a0 = gap_dir + gap / 2
    a1 = gap_dir + 360 - gap / 2
    box = [cx - r, cy - r, cx + r, cy + r]
    d.arc([box[0] + w * 0.12, box[1] + w * 0.35, box[2] + w * 0.12, box[3] + w * 0.35], a0, a1, fill=(170, 125, 80, 70), width=int(w * 1.05))
    d.arc(box, a0, a1, fill=dark, width=int(w))
    inner = [box[0] + w * 0.11, box[1] + w * 0.11, box[2] - w * 0.11, box[3] - w * 0.11]
    d.arc(inner, a0, a1, fill=col, width=int(w * 0.78))
    hl = [box[0] - w * 0.04, box[1] - w * 0.18, box[2] - w * 0.04, box[3] - w * 0.18]
    d.arc(hl, a0, a1, fill=light, width=max(2, int(w * 0.2)))
    for a in (a0, a1):
        t = math.radians(a)
        x, y = cx + math.cos(t) * (r - w / 2), cy + math.sin(t) * (r - w / 2)
        rr = w / 2
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=dark)
        rr2 = rr * 0.78
        d.ellipse([x - rr2, y - rr2, x + rr2, y + rr2], fill=col)


def make(size):
    S = size * 4
    im = Image.new("RGBA", (S, S), (246, 233, 211, 255))
    d = ImageDraw.Draw(im)
    w = S * 0.075
    r = S * 0.185
    # PIL angles run clockwise from +x
    ring(d, S * 0.27, S * 0.5, r, w, (50, 175, 221), (28, 112, 150), (170, 225, 245), 180, 90)
    # the pin: stem from the blue ring to the orange one, head on the orange tube
    sx0, sx1 = S * 0.27 + r, S * 0.73 - r
    d.rectangle([sx0, S * 0.5 - w * 0.36, sx1, S * 0.5 + w * 0.36], fill=(28, 112, 150))
    ring(d, S * 0.73, S * 0.5, r, w, (236, 143, 46), (168, 92, 20), (250, 205, 150), 0, 90)
    hx = S * 0.73 - r
    d.rounded_rectangle([hx - w * 0.75, S * 0.5 - w * 0.62, hx + w * 0.75, S * 0.5 + w * 0.62], radius=w * 0.2, fill=(28, 112, 150))
    d.rounded_rectangle([hx - w * 0.6, S * 0.5 - w * 0.5, hx + w * 0.6, S * 0.5 + w * 0.4], radius=w * 0.16, fill=(50, 175, 221))
    return im.resize((size, size), Image.LANCZOS).convert("RGB")


os.makedirs(OUT, exist_ok=True)
for s in (180, 512):
    make(s).save(os.path.join(OUT, f"icon-{s}.png"))
print("icons ->", OUT)
