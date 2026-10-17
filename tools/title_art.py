"""The "Ring Twist" title on Home, out of the font the page already ships.

The owner (2026-10-17): the title must stop looking like Seat Jam's (stroked
type on a sunburst). So it is made of the game's own stuff: render3d.js extrudes
these letters into candy, the material the rings are made of, and makes them
bob and twist. Each letter is a ring colour; the dots on the i's are small rings.

This takes every letter's outline out of src/fonts/Nunito-latin-5.woff2 at its
heaviest (wght 1000), places and colours them, and writes:
  - the TITLE block in src/render3d.js (font units, 1000 to the em, y up), and
  - the flat copy, <svg class="ttl"> in src/game_head.html, for a browser
    without WebGL (html.flat). In 3D the flat copy only holds the place.

    python tools/title_art.py
"""
import pathlib
import re

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / "src" / "fonts" / "Nunito-latin-5.woff2"
WGHT = 1000
LINES = ["Ring", "Twist"]
# the game's ring colours (levels.json), round the rainbow twice
COLS = ["#dd433e", "#ec8f2e", "#6ac53e", "#32afdd",
        "#4e77dd", "#984be0", "#dd433e", "#ec8f2e", "#6ac53e"]
TRACK = -14                      # font units between letters: heavy type sits loose
KERN = {("T", "w"): -52}
LEAD = 905                       # baseline to baseline: the dot-ring of "Twist" clears "Ring"


def fmt(v):
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


class PathPen(BasePen):
    """M L Q Z only, so render3d.js and the SVG read the same string."""
    def __init__(self, gs):
        super().__init__(gs)
        self.o = []

    def _moveTo(self, p):
        self.o.append("M%s %s" % (fmt(p[0]), fmt(p[1])))

    def _lineTo(self, p):
        self.o.append("L%s %s" % (fmt(p[0]), fmt(p[1])))

    def _qCurveToOne(self, c, p):
        self.o.append("Q%s %s %s %s" % (fmt(c[0]), fmt(c[1]), fmt(p[0]), fmt(p[1])))

    def _curveToOne(self, c1, c2, p):
        raise SystemExit("cubic outline: this font is not TrueType")

    def _closePath(self):
        self.o.append("Z")

    def _endPath(self):
        self.o.append("Z")


def letters():
    f = instantiateVariableFont(TTFont(FONT), {"wght": WGHT})
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]

    def bounds(name):
        b = BoundsPen(gs)
        gs[name].draw(b)
        return b.bounds

    # the i's dot: the contour of "i" that sits highest
    rec = RecordingPen()
    gs[cmap[ord("i")]].draw(rec)
    contours, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            contours.append(cur)
            cur = []
    best = None
    for c in contours:
        pts = [p for _, a in c for p in a if p is not None]
        ys = [p[1] for p in pts]
        if best is None or min(ys) > best[1]:
            xs = [p[0] for p in pts]
            best = ((min(xs) + max(xs)) / 2, min(ys), (max(xs) - min(xs)) / 2, (max(ys) + min(ys)) / 2)
    dot_x, _, dot_r, dot_y = best

    out, dots, k = [], [], 0
    for li, word in enumerate(LINES):
        base = -li * LEAD
        names = [cmap[0x131] if ch == "i" else cmap[ord(ch)] for ch in word]
        xs, x = [], 0
        for i, n in enumerate(names):
            if i:
                x += TRACK + KERN.get((word[i - 1], word[i]), 0)
            xs.append(x)
            x += hmtx[n][0]
        x0 = xs[0] + bounds(names[0])[0]
        x1 = xs[-1] + bounds(names[-1])[2]
        shift = -(x0 + x1) / 2                       # each line centred on its ink
        for ch, n, gx in zip(word, names, xs):
            pen = PathPen(gs)
            gs[n].draw(pen)
            b = bounds(n)
            item = {"ch": ch, "c": COLS[k], "x": round(gx + shift, 1), "y": base, "d": "".join(pen.o),
                    "b": [round(v, 1) for v in b]}
            out.append(item)
            if ch == "i":
                dots.append({"x": round(gx + shift + dot_x, 1), "y": round(base + dot_y, 1), "r": round(dot_r, 1), "c": COLS[k]})
            k += 1
    ink = [min(o["x"] + o["b"][0] for o in out), min(o["y"] + o["b"][1] for o in out),
           max(o["x"] + o["b"][2] for o in out), max(o["y"] + o["b"][3] for o in out)]
    ink = [min(ink[0], min(d["x"] - d["r"] for d in dots)), ink[1], max(ink[2], max(d["x"] + d["r"] for d in dots)),
           max(ink[3], max(d["y"] + d["r"] for d in dots))]
    return out, dots, [round(v, 1) for v in ink]


