/* Rotate Ring - drawing. Reads the engine's world geometry, never changes it.

   World units are the shipped game's (y up); a ring of the common size is R 1.75
   with a 0.5 tube. Everything is canvas 2D strokes, rebuilt every frame: a ring
   is four strokes (shadow, dark rim, face, highlight), cheap enough for the
   60-piece boards.

   ⚠ The look is measured off the reference video (384x848): cream board
   #F6E9D3, a common ring 72 px across on a 384 px wide phone (0.047 of the
   width per world unit), pins as a narrow stem ending in a block that sits ON
   the other ring's tube.                                                     */

var RRView = (function () {
  "use strict";

  var BG = "#f6e9d3";
  // ⚠ drawn tube vs collider tube: the video's tube is 0.29 of the ring's outer
  // radius where the collider's is 0.25, so the picture is a little fatter than
  // the physics. Collisions stay exact; only the paint grows.
  var TUBE = 1.15;
  // the zoom ceiling, both axes (UI_UX_RULES 5.2b): a small board must not swell
  var UNIT_W = 0.047, UNIT_H = 0.024;

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(rgb, to, t) { return [rgb[0] + (to[0] - rgb[0]) * t, rgb[1] + (to[1] - rgb[1]) * t, rgb[2] + (to[2] - rgb[2]) * t]; }
  function css(rgb, a) { return a == null ? "rgb(" + (rgb[0] | 0) + "," + (rgb[1] | 0) + "," + (rgb[2] | 0) + ")" : "rgba(" + (rgb[0] | 0) + "," + (rgb[1] | 0) + "," + (rgb[2] | 0) + "," + a + ")"; }
  function shades(col) {
    var b = hex(col);
    return { base: css(b), dark: css(mix(b, [20, 10, 30], 0.28)), darker: css(mix(b, [20, 10, 30], 0.42)),
      light: css(mix(b, [255, 255, 255], 0.42)), glow: css(mix(b, [255, 250, 220], 0.7)), rgb: b };
  }


  /* ---------------- where a dragged piece hit something ----------------
     The engine says a move was blocked, not where. This finds it: the closest
     pair of edges between the dragged piece and everything solid that it is
     NOT already overlapping - a head clamped over its tube overlaps by design,
     and would otherwise always win. Only run on a bump, so the brute force over
     edges is fine. Returns [x, y] in world units, or null. */
  function segClosest(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y, out) {
    var d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y, rx = p1x - p2x, ry = p1y - p2y;
    var a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry, s = 0, t = 0;
    var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    if (a > 1e-12 || e > 1e-12) {
      if (a <= 1e-12) t = cl(f / e);
      else {
        var c = d1x * rx + d1y * ry;
        if (e <= 1e-12) s = cl(-c / a);
        else {
          var b = d1x * d2x + d1y * d2y, den = a * e - b * b;
          s = den > 1e-12 ? cl((b * f - c * e) / den) : 0;
          t = (b * s + f) / e;
          if (t < 0) { t = 0; s = cl(-c / a); } else if (t > 1) { t = 1; s = cl((b - c) / a); }
        }
      }
    }
    out[0] = p1x + d1x * s; out[1] = p1y + d1y * s; out[2] = p2x + d2x * t; out[3] = p2y + d2y * t;
    var dx = out[0] - out[2], dy = out[1] - out[3];
    return dx * dx + dy * dy;
  }
  function edges(sh) {
    var n = sh.n, out = [], last = sh.t === 0 || sh.closed ? n : n - 1;
    if (n === 1) out.push([sh.x[0], sh.y[0], sh.x[0], sh.y[0]]);
    for (var i = 0; i < last; i++) { var j = (i + 1) % n; out.push([sh.x[i], sh.y[i], sh.x[j], sh.y[j]]); }
    return out;
  }
  function near(a, b, m) { return a.minx - m < b.maxx && b.minx - m < a.maxx && a.miny - m < b.maxy && b.miny - m < a.maxy; }
  function contact(game, p) {
    if (typeof RR === "undefined" || !RR.groupHit) return null;
    var others = game.solidGroups(p), best = 1e9, at = null, tmp = [0, 0, 0, 0];
    for (var i = 0; i < p.groups.length; i++) {
      var mg = p.groups[i];
      for (var j = 0; j < others.length; j++) {
        var og = others[j];
        if (!near(mg, og, 0.25) || RR.groupHit(mg, og)) continue;
        for (var a = 0; a < mg.shapes.length; a++) {
          var ms = mg.shapes[a];
          for (var b = 0; b < og.shapes.length; b++) {
            var os = og.shapes[b];
            if (!near(ms, os, 0.25)) continue;
            var me = edges(ms), oe = edges(os);
            for (var u = 0; u < me.length; u++) {
              var A = me[u];
              if (Math.min(A[0], A[2]) - ms.r - 0.25 > os.maxx || Math.max(A[0], A[2]) + ms.r + 0.25 < os.minx ||
                  Math.min(A[1], A[3]) - ms.r - 0.25 > os.maxy || Math.max(A[1], A[3]) + ms.r + 0.25 < os.miny) continue;
              for (var v = 0; v < oe.length; v++) {
                var B = oe[v], d2 = segClosest(A[0], A[1], A[2], A[3], B[0], B[1], B[2], B[3], tmp);
                var gap = Math.sqrt(d2) - ms.r - os.r;
                if (gap < best) {
                  best = gap;
                  var L = Math.sqrt(d2) || 1, k = (ms.r + Math.max(0, gap) / 2) / L;
                  at = [tmp[0] + (tmp[2] - tmp[0]) * k, tmp[1] + (tmp[3] - tmp[1]) * k];
                }
              }
            }
          }
        }
      }
    }
    return best < 0.3 ? at : null;
  }

  function View(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = 1; this.h = 1; this.dpr = 1;
    this.sc = 20; this.cx = 0; this.cy = 0; this.wx = 0; this.wy = 0;
    this.parts = [];
    this.texts = [];
    this.dying = [];
    this.rockets = [];
    this.flash = [];
    this.clangs = [];
    this.bgImg = null;
    this.t = 0;
  }

  View.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + "px"; this.cv.style.height = h + "px";
    this.bgImg = null;
  };

  /* fit the board into the free rectangle (css px) between the bars */
  View.prototype.fit = function (game, rect) {
    var b = game.bounds();
    if (!isFinite(b.minx)) b = { minx: -2, maxx: 2, miny: -2, maxy: 2 };
    var bw = Math.max(1, b.maxx - b.minx), bh = Math.max(1, b.maxy - b.miny);
    var pad = 14;
    var fitSc = Math.min((rect.w - 2 * pad) / bw, (rect.h - 2 * pad) / bh);
    var cap = Math.min(this.w * UNIT_W * 1.25, Math.max(this.h * UNIT_H * 1.25, 14));
    cap = Math.max(cap, Math.min(this.w, this.h) * 0.045);
    this.base = Math.max(4, Math.min(fitSc, cap));
    this.cap = Math.max(this.base, cap);
    this.zoom = 1;
    this.bwx = (b.minx + b.maxx) / 2; this.bwy = (b.miny + b.maxy) / 2;
    this.bb = b;
    this.rect = rect;
    this.cx = rect.x + rect.w / 2; this.cy = rect.y + rect.h / 2;
    this.wx = this.bwx; this.wy = this.bwy;
    this.sc = this.base;
  };

  /* ---------------- zoom ----------------
     UI_UX_RULES 2.11: every way of zooming - wheel, pinch, the two buttons -
     goes through zoomAt, so the buttons always know where the ceiling and the
     floor are. The floor is the fitted board; the ceiling is the size a small
     board is shown at anyway. */
  // ⚠ No zoom, by the owner's call (2026-10-17) - see canZoom in render3d.js
  View.prototype.canZoom = function () { return false; };
  View.prototype.zoomAt = function (factor, sx, sy) {
    if (!this.canZoom()) return;
    var maxZ = this.cap / this.base;
    var z = Math.max(1, Math.min(maxZ, this.zoom * factor));
    if (sx == null) { sx = this.cx; sy = this.cy; }
    var w = this.s2w(sx, sy);
    this.zoom = z; this.sc = this.base * z;
    // keep the world point under the finger where it was
    this.wx = w[0] - (sx - this.cx) / this.sc;
    this.wy = w[1] + (sy - this.cy) / this.sc;
    this.clampPan();
  };
  View.prototype.panBy = function (dx, dy) {
    this.wx -= dx / this.sc; this.wy += dy / this.sc;
    this.clampPan();
  };
  /* the view may not wander off the board */
  View.prototype.clampPan = function () {
    if (!this.bb) return;
    if (this.zoom <= 1.0001) { this.wx = this.bwx; this.wy = this.bwy; return; }
    var b = this.bb, hw = this.rect.w / 2 / this.sc, hh = this.rect.h / 2 / this.sc;
    var lox = Math.min(b.minx + hw, this.bwx), hix = Math.max(b.maxx - hw, this.bwx);
    var loy = Math.min(b.miny + hh, this.bwy), hiy = Math.max(b.maxy - hh, this.bwy);
    this.wx = Math.max(lox, Math.min(hix, this.wx));
    this.wy = Math.max(loy, Math.min(hiy, this.wy));
  };
  View.prototype.atMin = function () { return this.zoom <= 1.0001; };
  View.prototype.atMax = function () { return this.zoom >= this.cap / this.base - 1e-4; };

  View.prototype.w2s = function (x, y) { return [this.cx + (x - this.wx) * this.sc, this.cy - (y - this.wy) * this.sc]; };
  View.prototype.s2w = function (x, y) { return [this.wx + (x - this.cx) / this.sc, this.wy - (y - this.cy) / this.sc]; };

  /* ---------------- background ---------------- */
  View.prototype.drawBg = function (ctx) {
    if (!this.bgImg) {
      var c = document.createElement("canvas");
      c.width = this.cv.width; c.height = this.cv.height;
      var g = c.getContext("2d");
      g.fillStyle = BG; g.fillRect(0, 0, c.width, c.height);
      // soft paper: a few hundred faint rounded flecks
      var n = Math.round(c.width * c.height / 9000), seed = 7;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var i = 0; i < n; i++) {
        var s = (2 + rnd() * 5) * this.dpr;
        g.fillStyle = rnd() < 0.5 ? "rgba(214,190,150,0.10)" : "rgba(255,255,255,0.22)";
        g.save(); g.translate(rnd() * c.width, rnd() * c.height); g.rotate(rnd() * 3);
        g.beginPath(); roundRect(g, -s / 2, -s / 2, s, s, s * 0.3); g.fill(); g.restore();
      }
      var vg = g.createRadialGradient(c.width / 2, c.height * 0.45, c.height * 0.2, c.width / 2, c.height * 0.5, c.height * 0.8);
      vg.addColorStop(0, "rgba(255,255,255,0)"); vg.addColorStop(1, "rgba(190,150,100,0.10)");
      g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
      this.bgImg = c;
    }
    ctx.drawImage(this.bgImg, 0, 0);
  };

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  }

  /* ---------------- pieces ---------------- */

  /* trace a piece's tube centre line in screen space; returns false if empty */
  View.prototype.tracePath = function (ctx, p, dx, dy) {
    dx = dx || 0; dy = dy || 0;
    if (p.kind === "ring") {
      var c = this.w2s(p.cx, p.cy), r = p.R * this.sc;
      ctx.beginPath();
      if (!(p.gap > 0)) { ctx.arc(c[0] + dx, c[1] + dy, r, 0, Math.PI * 2); return true; }
      var half = p.gap * Math.PI / 360 + p.h / p.R;
      var a0 = p.ang + half, a1 = p.ang + 2 * Math.PI - half;
      if (a1 <= a0) return false;
      ctx.arc(c[0] + dx, c[1] + dy, r, -a0, -a1, true);
      return true;
    }
    var s = p.body.shapes[0];
    ctx.beginPath();
    for (var i = 0; i < s.n; i++) {
      var q = this.w2s(s.x[i], s.y[i]);
      if (i === 0) ctx.moveTo(q[0] + dx, q[1] + dy); else ctx.lineTo(q[0] + dx, q[1] + dy);
    }
    return true;
  };

  View.prototype.tube = function (ctx, p, sh, w, opts) {
    opts = opts || {};
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (opts.glow) {
      if (this.tracePath(ctx, p)) { ctx.strokeStyle = "rgba(255,236,140,0.95)"; ctx.lineWidth = w * 1.55; ctx.stroke(); }
    }
    if (this.tracePath(ctx, p)) { ctx.strokeStyle = sh.darker; ctx.lineWidth = w; ctx.stroke(); }
    if (this.tracePath(ctx, p)) { ctx.strokeStyle = opts.light ? sh.glow : sh.base; ctx.lineWidth = w * 0.78; ctx.stroke(); }
    var o = w * 0.16;
    if (this.tracePath(ctx, p, -o * 0.3, -o)) { ctx.strokeStyle = opts.light ? "rgba(255,255,255,0.55)" : sh.light; ctx.globalAlpha = 0.8; ctx.lineWidth = w * 0.2; ctx.stroke(); ctx.globalAlpha = 1; }
  };

  View.prototype.shadow = function (ctx, p, w) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (this.tracePath(ctx, p, w * 0.08, w * 0.32)) { ctx.strokeStyle = "rgba(140,96,50,0.16)"; ctx.lineWidth = w * 1.08; ctx.stroke(); }
  };

  View.prototype.polyPath = function (ctx, sh) {
    ctx.beginPath();
    for (var i = 0; i < sh.n; i++) {
      var q = this.w2s(sh.x[i], sh.y[i]);
      if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
  };

  /* a pin head: the trigger box drawn as a chunky block */
  View.prototype.head = function (ctx, grp, sh, pulse) {
    var s = grp.shapes[0];
    var cx = 0, cy = 0;
    for (var i = 0; i < s.n; i++) { cx += s.x[i]; cy += s.y[i]; }
    cx /= s.n; cy /= s.n;
    var c = this.w2s(cx, cy);
    var ax = s.x[1] - s.x[0], ay = s.y[1] - s.y[0], bx = s.x[2] - s.x[1], by = s.y[2] - s.y[1];
    var la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    var ang = -Math.atan2(ay, ax);
    var w = la * this.sc * 1.08, h = lb * this.sc * 0.74;
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
    var r = Math.min(w, h) * 0.22;
    ctx.beginPath(); roundRect(ctx, -w / 2 + 1.5, -h / 2 + 2.5, w, h, r); ctx.fillStyle = "rgba(120,80,40,0.18)"; ctx.fill();
    ctx.beginPath(); roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = sh.darker; ctx.fill();
    ctx.beginPath(); roundRect(ctx, -w / 2 + w * 0.08, -h / 2 + h * 0.1, w * 0.84, h * 0.78, r * 0.8); ctx.fillStyle = pulse ? "#ff6b5e" : sh.base; ctx.fill();
    ctx.restore();
  };

  View.prototype.stem = function (ctx, grp, sh) {
    for (var k = 0; k < grp.shapes.length; k++) {
      this.polyPath(ctx, grp.shapes[k]);
      ctx.fillStyle = sh.dark; ctx.fill();
    }
  };

  View.prototype.stop = function (ctx, grp, sh) {
    for (var k = 0; k < grp.shapes.length; k++) {
      this.polyPath(ctx, grp.shapes[k]);
      ctx.fillStyle = sh.dark; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = sh.darker; ctx.stroke();
    }
  };

  /* a Catch guide or butterfly slot: a steel clip across the rail */
  View.prototype.guide = function (ctx, s, alpha) {
    var t = s.trig.shapes[0];
    var cx = 0, cy = 0;
    for (var i = 0; i < t.n; i++) { cx += t.x[i]; cy += t.y[i]; }
    cx /= t.n; cy /= t.n;
    var c = this.w2s(cx, cy);
    var ax = t.x[1] - t.x[0], ay = t.y[1] - t.y[0];
    var ang = -Math.atan2(ay, ax);
    var L = Math.hypot(ax, ay) * this.sc, W = Math.hypot(t.x[2] - t.x[1], t.y[2] - t.y[1]) * this.sc;
    var bw = L * 1.05, bh = Math.max(W * 1.25, 0.82 * this.sc);
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(c[0], c[1]); ctx.rotate(ang);
    // tabs
    ctx.fillStyle = "#b9bec6";
    ctx.beginPath(); roundRect(ctx, -bw * 0.3, -bh / 2 - bh * 0.14, bw * 0.6, bh * 0.2, 2); ctx.fill();
    ctx.beginPath(); roundRect(ctx, -bw * 0.3, bh / 2 - bh * 0.06, bw * 0.6, bh * 0.2, 2); ctx.fill();
    var gr = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    gr.addColorStop(0, "#8f959e"); gr.addColorStop(0.3, "#f4f6f8"); gr.addColorStop(0.55, "#c9ced5"); gr.addColorStop(1, "#7f858e");
    ctx.beginPath(); roundRect(ctx, -bw / 2, -bh / 2, bw, bh, Math.min(bw, bh) * 0.22);
    ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(70,74,82,0.7)"; ctx.stroke();
    ctx.restore();
  };

  View.prototype.host = function (ctx, s) {
    var g = s.groups[0];
    for (var k = 0; k < g.shapes.length; k++) {
      this.polyPath(ctx, g.shapes[k]);
      ctx.fillStyle = "#c3c8cf"; ctx.fill(); ctx.strokeStyle = "rgba(70,74,82,0.6)"; ctx.lineWidth = 1; ctx.stroke();
    }
  };

  /* a round bomb with a lit fuse */
  View.prototype.bomb = function (ctx, x, y, t) {
    // the ball IS the trigger circle (r 0.75): what the player sees touch is what sets it off
    var c = this.w2s(x, y), r = 0.75 * this.sc;
    ctx.save(); ctx.translate(c[0], c[1]);
    ctx.beginPath(); ctx.arc(r * 0.12, r * 0.22, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(90,50,20,0.22)"; ctx.fill();
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#c46a3a"); g.addColorStop(0.6, "#8a3c1e"); g.addColorStop(1, "#5a2410");
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // star
    ctx.beginPath();
    for (var i = 0; i < 14; i++) {
      var rr = i % 2 ? r * 0.2 : r * 0.46, a = i * Math.PI / 7 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.08);
    }
    ctx.closePath(); ctx.fillStyle = "#ffd23f"; ctx.fill();
    // cap and fuse
    ctx.fillStyle = "#6b3a1c"; ctx.beginPath(); roundRect(ctx, -r * 0.28, -r * 1.12, r * 0.56, r * 0.3, 2); ctx.fill();
    ctx.strokeStyle = "#a8742c"; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -r * 1.1); ctx.quadraticCurveTo(r * 0.3, -r * 1.5, r * 0.55, -r * 1.42); ctx.stroke();
    var fl = 0.6 + 0.4 * Math.sin(t * 22);
    ctx.fillStyle = "rgba(255,220,90," + fl + ")";
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.45, r * (0.18 + 0.08 * fl), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,120,40,0.9)";
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.45, r * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  View.prototype.bombPos = function (p) {
    var s = p.bombGroup.shapes[0];
    return [s.x[0], s.y[0]];
  };

  /* chains across a locked ring and a padlock with the count */
  View.prototype.chains = function (ctx, p) {
    var c = this.w2s(p.cx, p.cy), r = (p.R + p.h) * this.sc;
    ctx.save(); ctx.translate(c[0], c[1]);
    ctx.strokeStyle = "#8d939b"; ctx.lineWidth = Math.max(2, this.sc * 0.12);
    for (var k = 0; k < 4; k++) {
      var a = Math.PI / 4 + k * Math.PI / 2;
      var n = 6;
      for (var i = 0; i < n; i++) {
        var t0 = 0.35 + i * 0.65 / n;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * t0, Math.sin(a) * r * t0, r * 0.07, r * 0.04, a + (i % 2) * Math.PI / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    var L = Math.max(20, r * 0.62);
    ctx.fillStyle = "#6f757d"; ctx.beginPath(); ctx.arc(0, -L * 0.35, L * 0.42, Math.PI, 0); ctx.lineWidth = L * 0.16; ctx.strokeStyle = "#7d838b"; ctx.stroke();
    var g = ctx.createLinearGradient(0, -L * 0.3, 0, L * 0.6);
    g.addColorStop(0, "#c9ced5"); g.addColorStop(1, "#7f858e");
    ctx.beginPath(); roundRect(ctx, -L * 0.6, -L * 0.35, L * 1.2, L * 0.95, L * 0.22); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "#3d3a44"; ctx.font = "bold " + Math.round(L * 0.62) + "px 'Lilita One', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.lock), 0, L * 0.14);
    ctx.restore();
  };

  /* ---------------- effects ---------------- */

  /* a piece bursts: chunks of its colour along its shape */
  View.prototype.burst = function (p, strong) {
    var sh = p._sh || (p._sh = shades(p.col));
    var pts = [];
    if (p.kind === "ring") {
      var n = Math.max(18, Math.round(p.R * 14));
      var half = p.gap > 0 ? p.gap * Math.PI / 360 : 0;
      for (var i = 0; i < n; i++) {
        var a = p.ang + half + (2 * Math.PI - 2 * half) * (i + Math.random()) / n;
        pts.push([p.cx + Math.cos(a) * p.R, p.cy + Math.sin(a) * p.R, Math.cos(a), Math.sin(a)]);
      }
    } else {
      var s = p.body.shapes[0];
      for (var k = 0; k < s.n - 1; k++) {
        var L = Math.hypot(s.x[k + 1] - s.x[k], s.y[k + 1] - s.y[k]), m = Math.max(1, Math.round(L * 3));
        for (var j = 0; j < m; j++) {
          var t = (j + Math.random()) / m;
          pts.push([s.x[k] + (s.x[k + 1] - s.x[k]) * t, s.y[k] + (s.y[k + 1] - s.y[k]) * t, Math.random() - 0.5, Math.random() - 0.5]);
        }
      }
    }
    var sp = strong ? 9 : 6;
    for (var q = 0; q < pts.length; q++) {
      var e = pts[q];
      for (var z = 0; z < 2; z++) {
        this.parts.push({ x: e[0], y: e[1], vx: e[2] * sp * (0.4 + Math.random()) + (Math.random() - 0.5) * 3,
          vy: e[3] * sp * (0.4 + Math.random()) + Math.random() * 5, life: 0.7 + Math.random() * 0.5, age: 0,
          size: 0.16 + Math.random() * 0.16, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
          col: Math.random() < 0.75 ? sh.base : sh.light });
      }
    }
    this.dying.push({ p: p, age: 0 });
  };

  /* a stick that slid out of its last clip keeps going the way it was pulled */
  View.prototype.flyout = function (p, dx, dy) {
    if (!p._sh) p._sh = shades(p.col);
    this.dying.push({ p: p, age: 0, fly: [dx, dy], life: 0.38 });
  };

  View.prototype.kaboom = function (x, y) {
    var cols = ["#ffd23f", "#ff8a3d", "#ff5a4a", "#fff3c4"];
    for (var i = 0; i < 46; i++) {
      var a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, age: 0,
        size: 0.12 + Math.random() * 0.2, rot: 0, vr: 0, col: cols[i % 4], round: true });
    }
    this.flash.push({ x: x, y: y, age: 0 });
  };

  /* Two hard pieces knocking together: a little star of light at the contact
     and a few hot sparks, gone in a third of a second (the owner: "a small
     flash where they meet, like two metal bars hitting"). On impact after a
     move; while the finger keeps pushing into it, at most twice a second. */
  View.prototype.clang = function (game, p, moved) {
    var since = this.t - (this.clangT == null ? -9 : this.clangT);
    if (since < 0.08 || (!(moved > 1e-4) && since < 0.45)) return;
    var c = contact(game, p);
    if (!c) return;
    this.clangT = this.t;
    this.clangs.push({ x: c[0], y: c[1], age: 0 });
    var cols = ["#ffffff", "#fff3b0", "#ffd23f", "#ffb347"];
    for (var i = 0; i < 9; i++) {
      var a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 6;
      this.parts.push({ x: c[0], y: c[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.16 + Math.random() * 0.16, age: 0,
        size: 0.07 + Math.random() * 0.06, rot: 0, vr: 0, col: cols[i % 4], round: true });
    }
  };

  View.prototype.say = function (text, x, y, col) {
    this.texts.push({ text: text, x: x, y: y, age: 0, col: col || "#5bcf3c" });
  };

  View.prototype.tick = function (dt) {
    this.t += dt;
    var g = 14;
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var q = this.parts[i];
      q.age += dt;
      if (q.age > q.life) { this.parts.splice(i, 1); continue; }
      q.vy -= g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      q.vx *= 0.985;
    }
    for (i = this.texts.length - 1; i >= 0; i--) { this.texts[i].age += dt; if (this.texts[i].age > 1.1) this.texts.splice(i, 1); }
    for (i = this.dying.length - 1; i >= 0; i--) { this.dying[i].age += dt; if (this.dying[i].age > (this.dying[i].life || 0.22)) this.dying.splice(i, 1); }
    for (i = this.flash.length - 1; i >= 0; i--) { this.flash[i].age += dt; if (this.flash[i].age > 0.35) this.flash.splice(i, 1); }
    for (i = this.clangs.length - 1; i >= 0; i--) { this.clangs[i].age += dt; if (this.clangs[i].age > 0.28) this.clangs.splice(i, 1); }
    for (i = this.rockets.length - 1; i >= 0; i--) {
      var r = this.rockets[i];
      r.age += dt;
      if (r.age >= r.dur) { this.rockets.splice(i, 1); if (r.done) r.done(); }
    }
  };
  View.prototype.busy = function () { return this.parts.length > 0 || this.dying.length > 0 || this.rockets.length > 0; };

  /* a firework flying from a screen point to a world point */
  View.prototype.rocket = function (fromS, toW, done) {
    this.rockets.push({ from: fromS, to: toW, age: 0, dur: 0.55, done: done });
  };

  /* ---------------- the frame ---------------- */

  View.prototype.draw = function (game, ui) {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBg(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!game) return;
    ui = ui || {};
    var self = this, t = this.t;
    var pieces = game.pieces.filter(function (p) { return !p.removed; });
    var w = function (p) { return 2 * p.h * self.sc * TUBE; };
    pieces.forEach(function (p) { if (!p._sh) p._sh = shades(p.col); });

    ctx.save();
    // appear: everything grows in from the board centre
    if (ui.appear != null && ui.appear < 1) {
      var e = 1 - Math.pow(1 - ui.appear, 3);
      ctx.globalAlpha = Math.min(1, ui.appear * 2);
      ctx.translate(this.cx, this.cy); ctx.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e); ctx.translate(-this.cx, -this.cy);
    }
    var shake = function (p) {
      if (ui.shake && ui.shake.p === p) {
        var k = ui.shake.t;
        return Math.sin(k * 60) * 4 * Math.max(0, 1 - k / 0.35);
      }
      return 0;
    };

    // dying pieces: a quick swell and fade
    this.dying.forEach(function (d) {
      var p = d.p, k = d.age / (d.life || 0.22);
      if (d.fly) {
        var e = k * k, dist = e * 9 * self.sc;
        ctx.save(); ctx.globalAlpha *= 1 - k * k;
        ctx.translate(d.fly[0] * dist, -d.fly[1] * dist);
        self.shadow(ctx, p, w(p));
        self.tube(ctx, p, p._sh, w(p));
        ctx.restore();
        return;
      }
      ctx.save(); ctx.globalAlpha *= 1 - k;
      var c = p.kind === "ring" ? self.w2s(p.cx, p.cy) : self.w2s(p.body.shapes[0].x[0], p.body.shapes[0].y[0]);
      ctx.translate(c[0], c[1]); ctx.scale(1 + k * 0.25, 1 + k * 0.25); ctx.translate(-c[0], -c[1]);
      self.tube(ctx, p, p._sh || shades(p.col), w(p), { light: true });
      ctx.restore();
    });

    // shadows, then bodies (rings first, sticks over them)
    pieces.forEach(function (p) { self.shadow(ctx, p, w(p)); });
    var draw = function (p) {
      var dx = shake(p);
      if (dx) { ctx.save(); ctx.translate(dx, 0); }
      var sel = ui.drag === p, hammer = ui.hammer;
      self.tube(ctx, p, p._sh, w(p), { glow: sel || (hammer && Math.sin(t * 8) > 0), light: sel });
      if (dx) ctx.restore();
    };
    pieces.forEach(function (p) { if (p.kind === "ring") draw(p); });
    pieces.forEach(function (p) {
      if (p.kind !== "ring") return;
      var dx = shake(p);
      if (dx) { ctx.save(); ctx.translate(dx, 0); }
      for (var i = 0; i < p.pins.length; i++) if (p.pins[i].stem) self.stem(ctx, p.pins[i].stem, p._sh);
      for (i = 0; i < p.stops.length; i++) self.stop(ctx, p.stops[i], p._sh);
      if (dx) ctx.restore();
    });
    pieces.forEach(function (p) { if (p.kind === "stick") draw(p); });
    // statics
    game.statics.forEach(function (s) {
      if (s.removed) return;
      if (s.kind === "host") self.host(ctx, s);
    });
    game.statics.forEach(function (s) {
      if (s.removed) return;
      if (s.kind === "guide") self.guide(ctx, s);
      else if (s.kind === "bomb") self.bomb(ctx, s.x, s.y, t);
    });
    // heads sit on top of the tubes they clamp
    pieces.forEach(function (p) {
      if (p.kind !== "ring") return;
      var dx = shake(p);
      if (dx) { ctx.save(); ctx.translate(dx, 0); }
      for (var i = 0; i < p.pins.length; i++) {
        var pin = p.pins[i];
        if (!pin.trig) continue;
        var pulse = ui.shake && ui.shake.p === p && pin.clamp && pin.clamp.active && Math.sin(ui.shake.t * 30) > 0;
        self.head(ctx, pin.trig, p._sh, pulse);
      }
      if (dx) ctx.restore();
    });
    pieces.forEach(function (p) {
      if (p.bombGroup) { var b = self.bombPos(p); self.bomb(ctx, b[0], b[1], t); }
      if (p.lock > 0) self.chains(ctx, p);
    });
    ctx.restore();

    // flashes
    this.flash.forEach(function (f) {
      var c = self.w2s(f.x, f.y), k = f.age / 0.35;
      var g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], self.sc * (1.2 + 3 * k));
      g.addColorStop(0, "rgba(255,250,210," + (0.9 * (1 - k)) + ")"); g.addColorStop(1, "rgba(255,180,80,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], self.sc * (1.2 + 3 * k), 0, Math.PI * 2); ctx.fill();
    });
    // particles
    this.parts.forEach(function (q) {
      var c = self.w2s(q.x, q.y), s = q.size * self.sc, a = 1 - q.age / q.life;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.fillStyle = q.col;
      if (q.round) { ctx.beginPath(); ctx.arc(c[0], c[1], s * 0.6, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(q.rot); ctx.beginPath(); roundRect(ctx, -s / 2, -s / 2, s, s * 0.8, s * 0.25); ctx.fill(); ctx.restore(); }
    });
    ctx.globalAlpha = 1;
    // clangs: a four-point star of light, white at the heart
    this.clangs.forEach(function (k) {
      var c = self.w2s(k.x, k.y), f = k.age / 0.28, s = self.sc * 0.8 * (f < 0.25 ? f / 0.25 : 1 - (f - 0.25) / 0.75);
      if (s <= 0) return;
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(f * 1.2); ctx.globalAlpha = 1 - f * f;
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,240,170,.9)"); g.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      for (var q = 0; q < 8; q++) { var rr = q % 2 ? s * 0.22 : s, aa = q * Math.PI / 4; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    // rockets
    this.rockets.forEach(function (r) {
      var k = r.age / r.dur, e = k * k * (3 - 2 * k);
      var to = self.w2s(r.to[0], r.to[1]);
      var x = r.from[0] + (to[0] - r.from[0]) * e, y = r.from[1] + (to[1] - r.from[1]) * e - Math.sin(k * Math.PI) * 80;
      var nx = r.from[0] + (to[0] - r.from[0]) * Math.min(1, e + 0.05), ny = r.from[1] + (to[1] - r.from[1]) * Math.min(1, e + 0.05) - Math.sin(Math.min(1, k + 0.05) * Math.PI) * 80;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(ny - y, nx - x));
      ctx.fillStyle = "#ffcf4a"; ctx.beginPath(); ctx.arc(-14, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#9b59e8"; ctx.beginPath(); roundRect(ctx, -10, -6, 20, 12, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-4, -6, 3, 12); ctx.fillRect(3, -6, 3, 12);
      ctx.fillStyle = "#c3a0ff"; ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(18, 0); ctx.lineTo(10, 6); ctx.fill();
      ctx.restore();
    });
    // words
    this.texts.forEach(function (tx) {
      var c = self.w2s(tx.x, tx.y), k = tx.age / 1.1;
      var y = c[1] - 40 * k - 10, s = Math.round(26 + 10 * Math.min(1, k * 6) - 6 * k);
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      ctx.font = s + "px 'Lilita One', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.lineJoin = "round"; ctx.strokeText(tx.text, c[0], y);
      ctx.fillStyle = tx.col; ctx.fillText(tx.text, c[0], y);
    });
    ctx.globalAlpha = 1;
  };

  return { View: View, shades: shades, contact: contact };
})();

if (typeof module !== "undefined") module.exports = RRView;
