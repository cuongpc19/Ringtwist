/* Play every shipped level of the BUILT game, one by one, with the engine and the
   board data exactly as dist/ carries them - no browser, under a second a board.

     node tools/verify_build.js            every level, one line each
     node tools/verify_build.js 15 30      levels 15..30 (campaign numbers)

   For each level: the solver's line from src/lv/solutions.json is replayed on the
   board read out of dist/assets/game-*.js. A level passes when the board ends
   empty. ⚠ Use this, not a browser loop: headless Chrome draws the 3D board on
   the CPU at a few frames a second, and a 50-level shot.mjs run once hung for an
   hour and a half with nothing to show. */
const fs = require("fs");
const path = require("path");
const RR = require("../src/engine.js");

const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "dist", "assets");
const bundle = fs.readdirSync(assets).find(f => /^game-.*\.js$/.test(f));
if (!bundle) { console.error("no dist/assets/game-*.js - run: cd src && python build.py"); process.exit(1); }
const js = fs.readFileSync(path.join(assets, bundle), "utf8");
const m = js.match(/window\.RR_LEVELS=(\[.*?\]);/s);
if (!m) { console.error("RR_LEVELS not found in " + bundle); process.exit(1); }
const LEVELS = JSON.parse(m[1]);
const SOL = require("../src/lv/solutions.json");

const from = +(process.argv[2] || 1), to = +(process.argv[3] || LEVELS.length);
let bad = 0;
for (let n = from; n <= Math.min(to, LEVELS.length); n++) {
  const lv = LEVELS[n - 1], line = SOL[lv.id];
  const t0 = Date.now();
  let msg;
  if (!line) msg = "NO SOLUTION";
  else {
    const g = new RR.Game(lv);
    g.sweep();
    let stuck = null;
    for (const mv of line) {
      const p = g.byId[mv.id];
      if (!p || p.removed) continue;
      const d = g.begin(p);
      if (!d) { stuck = mv.id + " cannot move (" + g.stuckReason(p) + ")"; break; }
      d.moveTo(mv.pose);
      g.sweep();
    }
    msg = g.won() ? "ok" : "FAIL " + (stuck || g.left() + " pieces left");
  }
  if (msg !== "ok") bad++;
  console.log(`level ${String(n).padStart(3)}  board ${lv.id}  ${msg}  ${Date.now() - t0} ms`);
}
console.log(`\n${Math.min(to, LEVELS.length) - from + 1} levels, ${bad} problem${bad === 1 ? "" : "s"} (${bundle})`);
process.exit(bad ? 1 : 0);
