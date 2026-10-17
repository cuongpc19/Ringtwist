/* Rotate Ring - the rules. No DOM, no drawing: Node loads this file as-is, so the
   solver in tools/ plays exactly the game a person plays.

   The shipped game is a 2D physics scene. These rules reproduce it, and every
   one of them was settled by measurement, not by argument: tools/solve.js plays
   all 70 main-path levels under each candidate rule, and the shipped levels are
   all winnable, so the rule that makes them all winnable is the game's rule.

   1. A MOVE MAY NOT START AN OVERLAP. Two parts already overlapping may keep
      overlapping while they move (a tube sliding through the head of the pin
      that clamps it); two parts apart may never be pushed into each other.
   2. A CLAMP HOLDS WHILE ITS TRIGGER OVERLAPS THE TARGET'S BODY. A clamp is the
      head of a ring's pin (it moves with that ring) or a Catch guide / butterfly
      slot (bolted down). Turn the target until its gap lies under the head - or
      run a stick out of its guide - and the clamp lets go. Slide the target
      back into a pin's head and it holds again (a guide goes for good).
      ⚠ Once let go, the head's trigger stops nothing but its two walls still
      do (opts.releasedSolid="walls"). A tube may slide straight back into the
      clip it left - the reference video does it at 1:45 - but it may not enter
      a clip its owner has turned out of line, and the owner may not sweep that
      clip across a tube. With the whole head passable (false) the owner, on a
      phone, turned the green ring of level 5 and slid the blue one into its
      skewed clip: "two rings touching - the original never allows that".
      Main levels winnable (rings passing sticks): whole head passable 65/70,
      walls 64, all solid 60.
   3. A STICK IS RIGID and slides in a straight line (opts.stickMove="localy0"):
      lockDirectionType 1 along its own x (its first segment), 0 along its own y
      - a U-shaped stick is pulled straight out along its legs, through the clips
      on them. Rigid sliding on any other axis wins 34-43 of 70; this one 67.
      ⚠ An earlier build ran sticks along their path like a train ("rail"): the
      owner played it on a phone and the bends bending is plainly wrong.
      ⚠ NOTHING PASSES THROUGH ANYTHING (opts.stickRing="both",
      opts.stickVsStem=true): a dragged stick is stopped by ring bodies and
      stems, and a turning ring by sticks. The owner's rule, from a phone:
      "everything lies in one plane and is solid". It costs boards - main path
      54/70 against 65/70 when a turning ring could pass over sticks - and the
      boards it costs all jam the same way: the foot of an L-stick sits in a
      ring's gap, so the stick cannot leave and the ring cannot turn (10025,
      10048). The shipped game wins those, so it does something there we do
      not (pushing the stick along its slot is a guess). Do not loosen the rule
      to win them back: the owner rejected every version that let parts overlap.
   4. A ring whose own pins still clamp something cannot turn.
   5. A piece leaves the board when nothing holds it and it holds nothing - and,
      if chained, once its lock count has run down.
   6. A BOMB IS A TOOL, NOT A THREAT. When its own circle (r 0.75, as shipped)
      starts touching anything, it goes off: its own piece and everything its
      circle touches go. ⚠ Not when the piece carrying it runs into something
      elsewhere (opts.bombOnBump=false): the owner, on level 17, nudged a bar
      whose far end touched a ring, and the bomb "went off without touching
      anything - and took other rings with it". All 87 shipped bomb boards
      stay winnable without it.
      Bombs sit on exactly the pieces no turn can free - a closed ring two pins
      hold, a stick boxed in. Free bombs lying on the board work the same way.
                                                                               */

