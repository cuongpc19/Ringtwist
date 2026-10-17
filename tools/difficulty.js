/* How hard is each board for a person? The solver almost never backtracks, so
   its effort says little. This measures TRAPS instead: a careless player who
   always makes a move that frees something - any of them, at random - but never
   thinks ahead, plays each board RUNS times; the share of games that end in a
   dead end (nothing left frees anything, as the owner hit on level 20) is the
   board's trap rate.

     node tools/difficulty.js 10001-10072          print id, pieces, trap rate
     node tools/difficulty.js --out=path.json      all shipped boards -> json

   The rate feeds build.py's HARD labels (src/lv/difficulty.json). */
const RR = require("../src/engine.js");
const { candidates, makeRoom, play } = require("./solve.js");
const fs = require("fs");
const path = require("path");

const RUNS = +((process.argv.find(a => a.startsWith("--runs=")) || "--runs=20").slice(7));
const L = require("../src/lv/levels.json");
const SOL = require("../src/lv/solutions.json");

function trapRate(lv, runs) {
  let stuck = 0;
  let seed = lv.id;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < runs; k++) {
    const g = new RR.Game(lv);
    g.sweep();
    for (let step = 0; step < 400 && !g.won(); step++) {
      let { plain, blocked, s } = candidates(g);
      if (!plain.length) plain = makeRoom(g, blocked, s);
      if (!plain.length) { stuck++; break; }
      play(g, plain[Math.floor(rnd() * plain.length)].moves);
    }
  }
  return stuck / runs;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const range = args.find(a => /^\d+(-\d+)?$/.test(a));
  let ids = L.filter(l => SOL[l.id]).map(l => l.id);
  if (range) { const [a, b] = range.split("-").map(Number); ids = ids.filter(i => i >= a && i <= (b || a)); }
  const out = {};
  for (const id of ids) {
    const lv = L.find(l => l.id === id);
    const t0 = Date.now();
    const r = trapRate(lv, RUNS);
    out[id] = { trap: r, pieces: lv.rings.length + lv.sticks.length, moves: SOL[id].length };
    console.log(`${id}\tpieces ${out[id].pieces}\tmoves ${out[id].moves}\ttrap ${(r * 100).toFixed(0)}%\t${Date.now() - t0} ms`);
  }
  const o = args.find(a => a.startsWith("--out="));
  if (o) fs.writeFileSync(o.slice(6), JSON.stringify(out));
}
module.exports = { trapRate };
