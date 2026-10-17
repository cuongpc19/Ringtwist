# -*- coding: utf-8 -*-
"""Build Rotate Ring into ../dist/.

    cd src
    python build.py            # plain web build (no host SDK) -> ../dist/
    python build.py crazy      # CrazyGames build                -> ../dist/

dist/ is emptied first and holds exactly what gets uploaded:
    index.html                 markup, style, the privacy text inlined
    assets/game-<hash>.js      platform + engine + render + levels + shell
    fonts/*.woff2              carried, never fetched from Google
    privacy.html               the same policy as a page of its own

dist/index.html opens straight from disk (file://) as well: nothing is fetched.

Levels: lv/levels.json filtered by lv/solutions.json
(tools/solve.js --out). ⚠ A level the solver could not win under the engine's
rules does not ship - see README "Levels".
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DIST = HERE.parent / "dist"

# ---- tuning that reaches the game (game.js TUNE) ----
TUNE = {
    "BOOM_UNLOCK": 4,       # the video unlocks the firework on level 4
    "HAMMER_UNLOCK": 8,
    "WIN_GOLD": 10,         # the owner's numbers: 10 gold a win,
    "PRICE_BOOM": 50,       # a firework for 5 wins,
    "PRICE_HAMMER": 100,    # a hammer for 10
}

# Families of level ids, in the order they are played after the main path.
# ⚠ The shipped order lives in the APK's encrypted config; this one is ours.
# 10xxx is the main path (10001-10072 all present). 20xxx are 24-ring boards,
# saved for last.
FAMILY_ORDER = [10, 60, 70, 71, 72, 73, 50, 110, 130, 140, 660, 680, 880, 100, 20]


def read(name):
    return (HERE / name).read_text(encoding="utf-8")


def campaign():
    levels = json.loads(read("lv/levels.json"))
    sol_path = HERE / "lv" / "solutions.json"
    solved = set(int(k) for k in json.loads(sol_path.read_text())) if sol_path.exists() else None
    if solved is None:
        print("  !! lv/solutions.json missing - shipping every level unverified")
    by_id = {l["id"]: l for l in levels}
    ids = [i for i in by_id if solved is None or i in solved]

    def fam(i):
        f = i // 1000
        return FAMILY_ORDER.index(f) if f in FAMILY_ORDER else len(FAMILY_ORDER)
    ids.sort(key=lambda i: (fam(i), i))
    # the reference video plays 10005 fourth and 10004 fifth
    if 10004 in ids and 10005 in ids:
        a, b = ids.index(10004), ids.index(10005)
        ids[a], ids[b] = ids[b], ids[a]
    dropped = len(by_id) - len(ids)
    return [compact(by_id[i]) for i in ids], dropped


def rnd(v):
    if isinstance(v, float):
        return round(v, 3)
    if isinstance(v, list):
        return [rnd(x) for x in v]
    if isinstance(v, dict):
        return {k: rnd(x) for k, x in v.items()}
    return v


def compact(lv):
    """⚠ Drops fields, never precision. The solver verified these exact numbers;
    rounding them to 3 places flipped bomb contacts that sit within the engine's
    1e-4 touch tolerance, and five bomb levels stopped being winnable."""
    lv = json.loads(json.dumps(lv))
    for s in lv["sticks"]:
        s.pop("path", None)            # the engine runs on `track`
    return lv


def build_stamp():
    def git(*a):
        return subprocess.run(["git", *a], cwd=HERE, capture_output=True, text=True).stdout.strip()
    try:
        h = git("rev-parse", "--short", "HEAD")
        if not h:
            return "nogit"
        return h + ("+" if git("status", "--porcelain") else "")
    except Exception:
        return "nogit"


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "web"
    if target not in ("web", "crazy"):
        sys.exit("target must be web or crazy")
    levels, dropped = campaign()
    built = datetime.date.today().isoformat()
    stamp = build_stamp()
    platform = read("platform_crazy.js" if target == "crazy" else "platform_none.js")
    game = read("game.js").replace("/*__TUNE__*/{}", json.dumps(TUNE))
    js = "\n".join([
        f"/* Rotate Ring - build {stamp} {built} - {target} */",
        platform,
        read("engine.js"),
        read("render.js"),
        read("render3d.js"),
        "window.RR_LEVELS=" + json.dumps(levels, separators=(",", ":")) + ";",
        f"window.RR_BUILD={json.dumps(stamp)};",
        game,
    ])
    digest = hashlib.sha1(js.encode("utf-8")).hexdigest()[:10]
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)
    (DIST / "fonts").mkdir()
    jsname = f"assets/game-{digest}.js"
    (DIST / jsname).write_text(js, encoding="utf-8")
    # three.js r150 for the 3D view, its own file so a game update does not
    # re-download it. ⚠ It must load before the game: render3d.js reads THREE
    # when the bundle runs, and without it the game quietly draws in 2D.
    three = (HERE / "vendor" / "three.min.js").read_bytes()
    threename = f"assets/three-{hashlib.sha1(three).hexdigest()[:10]}.js"
    (DIST / threename).write_bytes(three)
    privacy = read("privacy.html").replace("/*__BUILT__*/", built)
    privacy_body = re.sub(r"<!--.*?-->", "", privacy, flags=re.S).strip()
    page = read("game_head.html")
    page = page.replace("<!--__PRIVACY__-->", privacy_body)
    page = page.replace("<!--__SCRIPT__-->", f'<script src="{threename}"></script>\n<script src="{jsname}"></script>')
    (DIST / "index.html").write_text(page, encoding="utf-8")
    (DIST / "privacy.html").write_text(
        "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Ring Twist - Privacy</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 18px;"
        "line-height:1.5;color:#4a2e1a;background:#f6e9d3}code{background:#fff3;padding:0 4px}</style></head><body>"
        + privacy_body + "</body></html>", encoding="utf-8")
    for f in (HERE / "fonts").glob("*.woff2"):
        shutil.copy(f, DIST / "fonts" / f.name)
    # pictures the page loads by relative path (the home cover - tools/home_art.py)
    art = HERE / "art"
    if art.is_dir():
        (DIST / "art").mkdir()
        for f in art.iterdir():
            if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                shutil.copy(f, DIST / "art" / f.name)
    # home-screen icon + manifest (tools/make_icon.py draws the icons)
    (DIST / "icons").mkdir()
    for f in (HERE / "icons").glob("*.png"):
        shutil.copy(f, DIST / "icons" / f.name)
    (DIST / "manifest.webmanifest").write_text(json.dumps({
        "name": "Ring Twist", "short_name": "Ring Twist", "start_url": "./index.html", "scope": "./",
        "display": "standalone", "orientation": "portrait", "background_color": "#f6ead6", "theme_color": "#f6ead6",
        "icons": [{"src": "icons/icon-180.png", "sizes": "180x180", "type": "image/png"},
                  {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"}],
    }, indent=1), encoding="utf-8")
    check(target, len(levels), dropped)


def check(target, nlev, dropped):
    files = [p for p in DIST.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f'Bundle "{target}": {DIST} - {len(files)} files, {size / 1e6:.2f} MB, {nlev} levels ({dropped} unverified left out)')
    bad = False

    def ok(cond, msg):
        nonlocal bad
        print(("  OK   " if cond else "  FAIL ") + msg)
        bad = bad or not cond
    page = (DIST / "index.html").read_text(encoding="utf-8")
    js = next((DIST / "assets").glob("game-*.js")).read_text(encoding="utf-8")
    for ref in re.findall(r'href="(art/[^"]+)"', page):
        ok((DIST / ref).exists(), "picture shipped: " + ref)
    ok(len(list((DIST / "assets").glob("three-*.js"))) == 1 and page.index("assets/three-") < page.index("assets/game-"),
       "three.js shipped and loaded before the game (else the 3D view falls back to 2D)")
    ok(size < 20e6, "under 20 MB - keeps the mobile front page")
    ok(len(files) <= 1500, f"{len(files)} files - the limit is 1500")
    ok(not re.search(r'(src|href)="/(?!/)', page), "relative paths only")
    ok("<!--__" not in page and "/*__BUILT__*/" not in page and "/*__TUNE__*/" not in js, "no unfilled placeholders")
    if target == "crazy":
        ok("sdk.crazygames.com" in js, "CrazyGames SDK wired")
    else:
        ok("sdk.crazygames.com" not in js, "no host SDK in a non-host build")
    ok("PASTE" not in page, "privacy policy has no placeholder text")
    ok(nlev > 0, "levels carried")
    if bad:
        sys.exit("build failed its checks")


if __name__ == "__main__":
    main()
