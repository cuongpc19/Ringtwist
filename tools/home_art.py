# -*- coding: utf-8 -*-
"""The drawn art in src/game_head.html: Home's flat rings and the bee.

    python tools/home_art.py          # rewrites the two inline <svg> in src/game_head.html
    python tools/home_art.py --ref art/ref
                                      # the old cover as 1080x1620 PNGs, with and without the
                                      # title: a layout to hand an image model to repaint

⚠ Since 2026-10-17 (the owner: "the rings turning in 3D like the game") Home is
drawn live by render3d.js home(), and the title by tools/title_art.py. What is
left on the page from here is the rings of the cover alone, flat (heroFlat): it
holds Home's middle for a browser without WebGL. The cover itself stays for --ref.

Seat Jam's home is an image-model render with its title baked in; this game has
no such render, so the same scene is drawn here as SVG - three rings joined by
clips, standing on a tiled floor under a sky with hedges, "Ring Twist" on a burst
(the game's name since 2026-10-17; the folder keeps "Rotate Ring"). The owner
took the bee off the cover and asked for "just 2-3 shapes". A bee,
pom-poms up, cheers over the level-complete card. Numbers are in the cover's
own 1080 x 1620 box (Seat Jam's cover size); the CSS fits it to the height.
⚠ Edit the art HERE and run this, not the inline copies: each is one long line.
"""
import math
import os
import pathlib
import random
import re
import subprocess
import sys
import tempfile

INK = "#1d2a5c"
BEE_INK = "#24305e"


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy - r * math.sin(a)


