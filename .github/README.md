# Ring Twist

A ring-turning puzzle for the browser, drawn in 3D with three.js. Turn each ring
until its gap meets the pin that holds it; a ring that nothing holds and that holds
nothing leaves the board. Later levels add sliding bars, steel clips, bombs and
chained rings. Play it: **https://cuongpc19.github.io/Ringtwist/**

## Build

Needs Python 3 (standard library only) and, for the checks, Node 18+.

```bash
cd src
python build.py            # plain web build  -> ../dist/
python build.py crazy      # CrazyGames build -> ../dist/
```

`dist/index.html` opens straight from disk, or serve it:

```bash
python serve.py            # dist/ on port 5174, no caching - a phone on the same Wi-Fi can open it
```

## Publish

- **GitHub Pages**: every push to `main` builds the web game in CI, replays every
  level out of the build, and deploys it (`.github/workflows/pages.yml`).
- **CrazyGames**: `python tools/release.py` makes the CrazyGames build, replays
  every level out of it, and zips it to `release/ringtwist-crazygames-<date>-<commit>.zip`
  (index.html at the zip's root) - the file the developer portal takes. It then
  puts the web build back in `dist/`. Commit first: the page carries the commit.
- **Store pictures**: `node tools/store_covers.mjs` renders the game's own Home at
  1920x1080, 800x1200 and 800x800 into `store/`.

## Dev links

| link | does |
|---|---|
| `index.html?reset` | wipes progress; keeps sound/vibration |
| `index.html?level=37` | jumps to level 37 |
| `index.html?muteAudio=true` | starts muted, the way CrazyGames QA opens it |
| `index.html?2d` | the flat 2D drawing instead of 3D (what a browser without WebGL gets) |

`window.__rr` in the console: `__rr.start(n)`, `__rr.home()`, `__rr.game`, `__rr.save()`.

## Checks

```bash
node tools/verify_build.js             # every level of dist/, played by the engine (<1 s each)
node tools/solve.js 10001-10072        # can the solver win these boards under the rules?
node tools/shot.mjs --level 5          # headless Chrome screenshot -> tools/.shots/
```

## Layout

| | |
|---|---|
| `src/engine.js` | the rules and collision, no DOM; Node loads it as-is |
| `src/render3d.js` | the 3D view (three.js) and the 3D Home |
| `src/render.js` | the 2D view: the fallback without WebGL |
| `src/game.js` | screens, input, gold, boosters, save, sound |
| `src/game_head.html` | markup and CSS |
| `src/platform_crazy.js` / `platform_none.js` | the host SDK door; the build ships one |
| `src/lv/levels.json`, `solutions.json` | the boards, and the solver's winning line for each |
| `tools/title_art.py`, `home_art.py`, `make_icon.py` | the title letters, the flat art, the icons |
