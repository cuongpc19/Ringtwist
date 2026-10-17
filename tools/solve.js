/* Can every level be won under OUR rules? Plays each board with the engine the
   game ships, so a level that passes here is a level a person can finish.

     node tools/solve.js                 all levels
     node tools/solve.js 10001-10072     a range of ids
     node tools/solve.js 10004 --moves   one level, print the winning line
     node tools/solve.js --out           also write src/lv/solutions.json

   A candidate is a short list of drags that ends with a clamp letting go:
     - plain: sweep a free piece one way until it is blocked; every point where
       a clamp lets go on the way is a candidate;
     - make-room: a sweep was blocked by piece B, which can itself move - park B
       at poses spread over its travel and sweep again. ⚠ Needed from level 10
       on: the stick there only comes out once the purple ring has turned ~30°
       so its gap meets the stick's path, and nothing is released by that turn.
   Candidates that clear pieces go first. The clamp/removed pattern is the key
   for "seen this before" - a heuristic since a pin can grip again (a tube slid
   back into its head), but the line found is always replayed by the engine.  */
const RR = require("../src/engine.js");
const fs = require("fs");
const path = require("path");

const RING_STEP = 4 * Math.PI / 180;
const STICK_STEP = 0.15;
const SPREAD_RING = 10 * Math.PI / 180;
const SPREAD_STICK = 0.3;
const BUDGET = +((process.argv.find(a => a.startsWith("--budget=")) || "--budget=1500").slice(9));
const TIME_LIMIT = +((process.argv.find(a => a.startsWith("--secs=")) || "--secs=40").slice(7)) * 1000;
let deadline = Infinity;
const MODE = (process.argv.find(a => a.startsWith("--mode=")) || "--mode=both").slice(7);
const MOVE = (process.argv.find(a => a.startsWith("--move=")) || "--move=localy0").slice(7);
const FLAGS = {};
// --releasedSolid=walls|true|false; unset, the engine's own default applies
for (const a of process.argv) { const m = a.match(/^--(releasedSolid|stopVsBody|bombOnBump|stickVsStem)=(\w+)$/); if (m) FLAGS[m[1]] = m[2] === "true" ? true : m[2] === "false" ? false : m[2]; }

function limitOf(p) { return p.kind === "ring" ? 2 * Math.PI + 0.2 : p.reach * 2 + 6; }

/* sweep p one way; returns release points and where/why it stopped */
function sweep(g, p, dir) {
  const s0 = g.snapshot();
  const d = g.begin(p);
  if (!d) return { rel: [], blocker: null };
  const rel = [];
  const step = p.kind === "ring" ? RING_STEP : STICK_STEP;
  const limit = limitOf(p);
  let travelled = 0, blocker = null;
  g.events.length = 0;
  while (travelled < limit) {
    const r = d.moveTo(d.pose() + dir * step);
    travelled += Math.abs(r.moved);
    let n = 0, boom = false;
    for (const e of g.events) { if (e.type === "release") n++; if (e.type === "boom") { n++; boom = true; } }
    if (n) { rel.push({ id: p.id, pose: d.pose(), n, travel: travelled, boom }); g.events.length = 0; }
    if (r.boom) break;
    if (r.blocked) { blocker = whoBlocks(d, dir * step * 0.25); break; }
  }
  const end = { id: p.id, pose: d.pose(), travel: travelled };
  g.restore(s0);
  return { rel, blocker, end };
}

/* the piece whose part the next small step would start overlapping */
function whoBlocks(d, nudge) {
  const p = d.p, keep = d.pose();
  d.setPose(keep + nudge);
  let who = null;
  for (const mg of p.groups) {
    for (const o of d.others)
      if (!d.allowed.has(RR.pairKey(mg, o)) && RR.groupHit(mg, o)) { who = o.owner; break; }
    if (who) break;
  }
  d.setPose(keep);
  return who && who.kind !== "guide" && who.kind !== "host" ? who.id : null;
}

/* poses spread over a piece's whole travel, both ways */
function spread(g, p) {
  const s0 = g.snapshot();
  const out = [];
  const step = p.kind === "ring" ? SPREAD_RING : SPREAD_STICK;
  for (const dir of [1, -1]) {
    const d = g.begin(p);
    if (!d) break;
    const limit = limitOf(p);
    let travelled = 0;
    while (travelled < limit) {
      const r = d.moveTo(d.pose() + dir * step);
      travelled += Math.abs(r.moved);
      if (Math.abs(r.moved) > 1e-3) out.push({ id: p.id, pose: d.pose() });
      if (r.blocked) break;
    }
    g.restore(s0);
  }
  return out;
}

function drag(g, m) {
  const d = g.begin(g.byId[m.id]);
  if (!d) return false;
  d.moveTo(m.pose);
  return true;
}
function play(g, moves) {
  const before = g.removedCount;
  for (const m of moves) if (!drag(g, m)) return null;
  g.sweep();
  g.events.length = 0;
  return g.removedCount - before;
}

