// Load every level into the engine; report clamps whose head misses its target.
const RR = require("../src/engine.js");
const L = require("../src/lv/levels.json");
let bad = 0, t0 = Date.now(), lvBad = [];
for (const lv of L) {
  const g = new RR.Game(lv);
  if (g.mismatch.length) {
    bad += g.mismatch.length;
    lvBad.push(lv.id + ":" + g.mismatch.map(c => (c.owner ? c.owner.id + "." + c.pin.k : c.guide.id) + ">" + c.target.id).join(","));
  }
  const freeAtStart = g.pieces.filter(p => !g.holds(p)).map(p => p.id);
  if (freeAtStart.length) lvBad.push(lv.id + " free at start: " + freeAtStart.join(","));
}
console.log("levels", L.length, "mismatched clamps", bad, "ms", Date.now() - t0);
console.log(lvBad.slice(0, 40).join("\n"));
