/* Dump the engine's world shapes for one level (optionally after some moves) as JSON,
   for tools/state_png.py.   node tools/state_dump.js 10010 [ring_5@1.2 slide_bar_2@3 ...] > s.json */
const RR = require("../src/engine.js");
const L = require("../src/lv/levels.json");
const [id, ...moves] = process.argv.slice(2);
const lv = L.find(l => l.id === +id);
const g = new RR.Game(lv);
g.sweep();
const log = [];
for (const m of moves) {
  const [pid, pose] = m.split("@");
  const p = g.byId[pid];
  const d = g.begin(p);
  if (!d) { log.push(pid + " stuck: " + g.stuckReason(p)); continue; }
  const from = d.pose();
  const r = d.moveTo(+pose);
  const gone = g.sweep();
  log.push(`${pid} ${from.toFixed(3)} -> ${d.pose().toFixed(3)} blocked=${r.blocked} gone=[${gone.map(q => q.id)}]`);
}
const shapes = [];
const add = (g2, col, label) => g2.shapes.forEach(s => shapes.push({ t: s.t, r: s.r, closed: !!s.closed, x: Array.from(s.x), y: Array.from(s.y), col, kind: g2.kind, label, active: g2.clamp ? g2.clamp.active : null }));
for (const p of g.pieces) if (!p.removed) p.groups.forEach(gr => add(gr, p.col, p.id));
for (const s of g.statics) if (!s.removed) s.groups.forEach(gr => add(gr, "#999999", s.id));
process.stderr.write(log.join("\n") + "\n");
console.log(JSON.stringify({ id: lv.id, log, shapes, movable: g.pieces.filter(p => !p.removed && !g.stuckReason(p)).map(p => p.id) }));
