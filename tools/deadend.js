/* Play greedily until nothing releases, then say what blocks what.
   node tools/deadend.js 10012 > state.json   (state for tools/state_png.py) */
const RR = require("../src/engine.js");
const { sweep, play } = require("./solve.js");
const L = require("../src/lv/levels.json");
const lv = L.find(l => l.id === +process.argv[2]);
const g = new RR.Game(lv, JSON.parse(process.argv[3] || "{}"));
g.sweep();
const log = [];
for (let it = 0; it < 200; it++) {
  let best = null;
  for (const p of g.pieces) {
    if (p.removed || g.stuckReason(p)) continue;
    for (const dir of [1, -1]) { const r = sweep(g, p, dir); if (r.rel.length && !best) best = r.rel[0]; }
  }
  if (!best) break;
  const gone = play(g, [best]);
  log.push(`${best.id}@${best.pose.toFixed(2)} gone ${gone}`);
}
process.stderr.write(log.join("\n") + "\nleft " + g.left() + "\n");
for (const p of g.pieces) {
  if (p.removed) continue;
  const why = g.stuckReason(p);
  if (why) {
    const holds = g.clamps.filter(c => c.active && c.owner === p).map(c => c.target.id);
    process.stderr.write(`  ${p.id}: ${why} ${holds.length ? "(still clamps " + holds + ")" : ""}\n`);
    continue;
  }
  const a = sweep(g, p, 1), b = sweep(g, p, -1);
  const heldBy = g.clamps.filter(c => c.active && c.target === p).map(c => c.owner ? c.owner.id : c.guide.id);
  process.stderr.write(`  ${p.id}: + ${a.end.travel.toFixed(2)} blocked by ${a.blocker}, - ${b.end.travel.toFixed(2)} blocked by ${b.blocker}; held by ${heldBy}\n`);
}
const shapes = [];
const add = (gr, col, label) => gr.shapes.forEach(s => shapes.push({ t: s.t, r: s.r, closed: !!s.closed, x: Array.from(s.x), y: Array.from(s.y), col, kind: gr.kind, label, active: gr.clamp ? gr.clamp.active : null }));
for (const p of g.pieces) if (!p.removed) p.groups.forEach(gr => add(gr, p.col, p.id));
for (const s of g.statics) if (!s.removed) s.groups.forEach(gr => add(gr, "#999999", s.id));
console.log(JSON.stringify({ id: lv.id, log: log.slice(-3), shapes, movable: g.pieces.filter(p => !p.removed && !g.stuckReason(p)).map(p => p.id) }));