var RR = (function () {
  "use strict";

  var EPS = 1e-4;          // a touch is not an overlap
  var BOMB_R = 0.75;       // the bomb's trigger circle as shipped (CircleCollider2D r 0.75)
  var SAGITTA = 0.004;     // how far a chord of a ring body may cut inside the arc

  /* ---------------- shapes ----------------
     t:0 convex polygon, t:1 capsule chain (polyline with radius r).
     lx/ly local points, x/y world points, minx..maxy world box (incl. radius). */

  function poly(pts) {
    var n = pts.length, s = { t: 0, n: n, lx: new Float64Array(n), ly: new Float64Array(n),
      x: new Float64Array(n), y: new Float64Array(n), r: 0, minx: 0, miny: 0, maxx: 0, maxy: 0, ccw: 1 };
    var area = 0;
    for (var i = 0; i < n; i++) {
      s.lx[i] = pts[i][0]; s.ly[i] = pts[i][1];
      var j = (i + 1) % n;
      area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    s.ccw = area >= 0 ? 1 : -1;
    return s;
  }

  function chain(pts, r, closed) {
    var n = pts.length, s = { t: 1, n: n, lx: new Float64Array(n), ly: new Float64Array(n),
      x: new Float64Array(n), y: new Float64Array(n), r: r, closed: !!closed, minx: 0, miny: 0, maxx: 0, maxy: 0 };
    for (var i = 0; i < n; i++) { s.lx[i] = pts[i][0]; s.ly[i] = pts[i][1]; }
    return s;
  }

  function place(s, c, sn, tx, ty) {
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var i = 0; i < s.n; i++) {
      var x = s.lx[i] * c - s.ly[i] * sn + tx, y = s.lx[i] * sn + s.ly[i] * c + ty;
      s.x[i] = x; s.y[i] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    s.minx = minx - s.r; s.miny = miny - s.r; s.maxx = maxx + s.r; s.maxy = maxy + s.r;
  }

  function boxHit(a, b) {
    return a.minx < b.maxx && b.minx < a.maxx && a.miny < b.maxy && b.miny < a.maxy;
  }

  /* SAT, with a tolerance: touching or grazing by less than EPS is not an overlap. */
  function polyPoly(A, B) {
    return !sepAxis(A, B) && !sepAxis(B, A);
  }
  function sepAxis(A, B) {
    for (var i = 0; i < A.n; i++) {
      var j = (i + 1) % A.n;
      var nx = A.y[j] - A.y[i], ny = A.x[i] - A.x[j];
      var len = Math.sqrt(nx * nx + ny * ny);
      if (len < 1e-12) continue;
      nx /= len; ny /= len;
      var amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9, k, d;
      for (k = 0; k < A.n; k++) { d = A.x[k] * nx + A.y[k] * ny; if (d < amin) amin = d; if (d > amax) amax = d; }
      for (k = 0; k < B.n; k++) { d = B.x[k] * nx + B.y[k] * ny; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
      if (amax - bmin <= EPS || bmax - amin <= EPS) return true;
    }
    return false;
  }

  function inPoly(P, px, py) {
    for (var i = 0; i < P.n; i++) {
      var j = (i + 1) % P.n;
      var cr = (P.x[j] - P.x[i]) * (py - P.y[i]) - (P.y[j] - P.y[i]) * (px - P.x[i]);
      if (cr * P.ccw < 0) return false;
    }
    return true;
  }

  /* squared distance between segments p1q1 and p2q2 (Ericson, RTCD 5.1.9) */
  function segSeg2(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
    var d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
    var rx = p1x - p2x, ry = p1y - p2y;
    var a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
    var s, t;
    if (a <= 1e-12 && e <= 1e-12) return rx * rx + ry * ry;
    if (a <= 1e-12) { s = 0; t = clamp01(f / e); }
    else {
      var c = d1x * rx + d1y * ry;
      if (e <= 1e-12) { t = 0; s = clamp01(-c / a); }
      else {
        var b = d1x * d2x + d1y * d2y, den = a * e - b * b;
        s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp01(-c / a); }
        else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
      }
    }
    var dx = p1x + d1x * s - (p2x + d2x * t), dy = p1y + d1y * s - (p2y + d2y * t);
    return dx * dx + dy * dy;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function segPolyHit(ax, ay, bx, by, r, P) {
    if (inPoly(P, ax, ay) || inPoly(P, bx, by)) return true;
    var lim = (r - EPS) * (r - EPS);
    if (r - EPS <= 0) lim = 0;
    for (var i = 0; i < P.n; i++) {
      var j = (i + 1) % P.n;
      var d2 = segSeg2(ax, ay, bx, by, P.x[i], P.y[i], P.x[j], P.y[j]);
      if (d2 < lim || d2 < 1e-14) return true;
    }
    return false;
  }

  function chainPoly(C, P) {
    var segs = C.closed ? C.n : C.n - 1, r = C.r;
    for (var i = 0; i < segs; i++) {
      var j = (i + 1) % C.n;
      var ax = C.x[i], ay = C.y[i], bx = C.x[j], by = C.y[j];
      if (Math.min(ax, bx) - r >= P.maxx || Math.max(ax, bx) + r <= P.minx ||
          Math.min(ay, by) - r >= P.maxy || Math.max(ay, by) + r <= P.miny) continue;
      if (segPolyHit(ax, ay, bx, by, r, P)) return true;
    }
    return false;
  }

  function chainChain(A, B) {
    var sa = A.closed ? A.n : A.n - 1, sb = B.closed ? B.n : B.n - 1, rr = A.r + B.r - EPS;
    var lim = rr * rr;
    for (var i = 0; i < sa; i++) {
      var i2 = (i + 1) % A.n;
      var ax = A.x[i], ay = A.y[i], bx = A.x[i2], by = A.y[i2];
      var mnx = Math.min(ax, bx) - rr, mxx = Math.max(ax, bx) + rr, mny = Math.min(ay, by) - rr, mxy = Math.max(ay, by) + rr;
      if (mnx >= B.maxx || mxx <= B.minx || mny >= B.maxy || mxy <= B.miny) continue;
      for (var j = 0; j < sb; j++) {
        var j2 = (j + 1) % B.n;
        var cx = B.x[j], cy = B.y[j], dx = B.x[j2], dy = B.y[j2];
        if (Math.max(cx, dx) <= mnx || Math.min(cx, dx) >= mxx || Math.max(cy, dy) <= mny || Math.min(cy, dy) >= mxy) continue;
        if (segSeg2(ax, ay, bx, by, cx, cy, dx, dy) < lim) return true;
      }
    }
    return false;
  }

  function shapeHit(a, b) {
    if (!boxHit(a, b)) return false;
    if (a.t === 0 && b.t === 0) return polyPoly(a, b);
    if (a.t === 1 && b.t === 0) return chainPoly(a, b);
    if (a.t === 0 && b.t === 1) return chainPoly(b, a);
    return chainChain(a, b);
  }

  /* ---------------- groups ----------------
     A group is one collider as the shipped game has it (a ring body, one stem,
     one head trigger, one wall...). Overlap is judged group against group, never
     shape against shape: a ring body is forty capsules, and the tube sliding
     through a clamp moves from one capsule to the next without ever leaving it. */

  var UID = 0;
  function group(owner, kind, shapes, clamp) {
    var g = { uid: ++UID, owner: owner, kind: kind, shapes: shapes, clamp: clamp || null,
      minx: 0, miny: 0, maxx: 0, maxy: 0, solid: true };
    return g;
  }
  function groupBox(g) {
    var s = g.shapes, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var i = 0; i < s.length; i++) {
      if (s[i].minx < minx) minx = s[i].minx; if (s[i].maxx > maxx) maxx = s[i].maxx;
      if (s[i].miny < miny) miny = s[i].miny; if (s[i].maxy > maxy) maxy = s[i].maxy;
    }
    g.minx = minx; g.miny = miny; g.maxx = maxx; g.maxy = maxy;
  }
  function groupHit(a, b) {
    if (!boxHit(a, b)) return false;
    for (var i = 0; i < a.shapes.length; i++)
      for (var j = 0; j < b.shapes.length; j++)
        if (shapeHit(a.shapes[i], b.shapes[j])) return true;
    return false;
  }
  function pairKey(a, b) { return a.uid < b.uid ? a.uid * 1048576 + b.uid : b.uid * 1048576 + a.uid; }

  /* ---------------- building a level ---------------- */

  function ringBody(R, h, gapDeg) {
    var pts = [];
    var step = 2 * Math.acos(Math.max(-1, 1 - SAGITTA / R));
    if (!(gapDeg > 0)) {
      var n = Math.max(12, Math.ceil(2 * Math.PI / step));
      for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
      return chain(pts, h, true);
    }
    var half = gapDeg * Math.PI / 360 + h / R;          // where the round caps are centred
    var span = 2 * Math.PI - 2 * half;
    if (span <= 0) span = 1e-3;
    var m = Math.max(1, Math.ceil(span / step));
    for (var k = 0; k <= m; k++) { var b = half + span * k / m; pts.push([R * Math.cos(b), R * Math.sin(b)]); }
    return chain(pts, h, false);
  }

  /* opts.stickRing - what a stick and a ring body do to each other:
       "both"  each stops the other
       "ring"  a stick stops a ring turning, a ring body never stops a stick
       "none"  they pass through each other (pins, heads, guides still count) */
  function Game(lv, opts) {
    this.lv = lv;
    this.opts = Object.assign({ stickRing: "both", stickMove: "localy0", releasedSolid: "walls", bombOnBump: false, stickVsStem: true }, opts || {});
    this.pieces = [];
    this.statics = [];
    this.clamps = [];
    this.byId = {};
    this.removedCount = 0;
    this.events = [];
    var self = this;

    lv.rings.forEach(function (d) {
      var p = { id: d.id, kind: "ring", d: d, cx: d.x, cy: d.y, a0: d.a * Math.PI / 180, ang: d.a * Math.PI / 180,
        R: d.R, h: d.h, gap: d.g, col: d.col, pal: d.c, lock: d.lock | 0, bomb: d.bomb || null, rnd: d.rnd !== 0,
        removed: false, groups: [], pins: [], stops: [] };
      p.body = group(p, "body", [ringBody(d.R, d.h, d.g)]);
      p.groups.push(p.body);
      d.pins.forEach(function (pin) {
        var stem = pin.stem ? group(p, "stem", pin.stem.map(poly)) : null;
        var trig = pin.trig ? group(p, "trig", [poly(pin.trig)]) : null;
        var walls = (pin.walls || []).map(function (w) { return group(p, "wall", [poly(w)]); });
        if (stem) p.groups.push(stem);
        if (trig) p.groups.push(trig);
        walls.forEach(function (w) { p.groups.push(w); });
        p.pins.push({ k: pin.k, stem: stem, trig: trig, walls: walls, clamp: null });
      });
      d.stops.forEach(function (st) { var g = group(p, "stop", [poly(st)]); p.groups.push(g); p.stops.push(g); });
      addBomb(p);
      self.add(p);
    });

    lv.sticks.forEach(function (d) {
      var a = d.a * Math.PI / 180;
      var p = { id: d.id, kind: "stick", d: d, ox: d.x, oy: d.y, a0: a, ca: Math.cos(a), sa: Math.sin(a), s: 0,
        h: d.h, col: d.col, pal: d.c, lock: 0, bomb: d.bomb || null, rnd: d.rnd !== 0, removed: false, groups: [] };
      // the rail: drawn path with its corners filleted, run on past both ends in a straight line
      var tr = d.track || d.path, cum = [0];
      for (var i = 1; i < tr.length; i++) cum.push(cum[i - 1] + Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]));
      p.track = tr; p.cum = cum; p.len = cum[cum.length - 1]; p.trim = d.track ? d.trim : 0;
      p.axis = stickAxis(self.opts, d);
      p.rigid = !!p.axis;
      p.reach = p.len;
      p.body = group(p, "body", [chain([[0, 0], [0, 0]], d.h, false)]);
      p.groups.push(p.body);
      addBomb(p);
      self.add(p);
    });

    lv.guides.forEach(function (d) {
      var s = { id: d.id, kind: "guide", d: d, host: d.host || "", removed: false, groups: [] };
      s.trig = group(s, "trig", [poly(d.trig)]);
      s.walls = d.walls.map(function (w) { return group(s, "wall", [poly(w)]); });
      s.groups.push(s.trig);
      s.walls.forEach(function (w) { s.groups.push(w); });
      s.groups.forEach(function (g) { g.shapes.forEach(function (sh) { place(sh, 1, 0, 0, 0); }); groupBox(g); });
      self.statics.push(s); self.byId[s.id] = s;
    });
    (lv.hosts || []).forEach(function (d) {
      var s = { id: d.id, kind: "host", d: d, removed: false, groups: [], guides: [] };
      s.groups.push(group(s, "host", d.polys.map(poly)));
      s.groups.forEach(function (g) { g.shapes.forEach(function (sh) { place(sh, 1, 0, 0, 0); }); groupBox(g); });
      self.statics.push(s); self.byId[s.id] = s;
    });
    this.statics.forEach(function (s) { if (s.kind === "guide" && s.host && self.byId[s.host]) self.byId[s.host].guides.push(s); });
    (lv.bombs || []).forEach(function (b, i) {
      var s = { id: "bomb_" + (i + 1), kind: "bomb", x: b[0], y: b[1], removed: false, groups: [] };
      s.groups.push(group(s, "bomb", [chain([[b[0], b[1]], [b[0], b[1]]], BOMB_R, false)]));
      s.groups.forEach(function (g) { g.shapes.forEach(function (sh) { place(sh, 1, 0, 0, 0); }); groupBox(g); });
      self.statics.push(s); self.byId[s.id] = s;
    });

    this.pieces.forEach(function (p) { self.placePiece(p); });

    // clamps
    lv.links.forEach(function (l) {
      var src = self.byId[l[0]], tgt = self.byId[l[2]];
      if (!src || !tgt) return;
      var pin = src.pins.filter(function (q) { return q.k === l[1]; })[0];
      if (!pin || !pin.trig) return;
      var c = { owner: src, guide: null, trig: pin.trig, walls: pin.walls, target: tgt, active: true, pin: pin };
      pin.clamp = c; pin.trig.clamp = c;
      self.clamps.push(c);
    });
    lv.glinks.forEach(function (l) {
      var g = self.byId[l[0]], tgt = self.byId[l[1]];
      if (!g || !tgt) return;
      var c = { owner: null, guide: g, trig: g.trig, walls: g.walls, target: tgt, active: true, pin: null };
      g.clamp = c; g.trig.clamp = c;
      self.clamps.push(c);
    });
    // ⚠ The clamp state is the geometry, from the first frame. A link whose head
    // misses its target in the shipped data would otherwise hold forever.
    this.mismatch = [];
    this.clamps.forEach(function (c) {
      c.active = groupHit(c.trig, c.target.body);
      if (!c.active) self.mismatch.push(c);
    });
    this.groupsAll = null;
  }

  /* opts.stickMove - how a stick moves:
       "rail"    runs along its own path like a train (bends travel) - ⚠ WRONG, the
                 owner played it on a phone: a bar must keep its shape
       "axis"    rigid, along its own local x
       "world0"  rigid; lockDirectionType 1 along its own x, 0 along the WORLD x
       "localy0" rigid; type 1 along its own x, type 0 along its own y
     Returns the slide direction in the stick's local frame, or null for "rail". */
  function stickAxis(opts, d) {
    var m = opts.stickMove || "world0";
    if (m === "rail") return null;
    if (m === "axis" || !d.free) return [1, 0];
    if (m === "localy0") return [0, 1];
    var a = d.a * Math.PI / 180;           // world x seen from the stick
    return [Math.cos(a), -Math.sin(a)];
  }

  Game.prototype.add = function (p) { this.pieces.push(p); this.byId[p.id] = p; };

  /* ⚠ A bomb rides on its piece and is NOT a threat: it is how a piece that no
     turn can free (a closed ring two pins hold, a stick boxed in) leaves the
     board. The first time the bomb starts overlapping anything, it goes off and
     takes its own piece with it. Measured, not assumed: of the 47 main-path
     levels that could not be won without this, almost every one carries a bomb,
     and 13 of the first 15 bombs sit on exactly such a piece. */
  function addBomb(p) {
    if (!p.bomb) return;
    var b = p.bomb;
    p.bombGroup = group(p, "bomb", [chain([[b[0], b[1]], [b[0], b[1]]], BOMB_R, false)]);
    p.groups.push(p.bombGroup);
  }

  /* a point of a stick's rail at arc length u (local frame) */
  function railAt(p, u) {
    var tr = p.track, cum = p.cum, n = tr.length;
    if (u <= 0) {
      var dx = tr[0][0] - tr[1][0], dy = tr[0][1] - tr[1][1], l = Math.hypot(dx, dy) || 1;
      return [tr[0][0] - dx / l * u, tr[0][1] - dy / l * u];
    }
    if (u >= p.len) {
      var ex = tr[n - 1][0] - tr[n - 2][0], ey = tr[n - 1][1] - tr[n - 2][1], le = Math.hypot(ex, ey) || 1;
      return [tr[n - 1][0] + ex / le * (u - p.len), tr[n - 1][1] + ey / le * (u - p.len)];
    }
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= u) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], t = seg > 0 ? (u - cum[lo]) / seg : 0;
    return [tr[lo][0] + (tr[hi][0] - tr[lo][0]) * t, tr[lo][1] + (tr[hi][1] - tr[lo][1]) * t];
  }
  /* the stick's body: the stretch of rail from trim+s to len-trim+s */
  function stickBody(p) {
    // a rigid stick keeps its shape and slides along p.axis; a free one runs its rail
    var rs = p.rigid ? 0 : p.s, sx = p.rigid ? p.s * p.axis[0] : 0, sy = p.rigid ? p.s * p.axis[1] : 0;
    var u0 = p.trim + rs, u1 = p.len - p.trim + rs, pts = [railAt(p, u0)];
    for (var i = 1; i < p.track.length - 1; i++) if (p.cum[i] > u0 + 1e-6 && p.cum[i] < u1 - 1e-6) pts.push(p.track[i]);
    pts.push(railAt(p, u1));
    if (sx || sy) for (var j = 0; j < pts.length; j++) pts[j] = [pts[j][0] + sx, pts[j][1] + sy];
    var sh = p.body.shapes[0], n = pts.length;
    if (sh.lx.length !== n) { sh.lx = new Float64Array(n); sh.ly = new Float64Array(n); sh.x = new Float64Array(n); sh.y = new Float64Array(n); }
    sh.n = n;
    for (var k = 0; k < n; k++) { sh.lx[k] = pts[k][0]; sh.ly[k] = pts[k][1]; }
    // a bomb on a stick rides the rail with it
    if (p.bombGroup) {
      if (p.bombU == null) p.bombU = railNearest(p, p.bomb);
      var bp = railAt(p, p.bombU + rs), bs = p.bombGroup.shapes[0];
      bp = [bp[0] + sx, bp[1] + sy];
      bs.lx[0] = bs.lx[1] = bp[0]; bs.ly[0] = bs.ly[1] = bp[1];
    }
  }
  /* arc length of the rail point nearest a local point */
  function railNearest(p, q) {
    var best = 0, bd = 1e9, tr = p.track;
    for (var i = 0; i < tr.length - 1; i++) {
      var ax = tr[i][0], ay = tr[i][1], vx = tr[i + 1][0] - ax, vy = tr[i + 1][1] - ay, L2 = vx * vx + vy * vy;
      var t = L2 ? Math.max(0, Math.min(1, ((q[0] - ax) * vx + (q[1] - ay) * vy) / L2)) : 0;
      var d = Math.hypot(q[0] - ax - vx * t, q[1] - ay - vy * t);
      if (d < bd) { bd = d; best = p.cum[i] + t * Math.sqrt(L2); }
    }
    return best;
  }

  Game.prototype.placePiece = function (p) {
    var c, s, tx, ty;
    if (p.kind === "ring") { c = Math.cos(p.ang); s = Math.sin(p.ang); tx = p.cx; ty = p.cy; }
    else { stickBody(p); c = p.ca; s = p.sa; tx = p.ox; ty = p.oy; }
    for (var i = 0; i < p.groups.length; i++) {
      var g = p.groups[i];
      for (var k = 0; k < g.shapes.length; k++) place(g.shapes[k], c, s, tx, ty);
      groupBox(g);
    }
  };

  /* every group that can stop a piece: live pieces, guides still holding something, hosts */
  Game.prototype.solidGroups = function (except) {
    var out = [];
    for (var i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (p.removed || p === except) continue;
      for (var k = 0; k < p.groups.length; k++) out.push(p.groups[k]);
    }
    for (i = 0; i < this.statics.length; i++) {
      var s = this.statics[i];
      if (s.removed) continue;
      for (k = 0; k < s.groups.length; k++) out.push(s.groups[k]);
    }
    return out;
  };

  /* Why a piece will not move at all, or null. */
  Game.prototype.stuckReason = function (p) {
    if (p.removed) return "gone";
    if (p.lock > 0) return "chained";
    if (p.kind === "ring") {
      for (var i = 0; i < p.pins.length; i++) if (p.pins[i].clamp && p.pins[i].clamp.active) return "pinned";
    }
    return null;
  };

  /* ---------------- moving ----------------
     A drag is begin() -> any number of moveTo() -> end(). moveTo takes the pose
     the finger asks for and walks toward it in small steps; the first step that
     would start an overlap is cut back by bisection to the contact, and the walk
     stops there. Pose is an angle for a ring, an offset along its axis for a stick. */

  function Drag(game, p) {
    this.g = game; this.p = p;
    var mine = p.groups, others = game.solidGroups(p);
    // a ring sweeps a disc; keep only what can ever meet it
    if (p.kind === "ring") {
      var ext = 0;
      for (var i = 0; i < mine.length; i++) {
        var sh = mine[i].shapes;
        for (var k = 0; k < sh.length; k++)
          for (var q = 0; q < sh[k].n; q++)
            ext = Math.max(ext, Math.hypot(sh[k].lx[q], sh[k].ly[q]) + sh[k].r);
      }
      others = others.filter(function (o) {
        return o.maxx > p.cx - ext && o.minx < p.cx + ext && o.maxy > p.cy - ext && o.miny < p.cy + ext;
      });
    }
    this.others = others;
    // which of my parts can meet which of theirs (see Game.opts.stickRing)
    var mode = game.opts.stickRing, pairs = [];
    for (var a = 0; a < mine.length; a++)
      for (var b = 0; b < others.length; b++) {
        var m = mine[a], o = others[b];
        if (mode === "stick") {
          // a dragged stick is stopped by everything; a turning ring passes over sticks
          if (p.kind === "ring" && o.owner.kind === "stick" && m.kind !== "bomb" && o.kind !== "bomb") continue;
        } else if (mode !== "both" && m.kind !== "bomb" && o.kind !== "bomb") {
          if (p.kind === "stick" && o.owner.kind === "ring" && o.kind === "body") continue;
          if (mode === "none" && p.kind === "ring" && m.kind === "body" && o.owner.kind === "stick") continue;
        }
        if (game.opts.releasedSolid === false && (deadHead(m) || deadHead(o))) continue;
        if (game.opts.releasedSolid === "walls" && ((m.kind === "trig" && deadHead(m)) || (o.kind === "trig" && deadHead(o)))) continue;
        if (game.opts.stickVsStem === false && ((p.kind === "stick" && (o.kind === "stem" || o.kind === "stop")) || (p.kind === "ring" && (m.kind === "stem" || m.kind === "stop") && o.owner.kind === "stick"))) continue;
        if (game.opts.stopVsBody === false && ((m.kind === "stop" && o.kind === "body") || (o.kind === "stop" && m.kind === "body"))) continue;
        pairs.push(m, o);
      }
    this.pairs = pairs;
    this.allowed = this.overlaps();
  }
  /* the head of a pin that has already let go (or never held: a designed stopper) */
  function deadHead(gr) {
    if (gr.kind !== "trig" && gr.kind !== "wall") return false;
    if (gr.owner.kind !== "ring") return false;
    for (var i = 0; i < gr.owner.pins.length; i++) {
      var pin = gr.owner.pins[i];
      if (pin.trig === gr || pin.walls.indexOf(gr) >= 0) return !pin.clamp || !pin.clamp.active;
    }
    return false;
  }
  Drag.prototype.pose = function () { return this.p.kind === "ring" ? this.p.ang : this.p.s; };
  Drag.prototype.setPose = function (v) {
    if (this.p.kind === "ring") this.p.ang = v; else this.p.s = v;
    this.g.placePiece(this.p);
  };
  Drag.prototype.overlaps = function () {
    var set = new Set(), pr = this.pairs;
    for (var i = 0; i < pr.length; i += 2)
      if (groupHit(pr[i], pr[i + 1])) set.add(pairKey(pr[i], pr[i + 1]));
    return set;
  };
  /* Overlaps at the current pose. `fresh` lists the other parts this pose
     newly runs into (a block); `boom` is a bomb whose circle newly touches
     something (a detonation, not a block). */
  Drag.prototype.check = function () {
    var pr = this.pairs, allowed = this.allowed, now = new Set(), fresh = null, boom = null;
    for (var i = 0; i < pr.length; i += 2)
      if (groupHit(pr[i], pr[i + 1])) {
        var k = pairKey(pr[i], pr[i + 1]);
        if (!allowed.has(k)) {
          if (pr[i].kind === "bomb") boom = boom || pr[i];
          else if (pr[i + 1].kind === "bomb") boom = boom || pr[i + 1];
          else (fresh = fresh || []).push(pr[i + 1]);
        }
        now.add(k);
      }
    return { now: now, fresh: fresh, boom: boom };
  };
  /* the largest step that moves no point of the piece more than ~0.06 */
  Drag.prototype.maxStep = function () {
    if (this.p.kind !== "ring") return 0.06;
    if (!this.reachR) {
      var r = 0.5, mine = this.p.groups;
      for (var i = 0; i < mine.length; i++) {
        var sh = mine[i].shapes;
        for (var k = 0; k < sh.length; k++)
          for (var q = 0; q < sh[k].n; q++) r = Math.max(r, Math.hypot(sh[k].lx[q], sh[k].ly[q]));
      }
      this.reachR = r;
    }
    return 0.06 / this.reachR;
  };
  /* Walk toward `target`. Returns {moved, blocked, boom}; fires clamp releases.
     ⚠ A piece carrying a bomb that runs into anything sets its bomb off (see
     Game.detonate). Measured: on level 44 the bomb rides a stick a little short
     of its tip, so the tip meets the blue ring's stem first - and that ring is a
     closed one two pins hold, which nothing but this blast can ever remove. */
  Drag.prototype.moveTo = function (target) {
    var from = this.pose(), d = target - from;
    if (Math.abs(d) < 1e-9) return { moved: 0, blocked: false };
    var step = this.maxStep(), n = Math.ceil(Math.abs(d) / step), cur = from;
    for (var i = 1; i <= n; i++) {
      var next = from + d * i / n;
      this.setPose(next);
      var c = this.check();
      if (!c.fresh && !c.boom) { this.accept(c.now); cur = next; continue; }
      // bisect to the contact
      var lo = cur, hi = next, hit = c;
      for (var b = 0; b < 10; b++) {
        var mid = (lo + hi) / 2;
        this.setPose(mid);
        var c2 = this.check();
        if (!c2.fresh && !c2.boom) { this.accept(c2.now); lo = mid; } else { hi = mid; hit = c2; }
      }
      var bomb = hit.boom;
      if (!bomb && hit.fresh && this.g.opts.bombOnBump !== false && this.p.bombGroup) bomb = this.p.bombGroup;
      if (bomb) {
        this.setPose(hi);
        var extra = [];
        if (hit.fresh && bomb === this.p.bombGroup) hit.fresh.forEach(function (gr) { extra.push(gr.owner); });
        this.g.detonate(bomb, extra);
        return { moved: hi - from, blocked: true, boom: bomb.owner };
      }
      this.setPose(lo);
      return { moved: lo - from, blocked: true };
    }
    return { moved: cur - from, blocked: false };
  };
  /* A clip holds whatever of its target lies in it - not "until it first lets
     go". ⚠ The owner, on a phone: on level 5 the blue ring slid back into the
     green clip it had left, then vanished while sitting in it. A guide is
     different: it goes with the stick that ran out of it. */
  Drag.prototype.accept = function (now) {
    this.allowed = now;
    var g = this.g, p = this.p;
    for (var i = 0; i < g.clamps.length; i++) {
      var c = g.clamps[i];
      if (c.target !== p && c.owner !== p) continue;
      if ((c.guide && !c.active) || c.target.removed || (c.owner && c.owner.removed)) continue;
      var on = groupHit(c.trig, c.target.body);
      if (c.active && !on) g.release(c);
      else if (!c.active && on && !c.guide) g.grip(c);
    }
  };

  Game.prototype.begin = function (p) {
    if (this.stuckReason(p)) return null;
    return new Drag(this, p);
  };

  Game.prototype.release = function (c) {
    c.active = false;
    this.events.push({ type: "release", clamp: c });
    if (c.guide) {
      // a guide has done its job once its piece slides out; it goes with it
      c.guide.removed = true;
      this.events.push({ type: "guideGone", guide: c.guide });
      var h = c.guide.host && this.byId[c.guide.host];
      if (h && !h.removed && h.guides.every(function (q) { return q.removed; })) {
        h.removed = true;
        this.events.push({ type: "hostGone", host: h });
      }
    }
  };

  Game.prototype.grip = function (c) {
    c.active = true;
    this.events.push({ type: "grip", clamp: c });
  };

  Game.prototype.holds = function (p) {
    for (var i = 0; i < this.clamps.length; i++) {
      var c = this.clamps[i];
      if (c.active && (c.target === p || c.owner === p)) return true;
    }
    return false;
  };

  /* Take off every piece nothing holds. Returns the pieces taken, in order. */
  Game.prototype.sweep = function () {
    var out = [], again = true;
    while (again) {
      again = false;
      for (var i = 0; i < this.pieces.length; i++) {
        var p = this.pieces[i];
        if (p.removed || p.lock > 0 || this.holds(p)) continue;
        this.take(p, "free");
        out.push(p); again = true;
      }
    }
    return out;
  };

  Game.prototype.take = function (p, cause) {
    p.removed = true;
    this.removedCount++;
    var self = this;
    this.clamps.forEach(function (c) {
      if (c.active && (c.owner === p || c.target === p)) self.release(c);
    });
    this.pieces.forEach(function (q) { if (!q.removed && q.lock > 0) q.lock--; });
    this.events.push({ type: "gone", piece: p, cause: cause });
  };

  /* A bomb goes off: its piece goes, and so does every piece any part of
     which the bomb is touching at that moment; a guide it touches lets go.
     ⚠ The blast is the bomb's own circle, not just the thing it ran into: on
     level 19 the bomb rides a stick whose bomb already sits on the green ring,
     and the closed red ring next to it can only ever leave if the green one
     goes in the same blast. */
  Game.prototype.detonate = function (bg, extra) {
    var carrier = bg.owner, hit = [];
    var all = this.solidGroups(carrier);
    for (var i = 0; i < all.length; i++) {
      var o = all[i].owner;
      if (hit.indexOf(o) >= 0 || o.removed || o.kind === "host") continue;
      if (groupHit(bg, all[i])) hit.push(o);
    }
    (extra || []).forEach(function (o) { if (hit.indexOf(o) < 0 && o !== carrier) hit.push(o); });
    this.events.push({ type: "boom", piece: carrier, victims: hit, x: bg.shapes[0].x[0], y: bg.shapes[0].y[0] });
    if (carrier.kind === "bomb") carrier.removed = true;
    else this.take(carrier, "bomb");
    for (var k = 0; k < hit.length; k++) {
      var v = hit[k];
      if (v.removed) continue;
      if (v.kind === "ring" || v.kind === "stick") { v.lock = 0; this.take(v, "blast"); }
      else if (v.kind === "guide" && v.clamp && v.clamp.active) this.release(v.clamp);
    }
  };

  /* boosters: take one piece by force, then whatever that frees */
  Game.prototype.smash = function (p, cause) {
    if (p.removed) return [];
    p.lock = 0;
    this.take(p, cause);
    return [p].concat(this.sweep());
  };

  /* the whole mutable state, for restart-free undo and for the solver */
  Game.prototype.snapshot = function () {
    return {
      pose: this.pieces.map(function (p) { return p.kind === "ring" ? p.ang : p.s; }),
      gone: this.pieces.map(function (p) { return p.removed; }),
      lock: this.pieces.map(function (p) { return p.lock; }),
      clamp: this.clamps.map(function (c) { return c.active; }),
      stat: this.statics.map(function (s) { return s.removed; }),
      n: this.removedCount,
    };
  };
  Game.prototype.restore = function (s) {
    for (var i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (p.kind === "ring") p.ang = s.pose[i]; else p.s = s.pose[i];
      p.removed = s.gone[i]; p.lock = s.lock[i];
      this.placePiece(p);
    }
    for (i = 0; i < this.clamps.length; i++) this.clamps[i].active = s.clamp[i];
    for (i = 0; i < this.statics.length; i++) this.statics[i].removed = s.stat[i];
    this.removedCount = s.n;
    this.events.length = 0;
  };

  Game.prototype.left = function () {
    var n = 0;
    for (var i = 0; i < this.pieces.length; i++) if (!this.pieces[i].removed) n++;
    return n;
  };
  Game.prototype.won = function () { return this.left() === 0; };

  /* the piece under a point, for a finger: rings by distance to the tube,
     sticks by distance to their centre line */
  Game.prototype.pick = function (x, y, slop) {
    slop = slop == null ? 0.55 : slop;
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (p.removed) continue;
      var d;
      if (p.kind === "ring") {
        d = Math.abs(Math.hypot(x - p.cx, y - p.cy) - p.R) - p.h;
      } else {
        var s = p.body.shapes[0]; d = 1e9;
        for (var k = 0; k < s.n - 1; k++) d = Math.min(d, Math.sqrt(segSeg2(x, y, x, y, s.x[k], s.y[k], s.x[k + 1], s.y[k + 1])));
        d -= p.h;
      }
      if (d < slop && d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  /* For dragging a stick: where on its rail the finger took hold (arc length,
     relative to the current shift), and the rail's world direction there. The
     finger's movement projected on that direction is how far the stick runs. */
  Game.prototype.stickGrab = function (p, x, y) {
    var dx = x - p.ox, dy = y - p.oy;
    var lx = dx * p.ca + dy * p.sa, ly = -dx * p.sa + dy * p.ca;
    var s = p.body.shapes[0], best = 0, bd = 1e9, run = 0;
    for (var i = 0; i < s.n - 1; i++) {
      var ax = s.lx[i], ay = s.ly[i], vx = s.lx[i + 1] - ax, vy = s.ly[i + 1] - ay, L = Math.hypot(vx, vy);
      var t = L ? Math.max(0, Math.min(1, ((lx - ax) * vx + (ly - ay) * vy) / (L * L))) : 0;
      var d = Math.hypot(lx - ax - vx * t, ly - ay - vy * t);
      if (d < bd) { bd = d; best = run + t * L; }
      run += L;
    }
    return p.trim + best;      // the body starts `trim` along the rail from its own start
  };
  Game.prototype.stickTangent = function (p, u) {
    var tx = p.rigid ? p.axis[0] : 1, ty = p.rigid ? p.axis[1] : 0;
    if (!p.rigid) {
      var a = railAt(p, u + p.s - 0.05), b = railAt(p, u + p.s + 0.05);
      tx = b[0] - a[0]; ty = b[1] - a[1];
      var l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    }
    return [tx * p.ca - ty * p.sa, tx * p.sa + ty * p.ca];
  };

  Game.prototype.bounds = function () {
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    var all = this.solidGroups(null);
    all.forEach(function (g) {
      if (g.minx < minx) minx = g.minx; if (g.maxx > maxx) maxx = g.maxx;
      if (g.miny < miny) miny = g.miny; if (g.maxy > maxy) maxy = g.maxy;
    });
    return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
  };

  /* A fingerprint of the board as shipped data, for telemetry rows. */
  function fingerprint(lv) {
    var s = JSON.stringify([lv.rings, lv.sticks, lv.guides, lv.links, lv.glinks]), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  return { Game: Game, Drag: Drag, groupHit: groupHit, pairKey: pairKey, fingerprint: fingerprint, EPS: EPS };
})();

if (typeof module !== "undefined") module.exports = RR;
