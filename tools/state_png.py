"""Draw a tools/state_dump.js JSON to PNG.   python -I state_png.py s.json out.png"""
import json, sys
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1]))
xs = [x for s in d["shapes"] for x in s["x"]]; ys = [y for s in d["shapes"] for y in s["y"]]
mnx, mxx, mny, mxy = min(xs) - 1, max(xs) + 1, min(ys) - 1, max(ys) + 1
S = 900 / max(mxx - mnx, mxy - mny)
W, H = int((mxx - mnx) * S), int((mxy - mny) * S) + 60
im = Image.new("RGB", (W, H), (246, 233, 211)); dr = ImageDraw.Draw(im)
T = lambda x, y: ((x - mnx) * S, (mxy - y) * S)
order = {"body": 0, "stem": 1, "stop": 1, "wall": 2, "trig": 3, "host": 1}
for s in sorted(d["shapes"], key=lambda s: order.get(s["kind"], 0)):
    pts = [T(x, y) for x, y in zip(s["x"], s["y"])]
    if s["t"] == 1:
        w = max(1, int(2 * s["r"] * S))
        seq = pts + ([pts[0]] if s["closed"] else [])
        dr.line(seq, fill=s["col"], width=w, joint="curve")
        for p in (seq[0], seq[-1]):
            dr.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=s["col"])
    elif s["kind"] == "trig":
        dr.polygon(pts, outline=(255, 0, 255) if s["active"] else (120, 120, 120))
    else:
        dr.polygon(pts, fill=s["col"] if s["kind"] != "wall" else (200, 0, 0), outline=(0, 0, 0))
labels = {}
for s in d["shapes"]:
    if s["kind"] == "body":
        labels[s["label"]] = T(sum(s["x"]) / len(s["x"]), sum(s["y"]) / len(s["y"]))
for k, p in labels.items():
    dr.text(p, k.replace("ring_", "R").replace("slide_bar_", "S"), fill=(0, 0, 0))
dr.text((5, H - 55), " | ".join(d["log"])[:160], fill=(0, 0, 0))
dr.text((5, H - 35), "movable: " + ",".join(d["movable"]), fill=(0, 0, 0))
im.save(sys.argv[2])