def arc(cx, cy, r, a0, a1):
    """counter-clockwise on screen from a0 to a1 (degrees, maths convention, y up)"""
    x0, y0 = pt(cx, cy, r, a0)
    x1, y1 = pt(cx, cy, r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return "M%.1f %.1fA%d %d 0 %d 0 %.1f %.1f" % (x0, y0, r, r, large, x1, y1)


def arc_cw(cx, cy, r, a0, a1):
    """clockwise on screen from a0 down to a1"""
    x0, y0 = pt(cx, cy, r, a0)
    x1, y1 = pt(cx, cy, r, a1)
    large = 1 if (a0 - a1) % 360 > 180 else 0
    return "M%.1f %.1fA%d %d 0 %d 1 %.1f %.1f" % (x0, y0, r, r, large, x1, y1)


def star4(x, y, r, fill):
    k = r * 0.28
    return ('<path d="M%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fZ" fill="%s"/>'
            % (x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k, fill))


def puff(circles, fill="#fff", shade="#d6ecfb"):
    out = ""
    for (x, y, r) in circles:
        out += '<circle cx="%d" cy="%d" r="%d" fill="%s"/>' % (x, y + r * 0.18, r, shade)
    for (x, y, r) in circles:
        out += '<circle cx="%d" cy="%d" r="%d" fill="%s"/>' % (x, y, r * 0.93, fill)
    return out


def flower(x, y, r):
    o = "".join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#fff"/>' % (*pt(x, y, r, a), r * 0.62) for a in range(90, 450, 72))
    return o + '<circle cx="%d" cy="%d" r="%.1f" fill="#ffd23f"/>' % (x, y, r * 0.55)


# ---------------- the bee, two poses ----------------
def bee(pose):
    eye = 0 if pose == "cheer" else 4
    if pose == "cheer":
        arms = ('<g class="armL"><path d="M80 132Q50 122 32 70" stroke="I" stroke-width="15" fill="none" stroke-linecap="round"/>'
                '<path d="M80 132Q50 122 32 70" stroke="#ffd84a" stroke-width="7" fill="none" stroke-linecap="round"/>'
                '<g transform="translate(30 62)"><circle r="14" fill="#ff6fae" stroke="I" stroke-width="4"/>'
                '<path d="M0-8V8M-8 0H8M-6-6L6 6M6-6L-6 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></g></g>'
                '<g class="armR"><path d="M140 132Q170 122 188 70" stroke="I" stroke-width="15" fill="none" stroke-linecap="round"/>'
                '<path d="M140 132Q170 122 188 70" stroke="#ffd84a" stroke-width="7" fill="none" stroke-linecap="round"/>'
                '<g transform="translate(190 62)"><circle r="14" fill="#a98cff" stroke="I" stroke-width="4"/>'
                '<path d="M0-8V8M-8 0H8M-6-6L6 6M6-6L-6 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></g></g>')
        mouth = ('<path d="M98 97Q110 116 122 97Z" fill="#8a2b3a" stroke="I" stroke-width="3.5" stroke-linejoin="round"/>'
                 '<path d="M103.5 104Q110 111 116.5 104Q110 100 103.5 104Z" fill="#ff7a8a"/>')
    else:   # pushing: both hands flat on whatever is to its right, a gritted grin
        arms = ('<path d="M128 150Q165 170 200 158" stroke="I" stroke-width="15" fill="none" stroke-linecap="round"/>'
                '<path d="M128 150Q165 170 200 158" stroke="#ffd84a" stroke-width="7" fill="none" stroke-linecap="round"/>'
                '<circle cx="202" cy="157" r="10" fill="#ffd84a" stroke="I" stroke-width="4"/>'
                '<path d="M136 134Q170 140 200 122" stroke="I" stroke-width="15" fill="none" stroke-linecap="round"/>'
                '<path d="M136 134Q170 140 200 122" stroke="#ffd84a" stroke-width="7" fill="none" stroke-linecap="round"/>'
                '<circle cx="202" cy="121" r="10" fill="#ffd84a" stroke="I" stroke-width="4"/>')
        mouth = ('<path d="M99 98Q113 110 127 97Z" fill="#fff" stroke="I" stroke-width="3.5" stroke-linejoin="round"/>'
                 '<path d="M101 100.5H125" stroke="I" stroke-width="2.2"/>')
    g = ('<defs><radialGradient id="beeY_P" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff4ad"/>'
         '<stop offset=".45" stop-color="#ffd84a"/><stop offset="1" stop-color="#f3a51b"/></radialGradient>'
         '<clipPath id="beeBody_P"><ellipse cx="110" cy="142" rx="40" ry="35"/></clipPath></defs>'
         '<g class="wingL"><ellipse cx="50" cy="116" rx="33" ry="20" transform="rotate(-24 50 116)" fill="#d6f0ff" fill-opacity=".92" stroke="I" stroke-width="5"/>'
         '<ellipse cx="44" cy="110" rx="15" ry="6" transform="rotate(-24 44 110)" fill="#fff" opacity=".85"/></g>'
         '<g class="wingR"><ellipse cx="170" cy="116" rx="33" ry="20" transform="rotate(24 170 116)" fill="#d6f0ff" fill-opacity=".92" stroke="I" stroke-width="5"/>'
         '<ellipse cx="176" cy="110" rx="15" ry="6" transform="rotate(24 176 110)" fill="#fff" opacity=".85"/></g>'
         '<path d="M100 171L110 192L120 171Z" fill="#3a2e4f" stroke="I" stroke-width="4" stroke-linejoin="round"/>'
         '<ellipse cx="110" cy="142" rx="40" ry="35" fill="url(#beeY_P)"/>'
         '<g clip-path="url(#beeBody_P)" fill="#3a2e4f"><rect x="60" y="137" width="100" height="12"/><rect x="60" y="159" width="100" height="12"/></g>'
         '<ellipse cx="110" cy="142" rx="40" ry="35" fill="none" stroke="I" stroke-width="5"/>'
         + arms +
         '<path d="M97 40Q89 22 80 15" stroke="I" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="79" cy="13" r="8" fill="#3a2e4f" stroke="I" stroke-width="3"/>'
         '<path d="M123 40Q131 22 140 15" stroke="I" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="141" cy="13" r="8" fill="#3a2e4f" stroke="I" stroke-width="3"/>'
         '<circle cx="110" cy="80" r="46" fill="url(#beeY_P)" stroke="I" stroke-width="5"/>'
         '<ellipse cx="91" cy="56" rx="17" ry="9" transform="rotate(-22 91 56)" fill="#fff" opacity=".55"/>'
         '<ellipse cx="E1" cy="80" rx="8.5" ry="11.5" fill="I"/><ellipse cx="E2" cy="80" rx="8.5" ry="11.5" fill="I"/>'
         '<circle cx="E3" cy="74.5" r="3.6" fill="#fff"/><circle cx="E4" cy="74.5" r="3.6" fill="#fff"/>'
         '<circle cx="E5" cy="85" r="1.7" fill="#fff"/><circle cx="E6" cy="85" r="1.7" fill="#fff"/>'
         '<ellipse cx="78" cy="96" rx="9.5" ry="5.8" fill="#ff7aa8" opacity=".75"/><ellipse cx="142" cy="96" rx="9.5" ry="5.8" fill="#ff7aa8" opacity=".75"/>'
         + mouth)
    for k, v in enumerate((93, 127, 96.5, 130.5, 90.5, 124.5)):
        g = g.replace('"E%d"' % (k + 1), '"%g"' % (v + eye))
    return g.replace('"I"', '"%s"' % BEE_INK).replace("_P", "_" + pose)


# ---------------- the cover ----------------
# ---- the hero: a few rings standing on the floor, joined by clips ----
# The owner, 2026-10-17: no bee, "just 2-3 shapes", then "3 or 4 rings in two
# lines". Two layouts; LAYOUT is the one the game shows, --ref draws both.
PAL = {   # light, mid, deep, rim
    "blue": ("#8fe0ff", "#2fa8e8", "#1a78b8", "#13689e"),
    "orange": ("#ffc874", "#ff8c26", "#d6620f", "#b8520c"),
    "purple": ("#d2adff", "#984be0", "#6b2fb0", "#5b2fa0"),
    "green": ("#b4f08a", "#5cc236", "#3a8f1f", "#2e7a17"),
}
# ⚠ Held the game's way, not touching (the owner: "these rings are not locked to
# each other as in the game"). From the shipped boards, in ring radii of 1.75: a
# pin's stem runs out of its ring from 2.0 to 2.5, its head sits at 2.84 - on the
# NEIGHBOUR's tube - so ring centres are 4.59 apart and a gap shows between tubes.
R_RING, TUBE_W = 86, 30                    # the tube a little fatter than the game's 28, for a cover
K = R_RING / 1.75                          # cover units per world unit
LINK = 4.59 * K                            # centre to centre
HEAD_AT = 2.84 * K                         # owner centre to head centre: on the neighbour's tube
LAYOUTS = {
    # (colour, centre, gap centre in degrees) per ring; pins as (owner, the ring its head holds).
    # Gaps face away from every stem and head, as on a board waiting to be solved.
    "pyramid3": ([("purple", (540, 1092 - LINK * 0.866), 90), ("blue", (540 - LINK / 2, 1092), 180), ("orange", (540 + LINK / 2, 1092), 0)],
                 [(0, 1), (0, 2), (1, 2)]),
    "grid4": ([("purple", (540 - LINK / 2, 896), 135), ("green", (540 + LINK / 2, 896), 45),
               ("blue", (540 - LINK / 2, 896 + LINK), 225), ("orange", (540 + LINK / 2, 896 + LINK), 315)],
              [(0, 1), (0, 2), (1, 3), (2, 3)]),
}
LAYOUT = "pyramid3"
# The owner's generated cover (2026-10-17, from ART_PROMPTS.md) shipped for a day under
# the drawn title; Home is live 3D since. cover(photo=...) can still draw it that way.
PHOTO = "art/home_cover.jpg"
PHOTO_TITLE_DY = -60
GAP = 64                                   # degrees, tip to tip


def hero(layout):
    rings, clips = LAYOUTS[layout]
    o = ["<defs>"]
    for i, (col, (x, y), g) in enumerate(rings):
        lt, md, dp, rim = PAL[col]
        # in user space, so every ring's ramp runs over its own height
        o.append('<linearGradient id="hr%d" gradientUnits="userSpaceOnUse" x1="0" y1="%.0f" x2="0" y2="%.0f">'
                 '<stop offset="0" stop-color="%s"/><stop offset=".5" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>'
                 % (i, y - R_RING - 20, y + R_RING + 20, lt, md, dp))
    for col in {rings[io][0] for io, _ in clips}:
        lt, md, dp, rim = PAL[col]
        o.append('<linearGradient id="hc_%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (col, lt, md))
    o.append("</defs>")
    floor_y = max(y for _, (x, y), _ in rings) + R_RING + 20
    xs = [x for _, (x, y), _ in rings]
    o.append('<ellipse cx="540" cy="%.0f" rx="%.0f" ry="20" fill="#d9a35c" opacity=".42"/>' % (floor_y + 2, (max(xs) - min(xs)) / 2 + R_RING + 50))
    for i, (col, (x, y), g) in enumerate(rings):
        rim = PAL[col][3]
        d = arc(x, y, R_RING, g + GAP / 2, g + 360 - GAP / 2)
        o.append('<path d="%s" stroke="%s" stroke-width="%d" fill="none" stroke-linecap="round"/>'
                 '<path d="%s" stroke="url(#hr%d)" stroke-width="%d" fill="none" stroke-linecap="round"/>' % (d, rim, TUBE_W + 10, d, i, TUBE_W))
        # a shine along the top of the tube and a shade under it, kept clear of the gap
        for a0, a1, r, sty in ((40, 140, R_RING + 6, 'stroke="#fff" stroke-width="7" opacity=".6"'),
                               (220, 320, R_RING - 7, 'stroke="#000" stroke-width="6" opacity=".13"')):
            lo, hi = g + GAP / 2 + 12, g + 360 - GAP / 2 - 12            # the drawn stretch, inside the caps
            spans = [(max(a0 + k, lo), min(a1 + k, hi)) for k in (-360, 0, 360)]
            for p0, p1 in spans:
                if p1 - p0 > 8:
                    o.append('<path d="%s" %s fill="none" stroke-linecap="round"/>' % (arc(x, y, r, p0, p1), sty))
    # the pins, as the game draws them: every stem over the rings, then every head
    # on top, clamped across the neighbour's tube in the owner's colour
    heads = []
    for io, it in clips:
        (xo, yo), (xt, yt) = rings[io][1], rings[it][1]
        th = math.degrees(math.atan2(yt - yo, xt - xo))                 # screen angle, owner to neighbour
        col = rings[io][0]
        lt, md, dp, rim = PAL[col]
        o.append('<g transform="translate(%.1f %.1f) rotate(%.1f)">'
                 '<rect x="%.1f" y="-11" width="%.1f" height="22" rx="5" fill="%s" stroke="%s" stroke-width="3.5"/></g>'
                 % (xo, yo, th, R_RING + TUBE_W / 2 - 6, HEAD_AT - R_RING - TUBE_W / 2 + 6, dp, rim))
        hx, hy = xo + math.cos(math.radians(th)) * HEAD_AT, yo + math.sin(math.radians(th)) * HEAD_AT
        heads.append('<g transform="translate(%.1f %.1f) rotate(%.1f)">'
                     '<rect x="-23" y="-17" width="46" height="34" rx="9" fill="url(#hc_%s)" stroke="%s" stroke-width="4"/>'
                     '<rect x="-15" y="-12" width="30" height="9" rx="4.5" fill="#fff" opacity=".45"/></g>' % (hx, hy, th, col, rim))
    o.extend(heads)
    o.append(star4(842, 820, 20, "#fff") + star4(236, 846, 15, "#fff"))
    return o


def hero_flat(layout=None):
    """The cover's rings alone, cropped to them: Home's middle without WebGL."""
    layout = layout or LAYOUT
    rings, _ = LAYOUTS[layout]
    xs = [x for _, (x, y), _ in rings]
    ys = [y for _, (x, y), _ in rings]
    m = R_RING + TUBE_W
    x0, x1, y0, y1 = min(xs) - m - 50, max(xs) + m + 50, min(ys) - m, max(ys) + m + 30
    return ('<svg class="heroFlat" viewBox="%.0f %.0f %.0f %.0f" aria-hidden="true">' % (x0, y0, x1 - x0, y1 - y0)
            + "".join(hero(layout)) + "</svg>")


def cover(title=True, layout=None, photo=None):
    """The home cover. With `photo` (a URL relative to the page) the picture is the
    owner's generated render and only the title is drawn over it; without, the
    whole scene is drawn - which is also the layout handed to an image model."""
    layout = layout or LAYOUT
    W, H, HZ = 1080, 1620, 990
    o = ['<svg class="cover" viewBox="0 0 1080 1620" aria-hidden="true"><defs>'
         '<linearGradient id="cvSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22b2fc"/><stop offset=".55" stop-color="#3cc6fd"/><stop offset="1" stop-color="#7fe0fd"/></linearGradient>'
         '<linearGradient id="cvFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdebc0"/><stop offset="1" stop-color="#f6c88e"/></linearGradient>'
         '<linearGradient id="cvBush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74dc6c"/><stop offset=".6" stop-color="#3fb85a"/><stop offset="1" stop-color="#2a9a4c"/></linearGradient>'
         '<linearGradient id="cvT1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff38a"/><stop offset=".5" stop-color="#ffd21f"/><stop offset="1" stop-color="#ff9b12"/></linearGradient>'
         '<linearGradient id="cvT2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eef3ff"/><stop offset="1" stop-color="#b6caf2"/></linearGradient>'
         '<linearGradient id="cvGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/></linearGradient>'
         '<linearGradient id="cvBlue" gradientUnits="userSpaceOnUse" x1="0" y1="783" x2="0" y2="1027"><stop offset="0" stop-color="#8fe0ff"/><stop offset=".5" stop-color="#2fa8e8"/><stop offset="1" stop-color="#1a78b8"/></linearGradient>'
         '<linearGradient id="cvOrange" gradientUnits="userSpaceOnUse" x1="0" y1="783" x2="0" y2="1027"><stop offset="0" stop-color="#ffc874"/><stop offset=".5" stop-color="#ff8c26"/><stop offset="1" stop-color="#d6620f"/></linearGradient>'
         '<linearGradient id="cvPurple" gradientUnits="userSpaceOnUse" x1="0" y1="783" x2="0" y2="1027"><stop offset="0" stop-color="#d2adff"/><stop offset=".5" stop-color="#984be0"/><stop offset="1" stop-color="#6b2fb0"/></linearGradient>'
         '<linearGradient id="cvClip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c49cff"/><stop offset="1" stop-color="#7a3fd0"/></linearGradient>'
         '<radialGradient id="cvGlow"><stop offset="0" stop-color="#fff8b0" stop-opacity=".95"/><stop offset=".6" stop-color="#fff38a" stop-opacity=".35"/><stop offset="1" stop-color="#fff38a" stop-opacity="0"/></radialGradient>'
         '</defs>']
    if photo:
        o.append('<image href="%s" x="0" y="0" width="1080" height="1620" preserveAspectRatio="xMidYMid slice"/>' % photo)
    else:
        o.append('<rect width="%d" height="%d" fill="url(#cvSky)"/>' % (W, HZ + 20))
        # clouds: big ones at the sides, as Seat Jam's
        o.append(puff([(40, 500, 70), (120, 470, 82), (205, 515, 58), (95, 540, 60)]))
        o.append(puff([(940, 615, 58), (1015, 580, 74), (1075, 620, 62), (985, 640, 50)]))
        o.append(puff([(60, 720, 34), (110, 708, 40), (155, 725, 30)]))
        o.append(puff([(1000, 770, 30), (1045, 760, 36)]))
        # the hedge either side of the horizon
        for side in (1, -1):
            cx = 0 if side == 1 else W
            bush = [(cx + side * 40, 880, 115), (cx + side * 170, 925, 95), (cx + side * 255, 968, 66)]
            o.append("".join('<circle cx="%d" cy="%d" r="%d" fill="#2a9a4c"/>' % (x, y + 10, r) for x, y, r in bush))
            o.append("".join('<circle cx="%d" cy="%d" r="%d" fill="url(#cvBush)"/>' % (x, y, r) for x, y, r in bush))
            o.append(flower(cx + side * 60, 900, 13) + flower(cx + side * 190, 935, 11))
        # the tiled floor, its far edge bowed a little as Seat Jam's is
        o.append('<path d="M0 %d Q540 %d 1080 %d V1620 H0Z" fill="url(#cvFloor)"/>' % (HZ + 6, HZ - 24, HZ + 6))
        lines = []
        for k in range(-7, 8):
            lines.append("M%.0f %d L%.0f 1620" % (540 + k * 74, HZ - 6, 540 + k * 300))
        for y in (1012, 1050, 1104, 1178, 1280, 1420, 1600):
            lines.append("M0 %d H1080" % y)
        o.append('<path d="%s" stroke="#f0c37f" stroke-width="5" fill="none" opacity=".75"/>' % " ".join(lines))
    if title:
        if photo:
            o.append('<g transform="translate(0 %d)">' % PHOTO_TITLE_DY)
        # the title on its burst
        o.append('<ellipse cx="540" cy="525" rx="330" ry="262" fill="url(#cvGlow)"/>')
        spikes = []
        random.seed(3)
        for k in range(28):
            a = 90 + k * 360 / 28
            r = (252 if k % 2 == 0 else 184) + (random.random() * 24 - 12 if k % 2 == 0 else 0)
            x, y = pt(540, 525, r, a)
            spikes.append("%.0f %.0f" % (540 + (x - 540) * 1.1, y))
        o.append('<polygon points="%s" fill="#ffe83b" stroke="#ffd21f" stroke-width="6" stroke-linejoin="round"/>' % ",".join(spikes))
        for (x1, y1, x2, y2) in ((214, 476, 252, 478), (222, 566, 258, 556), (828, 476, 866, 472), (822, 560, 858, 570), (836, 392, 860, 376)):
            o.append('<path d="M%d %dL%d %d" stroke="#ffe83b" stroke-width="13" stroke-linecap="round"/>' % (x1, y1, x2, y2))
        # "Ring Twist" (the owner, 2026-10-17): the slab under the letters, the
        # letters, then a gloss over their top - Seat Jam's title has all three
        t = ('<g font-family="Lilita One, Arial Black, sans-serif" text-anchor="middle" stroke="%s" stroke-linejoin="round" paint-order="stroke fill">'
             '<text x="540" y="Y1" font-size="214" fill="%s" stroke-width="%d">Ring</text>'
             '<text x="540" y="Y2" font-size="200" fill="%s" stroke-width="%d">Twist</text></g>')
        o.append((t % (INK, INK, 34, INK, 34)).replace("Y1", "498").replace("Y2", "680"))
        o.append((t % (INK, "url(#cvT1)", 34, "url(#cvT2)", 34)).replace("Y1", "484").replace("Y2", "666"))
        o.append((t % ("none", "url(#cvGloss)", 0, "url(#cvGloss)", 0)).replace("Y1", "484").replace("Y2", "666"))
        o.append(star4(300, 718, 34, "#ffe83b") + star4(786, 716, 30, "#ffe83b") + star4(842, 300, 18, "#fff"))
        if photo:
            o.append("</g>")

    if not photo:
        o.extend(hero(layout))
    o.append('</svg>')
    return "".join(o)


CHROME = ("C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")


def write_refs(out):
    """The cover in every layout, drawn by Chrome at its own 1080 x 1620:
    cover_<layout>.png with the title, to see the layout, and
    cover_<layout>_notitle.png to give an image model (a model asked to keep a
    title misspells it - ART_PROMPTS.md)."""
    root = pathlib.Path(__file__).resolve().parent.parent
    out = pathlib.Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    exe = next((c for c in CHROME if os.path.exists(c)), None)
    if not exe:
        raise SystemExit("no Chrome or Edge to draw the PNGs with")
    font = (root / "src" / "fonts" / "LilitaOne-latin-3.woff2").as_uri()
    jobs = []
    for lay in LAYOUTS:
        jobs += [("cover_%s.png" % lay, cover(True, lay)), ("cover_%s_notitle.png" % lay, cover(False, lay))]
    for name, svg in jobs:
        page = ("<!doctype html><html><head><meta charset='utf-8'><style>"
                "@font-face{font-family:'Lilita One';src:url(%s) format('woff2')}"
                "html,body{margin:0;width:1080px;height:1620px;overflow:hidden}"
                "svg{display:block;width:1080px;height:1620px}</style></head><body>%s</body></html>" % (font, svg))
        with tempfile.TemporaryDirectory() as tmp:
            html = pathlib.Path(tmp) / "cover.html"
            html.write_text(page, encoding="utf-8")
            # a throw-away profile, so the browser in use is never touched
            subprocess.run([exe, "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-gpu",
                            "--user-data-dir=" + str(pathlib.Path(tmp) / "profile"), "--allow-file-access-from-files",
                            "--virtual-time-budget=3000", "--window-size=1080,1620",
                            "--screenshot=" + str(out / name), html.as_uri()], check=True, capture_output=True, timeout=120)
        print("wrote", out / name)


def main():
    if "--ref" in sys.argv:
        i = sys.argv.index("--ref")
        write_refs(sys.argv[i + 1] if i + 1 < len(sys.argv) else "art/ref")
        return
    page = pathlib.Path(__file__).resolve().parent.parent / "src" / "game_head.html"
    s = page.read_text(encoding="utf-8")
    s, n1 = re.subn(r'<svg class="heroFlat".*?</svg>', lambda m: hero_flat(), s, count=1, flags=re.S)
    cheer = '<svg viewBox="0 0 220 200" aria-hidden="true">' + bee("cheer") + "</svg>"
    s, n2 = re.subn(r'(<div class="bee">)<svg viewBox="0 0 220 200".*?</svg>', lambda m: m.group(1) + cheer, s, count=1, flags=re.S)
    if n1 != 1 or n2 != 1:
        raise SystemExit("heroFlat or bee not found in game_head.html (%d, %d)" % (n1, n2))
    page.write_text(s, encoding="utf-8")
    print("Home flat rings and bee written to", page)


if __name__ == "__main__":
    main()