def js_block(out, dots, box):
    rows = ",\n".join('    { ch: "%s", c: "%s", x: %s, y: %s, d: "%s" }' % (o["ch"], o["c"], fmt(o["x"]), fmt(o["y"]), o["d"]) for o in out)
    drows = ", ".join('{ x: %s, y: %s, r: %s, c: "%s" }' % (fmt(d["x"]), fmt(d["y"]), fmt(d["r"]), d["c"]) for d in dots)
    return ("/*title*/{\n  box: [%s],\n  letters: [\n%s\n  ],\n  dots: [%s]\n  }/*/title*/"
            % (", ".join(fmt(v) for v in box), rows, drows))


def tone(col, to, t):
    a = [int(col[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join("%02x" % round(a[i] + (to[i] - a[i]) * t) for i in range(3))


def svg_title(out, dots, box):
    """The flat copy: the same letters, a white rim, a slab under each, a ramp on the face."""
    pad, depth, rim = 70, 70, 64
    x0, y0, x1, y1 = box[0] - pad, box[1] - pad - depth, box[2] + pad, box[3] + pad
    w, h = x1 - x0, y1 - y0
    o = ['<svg class="ttl" viewBox="0 0 %s %s" aria-hidden="true"><defs>' % (fmt(w), fmt(h))]
    for i, it in enumerate(out):
        lt, dk = tone(it["c"], (255, 255, 255), 0.38), tone(it["c"], (20, 10, 30), 0.12)
        o.append('<linearGradient id="tt%d" gradientUnits="userSpaceOnUse" x1="0" y1="%s" x2="0" y2="%s">'
                 '<stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>'
                 % (i, fmt(it["y"] + 720), fmt(it["y"] - 20), lt, dk))
    o.append('</defs><g transform="translate(%s %s) scale(1 -1)">' % (fmt(-x0), fmt(y1)))

    def each(fn):
        return "".join(fn(i, it) for i, it in enumerate(out))
    dot = lambda d, stroke, sw, dy=0: '<circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%s"/>' % (fmt(d["x"]), fmt(d["y"] + dy), fmt(d["r"] * 0.78), stroke, fmt(sw))
    # the rim, round the letter and its slab
    o.append('<g fill="#fff" stroke="#fff" stroke-width="%d" stroke-linejoin="round">' % (2 * rim))
    o.append(each(lambda i, it: '<path transform="translate(%s %s)" d="%s"/>' % (fmt(it["x"]), fmt(it["y"] - depth), it["d"])))
    o.append(each(lambda i, it: '<path transform="translate(%s %s)" d="%s"/>' % (fmt(it["x"]), fmt(it["y"]), it["d"])))
    o.append("</g>" + "".join(dot(d, "#fff", d["r"] * 0.44 + 2 * rim, -depth / 2) for d in dots))
    # the slab: the letter again, a step at a time, in its own dark
    for dy in range(depth, 0, -14):
        o.append(each(lambda i, it: '<path transform="translate(%s %s)" d="%s" fill="%s"/>'
                      % (fmt(it["x"]), fmt(it["y"] - dy), it["d"], tone(it["c"], (20, 10, 30), 0.34))))
        o.append("".join(dot(d, tone(d["c"], (20, 10, 30), 0.34), d["r"] * 0.44, -dy) for d in dots))
    o.append(each(lambda i, it: '<path transform="translate(%s %s)" d="%s" fill="url(#tt%d)"/>' % (fmt(it["x"]), fmt(it["y"]), it["d"], i)))
    o.append("".join(dot(d, tone(d["c"], (255, 255, 255), 0.2), d["r"] * 0.44) for d in dots))
    o.append("</g></svg>")
    return "".join(o), w / h


def main():
    out, dots, box = letters()
    p = ROOT / "src" / "render3d.js"
    s = p.read_text(encoding="utf-8")
    s, n1 = re.subn(r"/\*title\*/.*?/\*/title\*/", lambda m: js_block(out, dots, box), s, count=1, flags=re.S)
    p.write_text(s, encoding="utf-8")
    svg, aspect = svg_title(out, dots, box)
    p = ROOT / "src" / "game_head.html"
    s = p.read_text(encoding="utf-8")
    s, n2 = re.subn(r'<svg class="ttl".*?</svg>', lambda m: svg, s, count=1, flags=re.S)
    p.write_text(s, encoding="utf-8")
    if n1 != 1 or n2 != 1:
        raise SystemExit("TITLE block or <svg class=\"ttl\"> not found (%d, %d)" % (n1, n2))
    print("title: %d letters, %d dots, box %s, flat copy %.3f wide per tall" % (len(out), len(dots), box, aspect))


if __name__ == "__main__":
    main()