function candidates(g) {
  const s = g.snapshot();
  const plain = [], blocked = [];
  for (const p of g.pieces) {
    if (p.removed || g.stuckReason(p)) continue;
    for (const dir of [1, -1]) {
      const r = sweep(g, p, dir);
      for (const c of r.rel) plain.push({ moves: [c], n: c.n, travel: c.travel, boom: c.boom });
      if (r.blocker && !r.rel.length) blocked.push({ p, dir, blocker: r.blocker });
    }
  }
  return { plain, blocked, s };
}

function makeRoom(g, blocked, s) {
  const out = [];
  const tried = new Set();
  for (const b of blocked) {
    const B = g.byId[b.blocker];
    if (!B || B.removed || g.stuckReason(B)) continue;
    const key = b.p.id + ">" + b.dir + ">" + B.id;
    if (tried.has(key)) continue;
    tried.add(key);
    for (const pose of spread(g, B)) {
      drag(g, pose);
      g.sweep();
      if (!b.p.removed) {
        const r = sweep(g, b.p, b.dir);
        if (r.rel.length) out.push({ moves: [pose, r.rel[0]], n: r.rel[0].n, travel: 10 + r.rel[0].travel, boom: r.rel[0].boom });
      }
      g.restore(s);
    }
  }
  return out;
}

/* `pre`: moves played before the search starts - "is the board still winnable
   after this?" (the bomb lesson asks that of an early detonation). */
function solve(lv, budget, pre) {
  deadline = Date.now() + TIME_LIMIT;
  // the plain heuristic first, then a few shuffled orders: the search is greedy,
  // and on bomb levels the first greedy choice is often the wrong target
  for (let seed = 0; seed < 6; seed++) {
    const r = solveOnce(lv, budget, seed, pre);
    if (r.ok || seed === 5 || Date.now() > deadline) return Object.assign(r, { seed });
  }
}

function solveOnce(lv, budget, seed, pre) {
  let rs = seed * 2654435761 >>> 0;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new RR.Game(lv, Object.assign({ stickRing: MODE, stickMove: MOVE }, FLAGS));
  g.sweep();
  if (pre) play(g, pre);
  const line = [];
  const seen = new Set();
  let nodes = 0;
  const key = () => g.clamps.map(c => (c.active ? 1 : 0)).join("") + "|" + g.pieces.map(p => (p.removed ? 1 : 0)).join("");
  function tryAll(cands, s) {
    for (const c of cands) {
      c.gone = play(g, c.moves) || 0;
      g.restore(s);
    }
    // a bomb is spent once: keep it for when nothing else frees anything
    if (seed === 0) cands.sort((a, b) => (a.boom ? 1 : 0) - (b.boom ? 1 : 0) || b.gone - a.gone || b.n - a.n || a.travel - b.travel);
    else cands.forEach(c => { c.r = rnd(); }), cands.sort((a, b) => (a.boom ? 1 : 0) - (b.boom ? 1 : 0) || a.r - b.r);
    for (const c of cands) {
      play(g, c.moves);
      line.push(...c.moves);
      if (dfs()) return true;
      line.length -= c.moves.length;
      g.restore(s);
      if (nodes > budget) return false;
    }
    return false;
  }
  function dfs() {
    if (g.won()) return true;
    if (++nodes > budget || Date.now() > deadline) return false;
    const k = key();
    if (seen.has(k)) return false;
    seen.add(k);
    const { plain, blocked, s } = candidates(g);
    if (tryAll(plain, s)) return true;
    if (nodes > budget) return false;
    return tryAll(makeRoom(g, blocked, s), s);
  }
  const ok = dfs();
  return { ok, nodes, line: ok ? line.map(c => ({ id: c.id, pose: c.pose })) : null };
}

if (require.main === module) {
  const L = require("../src/lv/levels.json");
  const args = process.argv.slice(2);
  let ids = null;
  const range = args.find(a => /^\d+(-\d+)?$/.test(a));
  if (range) {
    const [a, b] = range.split("-").map(Number);
    ids = new Set(L.filter(l => l.id >= a && l.id <= (b || a)).map(l => l.id));
  }
  const showMoves = args.includes("--moves");
  const out = {};
  let ok = 0, n = 0;
  const failed = [];
  const t0 = Date.now();
  for (const lv of L) {
    if (ids && !ids.has(lv.id)) continue;
    const t = Date.now();
    const r = solve(lv, BUDGET);
    n++;
    const ms = Date.now() - t;
    if (r.ok) { ok++; out[lv.id] = r.line; }
    else failed.push(lv.id);
    console.log(`${lv.id}\t${r.ok ? "ok " : "FAIL"}\tnodes ${r.nodes}\tmoves ${r.line ? r.line.length : "-"}\tpieces ${lv.rings.length + lv.sticks.length}\t${ms} ms`);
    if (showMoves && r.line) console.log(r.line.map(m => `${m.id}@${m.pose}`).join("  "));
  }
  console.log(`\nsolved ${ok}/${n} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (failed.length) console.log("failed:", failed.join(" "));
  const outArg = args.find(a => a.startsWith("--out"));
  if (outArg) {
    const f = outArg.startsWith("--out=") ? outArg.slice(6) : path.join(__dirname, "..", "src", "lv", "solutions.json");
    fs.writeFileSync(f, JSON.stringify(out));
    console.log("wrote", f);
  }
}

module.exports = { solve, sweep, play, candidates, makeRoom };
