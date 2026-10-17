/* Rotate Ring - the 3D view, after Seat Jam's 3D room (seatawayO/src/render3d.js).

   Same contract as RRView.View in render.js, so game.js cannot tell the two
   apart: resize fit zoomAt panBy clampPan canZoom atMin atMax w2s s2w burst
   flyout kaboom say rocket tick busy draw, and the fields parts texts dying sc cx.
   It only DRAWS: every pose is read off the engine each frame, nothing is
   written back, and the rules never learn there is a camera.

   The look is Seat Jam's: soft shadows from one key light and the pieces
   finished like candy (clearcoat over a studio reflection). No filmic curve: a
   colour renders as the colour the level gives it.
   ⚠ Straight down, and no board: the owner (2026-10-17), after a first cut
   that stood the lens at 56 degrees over a tray on a plinth - "the view is
   straight from the top", "no need for the board in the middle". The pieces
   lie on the ground itself; the depth is in the light, the gloss and the
   shadows, not in the angle. ?elev= and ?fov= still try others on a screen.

   Layers, as the 2D draw stacks them: rings and bars lie on the floor, a pin's
   stem runs at mid-tube height, its head is a block sitting ON the other tube,
   a steel clip straddles its bar. Nothing passes through anything (engine.js),
   so two tubes never cross here either.

   #cv stays on top: it takes the pointer and carries the 2D overlay (praise
   words, the firework's flight). The WebGL canvas goes underneath it.

   ⚠ w2s / s2w work on the plane at tube-centre height (pickY), not the floor:
   a finger on a tube must land on the tube's centre line, or the ring a player
   touches is not the ring the engine picks.                                    */

var RRView3D = (function () {
  "use strict";
  if (typeof THREE === "undefined" || typeof document === "undefined") return null;

  var Q = (function () { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(""); } })();
  function num(k, lo, hi, d) { var v = parseFloat(Q.get(k)); return v >= lo && v <= hi ? v : d; }

  /* The lens: straight down (90), a real perspective so a tube's sides show a
     little towards the screen's edges. Seat Jam stands at 68 degrees; this
     game stood at 56 for one build and the owner asked for the top view. */
  var ELEV = num("elev", 35, 90, 90) * Math.PI / 180, SIN_E = Math.sin(ELEV), COS_E = Math.cos(ELEV);
  var FOV = num("fov", 10, 70, 30), TANF = Math.tan(FOV * Math.PI / 360);
  // the drawn tube is a little fatter than the collider, as in render.js
  var TUBE = 1.15;
  // the zoom ceiling, both axes (UI_UX_RULES 5.2b), as in render.js
  var UNIT_W = 0.047, UNIT_H = 0.024;
  // where the key light comes from: upper left, a little behind, so every
  // shadow falls right and down the screen
  var KEY_DIR = new THREE.Vector3(-0.5, 1, -0.3).normalize();

  /* Four grounds, five levels each, in turn - Seat Jam's rooms rotate the same
     way. The pieces lie on the ground itself, so every ground is a LIGHT tint
     that all seven ring colours stand out of: the lawn and sky of the first
     cut would have swallowed the green and the cyan rings. */
  var THEMES = [
    { ground: "#f6ead6", dot: "#efdfc4" },   // cream, the original's paper
    { ground: "#e3eefa", dot: "#d5e3f4" },   // pale sky
    { ground: "#efe7f9", dot: "#e4d9f3" },   // pale lilac
    { ground: "#e6f2df", dot: "#d8e9cf" },   // pale mint
  ];

  /* "Ring Twist", the title on Home: every letter's outline out of Nunito at its
     heaviest, in font units (1000 to the em, y up), placed and coloured. Written
     by tools/title_art.py - change the letters there and run it. */
  var TITLE = /*title*/{
  box: [-1338, -917, 1338, 772],
  letters: [
    { ch: "R", c: "#dd433e", x: -1120.5, y: 0, d: "M165 -10Q113 -10 85 18.5Q57 47 57 99L57 596Q57 649 85.5 677Q114 705 166 705L415 705Q537 705 603.5 644.5Q670 584 670 479Q670 410 640 359.5Q610 309 553.5 281.5Q497 254 415 254L422 273L479 273Q523 273 557 252.5Q591 232 613 191L648 128Q667 94 665.5 62.5Q664 31 640.5 10.5Q617 -10 570 -10Q525 -10 496 8.5Q467 27 445 67L359 224Q351 239 336 245.5Q321 252 305 252L272 252L272 99Q272 47 245 18.5Q218 -10 165 -10ZM272 402L375 402Q419 402 442.5 419Q466 436 466 472Q466 507 442.5 524Q419 541 375 541L272 541Z" },
    { ch: "i", c: "#ec8f2e", x: -416.5, y: 0, d: "M148 -10Q98 -10 71 19Q44 48 44 103L44 391Q44 446 71 475Q98 504 148 504Q198 504 225 475Q252 446 252 391L252 103Q252 48 225.5 19Q199 -10 148 -10Z" },
    { ch: "n", c: "#6ac53e", x: -134.5, y: 0, d: "M148 -10Q98 -10 71 17Q44 44 44 95L44 399Q44 450 70.5 477Q97 504 146 504Q195 504 221 477Q247 450 247 399L247 365L236 415Q261 458 304.5 482Q348 506 403 506Q462 506 500 482.5Q538 459 557 410.5Q576 362 576 287L576 95Q576 44 549 17Q522 -10 472 -10Q422 -10 395 17Q368 44 368 95L368 279Q368 317 356 332.5Q344 348 322 348Q291 348 271.5 327.5Q252 307 252 272L252 95Q252 -10 148 -10Z" },
    { ch: "g", c: "#32afdd", x: 469.5, y: 0, d: "M297 -192Q242 -192 195.5 -185.5Q149 -179 117 -169Q83 -159 68 -137.5Q53 -116 52.5 -91.5Q52 -67 63.5 -46.5Q75 -26 95.5 -16Q116 -6 141 -15Q185 -30 219 -35Q253 -40 276 -40Q335 -40 363.5 -18.5Q392 3 392 52L392 99L400 99Q384 62 339 37.5Q294 13 243 13Q178 13 128.5 43.5Q79 74 51.5 129.5Q24 185 24 259Q24 315 40 360.5Q56 406 85 438.5Q114 471 154 488.5Q194 506 243 506Q296 506 339.5 482Q383 458 398 421L389 371L389 399Q389 450 416 477Q443 504 492 504Q542 504 568 477Q594 450 594 399L594 75Q594 -58 517 -125Q440 -192 297 -192ZM311 165Q335 165 352.5 176Q370 187 379.5 208Q389 229 389 259Q389 305 367.5 329.5Q346 354 311 354Q288 354 270 343Q252 332 242.5 311Q233 290 233 259Q233 213 254.5 189Q276 165 311 165Z" },
    { ch: "T", c: "#4e77dd", x: -1335, y: -905, d: "M329 -10Q277 -10 249 18.5Q221 47 221 99L221 531L85 531Q42 531 19.5 553.5Q-3 576 -3 618Q-3 660 19.5 682.5Q42 705 85 705L572 705Q615 705 637.5 682.5Q660 660 660 618Q660 576 637.5 553.5Q615 531 572 531L436 531L436 99Q436 47 409 18.5Q382 -10 329 -10Z" },
    { ch: "w", c: "#984be0", x: -744, y: -905, d: "M273 -10Q233 -10 204.5 9Q176 28 159 68L27 373Q12 408 16.5 437.5Q21 467 44.5 485.5Q68 504 111 504Q146 504 169.5 487Q193 470 212 421L295 215L274 215L362 445Q373 475 392.5 489.5Q412 504 443 504Q475 504 494 489Q513 474 524 445L613 215L597 215L679 428Q696 472 722 488Q748 504 776 504Q815 504 836 485.5Q857 467 860 437Q863 407 848 372L718 69Q701 29 672.5 9.5Q644 -10 604 -10Q564 -10 536 9.5Q508 29 491 69L393 304L475 304L384 71Q368 30 340.5 10Q313 -10 273 -10Z" },
    { ch: "i", c: "#dd433e", x: 119, y: -905, d: "M148 -10Q98 -10 71 19Q44 48 44 103L44 391Q44 446 71 475Q98 504 148 504Q198 504 225 475Q252 446 252 391L252 103Q252 48 225.5 19Q199 -10 148 -10Z" },
    { ch: "s", c: "#ec8f2e", x: 401, y: -905, d: "M251 -12Q205 -12 161.5 -6.5Q118 -1 81 12Q51 22 38 41.5Q25 61 25 83Q25 105 36.5 123.5Q48 142 68 150.5Q88 159 114 151Q156 138 189 132Q222 126 251 126Q282 126 294 133.5Q306 141 306 152Q306 163 298 168Q290 173 278 174L161 192Q99 202 64 237.5Q29 273 29 331Q29 385 60 424Q91 463 145.5 484.5Q200 506 270 506Q316 506 352 500.5Q388 495 423 481Q448 471 459 452Q470 433 468.5 411Q467 389 455.5 371Q444 353 423.5 345.5Q403 338 376 347Q342 358 318 363Q294 368 274 368Q237 368 224 360.5Q211 353 211 342Q211 335 217.5 329Q224 323 237 321L354 303Q418 293 453 259Q488 225 488 166Q488 81 423 34.5Q358 -12 251 -12Z" },
    { ch: "t", c: "#6ac53e", x: 888, y: -905, d: "M322 -12Q242 -12 190 12Q138 36 112.5 84.5Q87 133 87 207L87 342L64 342Q27 342 6.5 361.5Q-14 381 -14 418Q-14 455 6.5 474.5Q27 494 64 494L87 494L87 540Q87 591 114 618Q141 645 191 645Q241 645 268 618Q295 591 295 540L295 494L363 494Q401 494 421 474.5Q441 455 441 418Q441 381 421 361.5Q401 342 363 342L295 342L295 212Q295 182 310.5 168Q326 154 359 154Q371 154 384 157Q397 160 409 160Q427 161 438.5 149Q450 137 450 94Q450 59 439.5 35.5Q429 12 402 1Q387 -5 361.5 -8.5Q336 -12 322 -12Z" }
  ],
  dots: [{ x: -268.5, y: 659, r: 113, c: "#ec8f2e" }, { x: 267, y: -246, r: 113, c: "#dd433e" }]
  }/*/title*/;

  var V = new THREE.Vector3(), NDC = new THREE.Vector2(), RAY = new THREE.Raycaster();
  var PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), HIT = new THREE.Vector3();
  var DUMMY = new THREE.Object3D(), COL = new THREE.Color();
  var GLOW = new THREE.Color("#ffe39a"), WHITE_E = new THREE.Color("#ffffff"), BLACK = new THREE.Color(0);

  /* ---------------- colour ---------------- */
  function rgb(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mixc(c, to, t) {
    var a = rgb(c), o = "#";
    for (var i = 0; i < 3; i++) { var v = Math.round(a[i] + (to[i] - a[i]) * t); o += (v < 16 ? "0" : "") + v.toString(16); }
    return o;
  }
  var INK = [20, 10, 30], WHITE = [255, 255, 255];
  // the 2D draw's shades: the stem is `dark`, the head a block of `dark` with a light top
  function tones(col) { return { base: col, dark: mixc(col, INK, 0.28), darker: mixc(col, INK, 0.42), light: mixc(col, WHITE, 0.42), top: mixc(col, WHITE, 0.12) }; }

  /* ---------------- geometry ---------------- */
  function rrPath(p, w, d, r) {         // a centred rounded rectangle traced into a Shape or Path
    r = Math.max(0.001, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
    var x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
    p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0);
    p.lineTo(x1, y1 - r); p.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2);
    p.lineTo(x0 + r, y1); p.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI);
    p.lineTo(x0, y0 + r); p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5);
    return p;
  }
  /* A Shape drawn in ENGINE coordinates (x right, y up the board), extruded
     UP from y0 to y1. rotateX(-90deg) sends (x, y, z) to (x, z, -y): the
     engine's (x, y) lands on the board at (x, -y) and the extrusion stands up. */
  function slab(shape, y0, y1, bevel, curve) {
    var b = bevel || 0, depth = Math.max(0.001, y1 - y0 - 2 * b);
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
      bevelSegments: b > 0 ? 2 : 0, curveSegments: curve || 5, steps: 1 });
    g.translate(0, 0, b); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
    return g;
  }
  // a rounded box, w across (engine x), d deep (engine y), from y0 up to y1
  function rbox(w, d, y0, y1, r, bevel) {
    var b = Math.min(bevel, w / 2 - 0.01, d / 2 - 0.01, (y1 - y0) / 2 - 0.001);
    b = Math.max(0, b);
    return slab(rrPath(new THREE.Shape(), w - 2 * b, d - 2 * b, Math.max(0.001, r - b)), y0, y1, b, 4);
  }
  function polyShape(s) {               // an engine polygon, local points
    var pts = [];
    for (var i = 0; i < s.n; i++) pts.push(new THREE.Vector2(s.lx[i], s.ly[i]));
    return new THREE.Shape(pts);
  }
  function centroid(s) {
    var x = 0, y = 0;
    for (var i = 0; i < s.n; i++) { x += s.lx[i]; y += s.ly[i]; }
    return [x / s.n, y / s.n];
  }
  /* Many parts, one mesh: one draw call per piece, the colours in the vertices.
     Indexed, so a torus stays a torus-sized buffer. parts: [[geometry, "#hex"]] */
  function merge(parts) {
    var nv = 0, ni = 0;
    parts.forEach(function (q) { var g = q[0]; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), vo = 0, io = 0;
    parts.forEach(function (q) {
      var g = q[0], n = g.attributes.position.count, i;
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      COL.set(q[1] || "#ffffff");
      for (i = 0; i < n; i++) { col[(vo + i) * 3] = COL.r; col[(vo + i) * 3 + 1] = COL.g; col[(vo + i) * 3 + 2] = COL.b; }
      if (g.index) { var a = g.index.array; for (i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
      else { for (i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
      vo += n; g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function mesh(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }

  /* ---------------- materials ----------------
     Candy, as Seat Jam's seats: a wet clearcoat over the colour and a studio
     to reflect in it. One material per piece, so a piece can glow while it is
     held and fade on its own while it breaks. */
  function candy(o) {
    return new THREE.MeshPhysicalMaterial(Object.assign({ color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0,
      clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.55 }, o || {}));
  }
  function steel(o) {
    return new THREE.MeshPhysicalMaterial(Object.assign({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.65,
      clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 1.0 }, o || {}));
  }

  function gradTex(stops) {
    var c = document.createElement("canvas"); c.width = 8; c.height = 256;
    var x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 256);
    stops.forEach(function (st) { g.addColorStop(st[0], st[1]); });
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  /* Seat Jam's studio: a bright sky over a grey floor and two soft lamps, only
     ever seen in the gloss. It is what puts the sheen along a tube. */
  function studioEnv(renderer) {
    var pm = new THREE.PMREMGenerator(renderer), sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({
      map: gradTex([[0, "#ffffff"], [0.45, "#dfe7f0"], [0.62, "#b4bdc7"], [1, "#5c6670"]]), side: THREE.BackSide })));
    [[-8, 16, -5, 9], [9, 7, 8, 5]].forEach(function (l) {
      var lamp = new THREE.Mesh(new THREE.PlaneGeometry(l[3], l[3]), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.position.set(l[0], l[1], l[2]); lamp.lookAt(0, 0, 0); sc.add(lamp);
    });
    var t = pm.fromScene(sc, 0.04).texture;
    pm.dispose();
    return t;
  }
  /* the ground: its colour with a soft dot, like a play mat */
  function groundTex(th) {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var x = c.getContext("2d");
    x.fillStyle = th.ground; x.fillRect(0, 0, 128, 128);
    x.fillStyle = th.dot;
    [[32, 32], [96, 96]].forEach(function (p) { x.beginPath(); x.arc(p[0], p[1], 12, 0, Math.PI * 2); x.fill(); });
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }

  /* ---------------- the view ---------------- */
  function View(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = 1; this.h = 1; this.dpr = 1;
    this.sc = 20; this.base = 20; this.cap = 20; this.zoom = 1;
    this.cx = 0; this.cy = 0; this.rcx = 0; this.rcy = 0; this.rect = null;
    this.tgt = [0, 0]; this.t0 = [0, 0]; this.baseD = 30; this.pickY = 0.29;
    this.parts = []; this.texts = []; this.dying = []; this.rockets = []; this.flash = []; this.clangs = [];
    this.t = 0;
    this.cur = null; this.statObjs = []; this.sparks3 = []; this.themeIx = -1; this.stageKey = "";

    // ⚠ throws when the browser has no WebGL; game.js falls back to the 2D view
    var r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.LinearToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.setAttribute("aria-hidden", "true");
    r.domElement.id = "gl";
    canvas.parentNode.insertBefore(r.domElement, canvas);
    this.gl = r;

    var sc = this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.3, 2000);
    sc.environment = studioEnv(r);
    /* The light sums to about white on a face that looks up at the key and to
       about a third on one that looks at the lens: every tube has a lit top
       and a shaded front, which is most of what makes it read as round. */
    sc.add(new THREE.HemisphereLight(0xffffff, 0xa89a86, 0.4));
    var key = this.key = new THREE.DirectionalLight(0xfff3e2, 0.64);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    sc.add(key); sc.add(key.target);
    var fill = new THREE.DirectionalLight(0xdfe9ff, 0.14);
    fill.position.set(6, 5, 10); sc.add(fill);
    // ⚠ always in the scene, dark until something goes off: adding a light later
    // recompiles every shader in the middle of the explosion
    this.boomLight = new THREE.PointLight(0xffb048, 0, 10, 1.4);
    sc.add(this.boomLight);

    // the ground the pieces lie on: its colour exactly, unlit, with the shadows laid over it
    this.groundMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2; sc.add(this.ground);
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.2 }));
    this.catcher.rotation.x = -Math.PI / 2; this.catcher.receiveShadow = true; sc.add(this.catcher);
    this.piecesG = new THREE.Group(); sc.add(this.piecesG);
    this.steelMat = steel(); this.hostMat = candy({ vertexColors: false, color: "#c3c8cf", clearcoat: 0.2, roughness: 0.5 });
    this.bombMat = candy(); this.sparkMat = new THREE.MeshBasicMaterial({ color: "#ffdc5a", toneMapped: false });
    this.sparkCore = new THREE.MeshBasicMaterial({ color: "#ff7a28", toneMapped: false });

    // effects: chunks and sparks drawn instanced, a few flash discs reused
    var MAXP = 900;
    this.chunks = new THREE.InstancedMesh(rbox(1, 0.8, -0.4, 0.4, 0.25, 0.12), new THREE.MeshStandardMaterial({ roughness: 0.4, envMapIntensity: 0.5 }), MAXP);
    this.sparkI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
    [this.chunks, this.sparkI].forEach(function (m) {
      for (var i = 0; i < MAXP; i++) m.setColorAt(i, COL.set("#ffffff"));
      m.count = 0; m.frustumCulled = false; sc.add(m);
    });
    this.chunks.castShadow = true;
    this.discs = [];
    for (var k = 0; k < 4; k++) {
      var disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, depthWrite: false, toneMapped: false }));
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: "#ff9a3d", transparent: true, depthWrite: false, toneMapped: false }));
      disc.rotation.x = ring.rotation.x = -Math.PI / 2;
      disc.visible = ring.visible = false; disc.renderOrder = ring.renderOrder = 5;
      sc.add(disc); sc.add(ring); this.discs.push([disc, ring]);
    }
    // the clang's star: a few sprites reused, drawn over everything at the contact
    var st = document.createElement("canvas"); st.width = st.height = 128;
    var sx = st.getContext("2d"), sg = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sg.addColorStop(0, "rgba(255,255,255,1)"); sg.addColorStop(0.3, "rgba(255,244,190,.95)"); sg.addColorStop(1, "rgba(255,200,80,0)");
    sx.fillStyle = sg; sx.beginPath();
    for (var q = 0; q < 8; q++) { var rr = q % 2 ? 14 : 64, aa = q * Math.PI / 4; sx.lineTo(64 + Math.cos(aa) * rr, 64 + Math.sin(aa) * rr); }
    sx.closePath(); sx.fill();
    var stex = new THREE.CanvasTexture(st); stex.encoding = THREE.sRGBEncoding;
    this.stars = [];
    for (var m = 0; m < 4; m++) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sp.visible = false; sp.renderOrder = 6; sc.add(sp); this.stars.push(sp);
    }
    this.setTheme(1);
  }

  View.prototype.setTheme = function (level) {
    var ix = Math.floor(Math.max(0, (level | 0) - 1) / 5) % THEMES.length;
    if (ix === this.themeIx) return;
    this.themeIx = ix;
    var th = this.th = THEMES[ix];
    if (this.groundMat.map) this.groundMat.map.dispose();
    this.groundMat.map = groundTex(th); this.groundMat.needsUpdate = true;
    this.gl.setClearColor(th.ground, 1);
    this.gl.domElement.style.background = th.ground;
    this.stageKey = "";
    try {
      document.documentElement.style.setProperty("--ground", th.ground);
      var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", th.ground);
    } catch (e) { /* no DOM to tell */ }
  };

  View.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + "px"; this.cv.style.height = h + "px";
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h);
    this.cam.aspect = w / Math.max(1, h);
  };

  /* ---------------- camera ---------------- */
  View.prototype.scAt = function (D) { return this.h / (2 * D * TANF); };      // px per world unit at the target
  View.prototype.distFor = function (sc) { return this.h / (2 * Math.max(1e-3, sc) * TANF); };
  View.prototype.place = function (tx, ty, D) {
    var c = this.cam;
    c.position.set(tx, D * SIN_E, -ty + D * COS_E);
    // the screen's up is the board's far side, at any height - straight down too
    c.up.set(0, COS_E, -SIN_E);
    c.lookAt(tx, 0, -ty);
    c.updateMatrixWorld();
  };
  /* The camera looks at the middle of the FREE band, not of the screen: the
     view offset slides the picture so its centre lands on the band's. */
  View.prototype.offset = function (shx) {
    this.cam.setViewOffset(this.w, this.h, this.w / 2 - (this.rcx + (shx || 0)), this.h / 2 - this.rcy, this.w, this.h);
    this.cam.updateProjectionMatrix();
  };
  View.prototype.apply = function () {
    this.sc = this.base * this.zoom;
    this.place(this.tgt[0], this.tgt[1], this.baseD / this.zoom);
    this.offset(this.cx - this.rcx);
  };
  View.prototype.proj = function (x, y, z) {
    V.set(x, y, z).project(this.cam);
    return [(V.x + 1) / 2 * this.w, (1 - V.y) / 2 * this.h];
  };
  View.prototype.w2s = function (x, y) { return this.proj(x, this.pickY, -y); };
  View.prototype.s2wAt = function (sx, sy, Y) {
    NDC.set(sx / this.w * 2 - 1, 1 - sy / this.h * 2);
    RAY.setFromCamera(NDC, this.cam);
    PLANE.constant = -Y;
    if (!RAY.ray.intersectPlane(PLANE, HIT)) return [this.tgt[0], this.tgt[1]];
    return [HIT.x, -HIT.z];
  };
  View.prototype.s2w = function (sx, sy) { return this.s2wAt(sx, sy, this.pickY); };

  /* fit the board into the free rectangle (css px) between the bars */
  View.prototype.fit = function (game, rect) {
    var b = game.bounds();
    if (!isFinite(b.minx)) b = { minx: -2, maxx: 2, miny: -2, maxy: 2 };
    var RT = 0.29;
    game.pieces.forEach(function (p) { RT = Math.max(RT, p.h * TUBE); });
    this.RT = RT; this.pickY = RT;
    this.rect = rect; this.rcx = rect.x + rect.w / 2; this.rcy = rect.y + rect.h / 2;
    this.cx = this.rcx; this.cy = this.rcy;
    this.cam.aspect = this.w / Math.max(1, this.h);
    this.offset(0);
    var bw = Math.max(1, b.maxx - b.minx), bh = Math.max(1, b.maxy - b.miny);
    var pad = 14, aw = Math.max(40, rect.w - 2 * pad), ah = Math.max(40, rect.h - 2 * pad);
    var top = 2 * RT + 0.25;
    var tx = (b.minx + b.maxx) / 2, ty = (b.miny + b.maxy) / 2;
    var D = this.distFor(Math.min(aw / bw, ah / (bh * SIN_E)));
    /* Fitted by iteration: under a lens what stands up swells and, from an
       angle, the far side shrinks - so the board is measured as drawn, its
       corners at floor and at head height, and the distance and the aim
       adjusted until it sits square in the band. */
    for (var it = 0; it < 12; it++) {
      this.place(tx, ty, D);
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (var i = 0; i < 8; i++) {
        var s = this.proj(i & 1 ? b.maxx : b.minx, i & 4 ? top : 0, -(i & 2 ? b.maxy : b.miny));
        if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0]; if (s[1] < y0) y0 = s[1]; if (s[1] > y1) y1 = s[1];
      }
      var sc = this.scAt(D);
      tx += ((x0 + x1) / 2 - this.rcx) / sc;
      ty -= ((y0 + y1) / 2 - this.rcy) / (sc * SIN_E);
      D *= Math.max(0.5, Math.min(2, Math.max((x1 - x0) / aw, (y1 - y0) / ah)));
    }
    var cap = Math.min(this.w * UNIT_W * 1.25, Math.max(this.h * UNIT_H * 1.25, 14));
    cap = Math.max(cap, Math.min(this.w, this.h) * 0.045);
    this.baseD = Math.max(D, this.distFor(cap));
    this.base = this.scAt(this.baseD);
    this.cap = Math.max(this.base, cap);
    this.zoom = 1;
    this.t0 = [tx, ty]; this.tgt = [tx, ty];
    this.bwx = tx; this.bwy = ty; this.bb = b;
    this.apply();
    this.stage(b);
  };

  /* ---------------- zoom ----------------
     UI_UX_RULES 2.11: every way of zooming goes through zoomAt. The floor is
     the fitted board, the ceiling the size a small board is shown at anyway. */
  /* ⚠ No zoom: the owner (2026-10-17), "bỏ cái phóng to thu nhỏ đi". With
     canZoom false game.js never shows the two buttons, and pinch, wheel and
     panning never start. The code stays, dormant (UI_UX_RULES 2.4): the
     largest boards are small on a phone, and this is the one switch back. */
  View.prototype.canZoom = function () { return false; };
  View.prototype.zoomAt = function (factor, sx, sy) {
    if (!this.canZoom()) return;
    var z = Math.max(1, Math.min(this.cap / this.base, this.zoom * factor));
    if (sx == null) { sx = this.rcx; sy = this.rcy; }
    var w0 = this.s2w(sx, sy);
    this.zoom = z; this.apply();
    // keep the world point under the finger where it was
    var w1 = this.s2w(sx, sy);
    this.tgt[0] += w0[0] - w1[0]; this.tgt[1] += w0[1] - w1[1];
    this.clampPan(); this.apply();
  };
  View.prototype.panBy = function (dx, dy) {
    var a = this.s2w(this.rcx, this.rcy), c = this.s2w(this.rcx + dx, this.rcy + dy);
    this.tgt[0] -= c[0] - a[0]; this.tgt[1] -= c[1] - a[1];
    this.clampPan(); this.apply();
  };
  View.prototype.clampPan = function () {
    if (!this.bb) return;
    if (this.zoom <= 1.0001) { this.tgt = this.t0.slice(); return; }
    var b = this.bb, hw = this.rect.w / 2 / this.sc, hh = this.rect.h / 2 / (this.sc * SIN_E);
    var lox = Math.min(b.minx + hw, this.t0[0]), hix = Math.max(b.maxx - hw, this.t0[0]);
    var loy = Math.min(b.miny + hh, this.t0[1]), hiy = Math.max(b.maxy - hh, this.t0[1]);
    this.tgt[0] = Math.max(lox, Math.min(hix, this.tgt[0]));
    this.tgt[1] = Math.max(loy, Math.min(hiy, this.tgt[1]));
  };
  View.prototype.atMin = function () { return this.zoom <= 1.0001; };
  View.prototype.atMax = function () { return this.zoom >= this.cap / this.base - 1e-4; };

  /* ---------------- the stage ----------------
     The ground under the board, its dots sized to the board, and the key
     light's shadow box fitted round it. */
  View.prototype.stage = function (b) {
    var size = Math.max(b.maxx - b.minx, b.maxy - b.miny, 4), cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2;
    var key = [b.minx, b.maxx, b.miny, b.maxy].map(function (v) { return v.toFixed(2); }).join(",") + "|" + this.themeIx;
    if (key === this.stageKey) return;
    this.stageKey = key;
    var gs = Math.max(400, size * 14), dot = Math.min(14, Math.max(2.6, size / 4));
    this.ground.scale.set(gs, gs, 1); this.ground.position.set(cx, -0.01, -cy);
    this.catcher.scale.set(gs, gs, 1); this.catcher.position.set(cx, 0, -cy);
    this.groundMat.map.repeat.set(gs / dot, gs / dot);
    var half = Math.hypot(b.maxx - b.minx, b.maxy - b.miny) / 2 + 4, dist = half * 2 + 10, k = this.key;
    k.target.position.set(cx, 0, -cy); k.target.updateMatrixWorld();
    k.position.copy(k.target.position).addScaledVector(KEY_DIR, dist);
    var cam = k.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 0.5; cam.far = dist * 2;
    cam.updateProjectionMatrix();
  };
  /* ---------------- building the pieces ---------------- */
  View.prototype.clear = function () {
    var g = this.piecesG;
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    while (g.children.length) g.remove(g.children[0]);
    this.statObjs = []; this.sparks3 = [];
  };
  function own(m) { m.userData.own = true; return m; }

  View.prototype.build = function (game) {
    this.clear();
    this.cur = game;
    var self = this, RT = 0;
    game.pieces.forEach(function (p) { RT = Math.max(RT, p.h * TUBE); });
    this.RT = RT || 0.29;
    game.pieces.forEach(function (p) {
      p._o3 = p.kind === "ring" ? self.makeRing(p) : self.makeStick(p);
      self.piecesG.add(p._o3.g);
    });
    game.statics.forEach(function (s) {
      var o = null;
      if (s.kind === "guide") o = self.makeGuide(s);
      else if (s.kind === "host") o = new THREE.Group().add(self.makeHost(s));
      else if (s.kind === "bomb") { o = self.makeBomb(); o.position.set(s.x, 0, -s.y); }
      if (!o) return;
      self.piecesG.add(o);
      self.statObjs.push({ s: s, o: o });
    });
  };

  View.prototype.makeRing = function (p) {
    var r = p.h * TUBE, RT = this.RT, sh = tones(p.col), parts = [], tube = [];
    if (!(p.gap > 0)) {
      tube.push(new THREE.TorusGeometry(p.R, r, 12, Math.min(256, Math.max(48, Math.round(p.R * 34))), Math.PI * 2));
    } else {
      var half = p.gap * Math.PI / 360 + p.h / p.R, span = Math.max(1e-3, 2 * Math.PI - 2 * half);
      var t = new THREE.TorusGeometry(p.R, r, 12, Math.min(256, Math.max(14, Math.round(span * p.R * 5.5))), span);
      t.rotateZ(half); tube.push(t);
      [half, half + span].forEach(function (a) {
        var s = new THREE.SphereGeometry(r, 16, 12); s.translate(p.R * Math.cos(a), p.R * Math.sin(a), 0); tube.push(s);
      });
    }
    tube.forEach(function (g) { g.rotateX(-Math.PI / 2); g.translate(0, r, 0); parts.push([g, sh.base]); });
    var pulses = [];
    p.pins.forEach(function (pin) {
      if (pin.stem) pin.stem.shapes.forEach(function (s) { parts.push([slab(polyShape(s), RT * 0.72, RT * 1.42, 0.02, 2), sh.dark]); });
      if (!pin.trig) return;
      var s = pin.trig.shapes[0], c = centroid(s);
      var ax = s.lx[1] - s.lx[0], ay = s.ly[1] - s.ly[0], bx = s.lx[2] - s.lx[1], by = s.ly[2] - s.ly[1];
      var w = Math.hypot(ax, ay) * 1.08, d = Math.hypot(bx, by) * 0.74, th = Math.atan2(ay, ax);
      var tr = pin.clamp && pin.clamp.target ? pin.clamp.target.h * TUBE : RT;
      // a block sitting ON the other tube: its foot below the tube's top, its lid above
      var y0 = Math.min(tr * 0.95, RT * 0.95), y1 = 2 * tr + 0.13, rr = Math.min(w, d) * 0.24;
      var body = rbox(w, d, y0, y1, rr, 0.06), lid = rbox(w * 0.8, d * 0.74, y1 - 0.04, y1 + 0.035, rr * 0.8, 0.03);
      [body, lid].forEach(function (g) { g.rotateY(th); g.translate(c[0], 0, -c[1]); });
      parts.push([body, sh.dark]); parts.push([lid, sh.top]);
      pulses.push({ pin: pin, c: c, w: w, d: d, th: th, y1: y1, rr: rr, m: null });
    });
    p.stops.forEach(function (st) { st.shapes.forEach(function (s) { parts.push([slab(polyShape(s), RT * 0.3, RT * 1.6, 0.03, 3), sh.dark]); }); });
    var mat = own(candy());
    var g = new THREE.Group();
    g.add(mesh(merge(parts), mat));
    var o = { g: g, mat: mat, pulses: pulses, glow: 0 };
    if (p.bombGroup) { o.bomb = this.makeBomb(); o.bomb.position.set(p.bombGroup.shapes[0].lx[0], 0, -p.bombGroup.shapes[0].ly[0]); g.add(o.bomb); }
    if (p.lock > 0) { o.lock = this.makeLock(p); this.piecesG.add(o.lock.g); }
    return o;
  };

  View.prototype.makeStick = function (p) {
    var r = p.h * TUBE, s = p.body.shapes[0], parts = [], col = p.col;
    for (var i = 0; i < s.n; i++) {
      var sp = new THREE.SphereGeometry(r, 16, 12); sp.translate(s.lx[i], r, -s.ly[i]); parts.push([sp, col]);
      if (i === s.n - 1) break;
      var dx = s.lx[i + 1] - s.lx[i], dy = s.ly[i + 1] - s.ly[i], L = Math.hypot(dx, dy);
      if (L < 1e-4) continue;
      var cy = new THREE.CylinderGeometry(r, r, L, 16, 1, true);
      cy.rotateZ(-Math.PI / 2); cy.rotateY(Math.atan2(dy, dx));
      cy.translate((s.lx[i] + s.lx[i + 1]) / 2, r, -(s.ly[i] + s.ly[i + 1]) / 2);
      parts.push([cy, col]);
    }
    var mat = own(candy());
    var g = new THREE.Group(), slide = new THREE.Group();
    slide.add(mesh(merge(parts), mat));
    g.add(slide);
    g.rotation.y = p.a0;
    var o = { g: g, slide: slide, s0: p.s, mat: mat, pulses: [], glow: 0 };
    if (p.bombGroup) { o.bomb = this.makeBomb(); o.bomb.position.set(p.bombGroup.shapes[0].lx[0], 0, -p.bombGroup.shapes[0].ly[0]); slide.add(o.bomb); }
    return o;
  };

  /* a Catch guide or butterfly slot: a steel clip straddling the bar */
  View.prototype.makeGuide = function (s) {
    var t = s.trig.shapes[0], c = centroid(t);
    var ax = t.lx[1] - t.lx[0], ay = t.ly[1] - t.ly[0];
    var L = Math.hypot(ax, ay), W = Math.hypot(t.lx[2] - t.lx[1], t.ly[2] - t.ly[1]), th = Math.atan2(ay, ax);
    var tr = s.clamp && s.clamp.target ? s.clamp.target.h * TUBE : this.RT;
    var bw = L * 1.05, bh = Math.max(W * 1.25, 0.82), y1 = 2 * tr + 0.16;
    var parts = [[rbox(bw, bh, 0.04, y1, Math.min(bw, bh) * 0.22, 0.07), "#d3d8de"]];
    [-1, 1].forEach(function (k) {     // two screw heads on the lid
      var sc = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14); sc.translate(0, y1 + 0.01, k * bh * 0.28); sc.rotateY(0); parts.push([sc, "#9aa1aa"]);
    });
    parts.forEach(function (q) { q[0].rotateY(th); q[0].translate(c[0], 0, -c[1]); });
    return mesh(merge(parts), this.steelMat);
  };
  View.prototype.makeHost = function (s) {
    var parts = [];
    s.groups[0].shapes.forEach(function (sh) { parts.push([slab(polyShape(sh), 0, 0.22, 0.03, 2), "#ffffff"]); });
    return mesh(merge(parts), this.hostMat);
  };

  /* a round bomb with a star and a lit fuse; its star always faces the lens */
  /* ⚠ The ball is the bomb's trigger circle, r 0.75 (the APK's CircleCollider2D),
     so what the player sees touch is what sets it off. It was drawn at 0.62 and
     a bomb "went off without touching anything" (the owner, level 17). The star,
     cap, fuse and spark were drawn for a 0.62 ball and scale with it. */
  var BOMB_R = 0.75;
  View.prototype.makeBomb = function () {
    var BR = BOMB_R, k = BR / 0.62, g = new THREE.Group(), parts = [];
    var ball = new THREE.SphereGeometry(BR, 24, 18); ball.translate(0, BR, 0); parts.push([ball, "#a8431f"]);
    var star = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var rr = (i % 2 ? 0.11 : 0.27) * k, a = Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    var sg = new THREE.ExtrudeGeometry(star, { depth: 0.04 * k, bevelEnabled: true, bevelThickness: 0.015 * k, bevelSize: 0.015 * k, bevelSegments: 1 });
    /* ⚠ Seen from straight above, a cap and fuse on top of the ball sit on the
       star. So, as the 2D bomb is drawn: the star on the half towards the lens
       (60 degrees up), the cap and fuse on the far edge (50 degrees off the top,
       away from the lens) - the screen's top of the ball. */
    sg.rotateX(-Math.PI / 3); sg.translate(0, BR + 0.866 * BR * 0.95, 0.5 * BR * 0.95);
    parts.push([sg, "#ffd23f"]);
    var tc = 50 * Math.PI / 180, dy = Math.cos(tc), dz = -Math.sin(tc);       // the cap's axis: up and away
    var cap = new THREE.CylinderGeometry(0.14 * k, 0.15 * k, 0.14 * k, 14);
    cap.rotateX(-tc); cap.translate(0, BR + dy * (BR + 0.03 * k), dz * (BR + 0.03 * k)); parts.push([cap, "#6b3a1c"]);
    var fx = 0, fy = BR + dy * (BR + 0.1 * k), fz = dz * (BR + 0.1 * k);    // the fuse leaves the cap's top
    var fuse = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(fx, fy, fz),
      new THREE.Vector3(fx + 0.1 * k, fy + 0.22 * k, fz - 0.16 * k), new THREE.Vector3(fx + 0.3 * k, fy + 0.16 * k, fz - 0.2 * k)), 8, 0.035 * k, 6, false);
    parts.push([fuse, "#b0823a"]);
    var body = mesh(merge(parts), this.bombMat);
    g.add(body);
    var spark = new THREE.Group();
    var s1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 * k, 1), this.sparkMat), s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055 * k, 1), this.sparkCore);
    spark.add(s1); spark.add(s2); spark.position.set(fx + 0.32 * k, fy + 0.16 * k, fz - 0.21 * k);
    g.add(spark);
    this.sparks3.push(spark);
    return g;
  };

  /* chains across a locked ring, a padlock with the count, turned to the lens */
  View.prototype.makeLock = function (p) {
    var r = p.R + p.h, RT = this.RT, parts = [], lr = Math.min(0.24, Math.max(0.1, r * 0.075));
    for (var k = 0; k < 4; k++) {
      var a = Math.PI / 4 + k * Math.PI / 2;
      for (var i = 0; i < 6; i++) {
        var t0 = 0.35 + i * 0.65 / 6;
        var link = new THREE.TorusGeometry(lr, lr * 0.28, 6, 14);
        link.scale(1, 0.6, 1);
        if (i % 2 === 0) link.rotateX(-Math.PI / 2);
        link.rotateY(a); link.translate(Math.cos(a) * r * t0, 2 * RT + 0.08, -Math.sin(a) * r * t0);
        parts.push([link, "#a3a9b1"]);
      }
    }
    var chains = mesh(merge(parts), this.steelMat);
    var L = Math.min(2.2, Math.max(0.7, 0.62 * r * 0.8));
    var lock = new THREE.Group(), lp = [];
    lp.push([rbox(L * 1.2, L * 0.34, 0, L * 0.95, L * 0.22, L * 0.08), "#c9ced5"]);
    var sh = new THREE.TorusGeometry(L * 0.36, L * 0.085, 8, 20, Math.PI); sh.translate(0, L * 0.95, 0); lp.push([sh, "#8d939b"]);
    lock.add(mesh(merge(lp), this.steelMat));
    var cv = document.createElement("canvas"); cv.width = cv.height = 128;
    var tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    var face = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.9, L * 0.75), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })));
    face.position.set(0, L * 0.47, L * 0.17 + 0.01);
    lock.add(face);
    lock.rotation.x = -ELEV * 0.7;
    lock.position.set(0, 2 * RT * 0.5, 0);
    var g = new THREE.Group();
    g.add(chains); g.add(lock);
    g.position.set(p.cx, 0, -p.cy);
    var o = { g: g, cv: cv, tex: tex, n: -1 };
    return o;
  };
  function paintLock(o, n) {
    var x = o.cv.getContext("2d");
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = "#3d3a44"; x.font = "104px 'Lilita One', sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(String(n), 64, 70);
    o.tex.needsUpdate = true; o.n = n;
  }

  /* ---------------- effects ---------------- */

  /* a piece bursts: chunks of its colour pop up off the board and rain down */
  View.prototype.burst = function (p, strong) {
    var sh = tones(p.col), pts = [];
    if (p.kind === "ring") {
      var n = Math.max(18, Math.round(p.R * 12));
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
    var sp = strong ? 5 : 3.2, z0 = p.h * TUBE;
    for (var q = 0; q < pts.length && this.parts.length < 880; q++) {
      var e = pts[q];
      for (var z = 0; z < 2; z++) {
        this.parts.push({ x: e[0], y: e[1], z: z0, vx: e[2] * sp * (0.4 + Math.random()) + (Math.random() - 0.5) * 2,
          vy: e[3] * sp * (0.4 + Math.random()) + (Math.random() - 0.5) * 2, vz: 3.5 + Math.random() * (strong ? 7 : 5),
          life: 0.8 + Math.random() * 0.5, age: 0, size: 0.18 + Math.random() * 0.17,
          rx: Math.random() * 6, ry: Math.random() * 6, vr: (Math.random() - 0.5) * 14,
          col: new THREE.Color(Math.random() < 0.75 ? sh.base : sh.light) });
      }
    }
    this.dying.push({ p: p, age: 0 });
  };

  /* a stick that slid out of its last clip keeps going the way it was pulled */
  View.prototype.flyout = function (p, dx, dy) { this.dying.push({ p: p, age: 0, fly: [dx, dy], life: 0.38 }); };

  View.prototype.kaboom = function (x, y) {
    var cols = ["#ffd23f", "#ff8a3d", "#ff5a4a", "#fff3c4"];
    for (var i = 0; i < 46 && this.parts.length < 890; i++) {
      var a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7;
      this.parts.push({ x: x, y: y, z: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 2 + Math.random() * 8,
        life: 0.5 + Math.random() * 0.5, age: 0, size: 0.14 + Math.random() * 0.22, rx: 0, ry: 0, vr: 0,
        col: new THREE.Color(cols[i % 4]), round: true });
    }
    this.flash.push({ x: x, y: y, age: 0 });
  };

  /* Two hard pieces knocking together: a little star of light at the contact
     and a few hot sparks, gone in a third of a second (the owner: "a small
     flash where they meet, like two metal bars hitting"). On impact after a
     move; while the finger keeps pushing into it, at most twice a second.
     The contact comes from render.js's finder (RRView.contact). */
  View.prototype.clang = function (game, p, moved) {
    var since = this.t - (this.clangT == null ? -9 : this.clangT);
    if (since < 0.08 || (!(moved > 1e-4) && since < 0.45)) return;
    var c = typeof RRView !== "undefined" && RRView.contact ? RRView.contact(game, p) : null;
    if (!c) return;
    this.clangT = this.t;
    this.clangs.push({ x: c[0], y: c[1], age: 0 });
    var cols = ["#ffffff", "#fff3b0", "#ffd23f", "#ffb347"], z0 = this.RT * 1.2;
    for (var i = 0; i < 9 && this.parts.length < 890; i++) {
      var a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 5;
      this.parts.push({ x: c[0], y: c[1], z: z0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 1 + Math.random() * 3,
        life: 0.16 + Math.random() * 0.16, age: 0, size: 0.08 + Math.random() * 0.06, rx: 0, ry: 0, vr: 0,
        col: new THREE.Color(cols[i % 4]), round: true });
    }
  };

  View.prototype.say = function (text, x, y, col) { this.texts.push({ text: text, x: x, y: y, age: 0, col: col || "#5bcf3c" }); };
  View.prototype.rocket = function (fromS, toW, done) { this.rockets.push({ from: fromS, to: toW, age: 0, dur: 0.55, done: done }); };

  View.prototype.tick = function (dt) {
    this.t += dt;
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var q = this.parts[i];
      q.age += dt;
      if (q.age > q.life) { this.parts.splice(i, 1); continue; }
      q.vz -= 24 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rx += q.vr * dt; q.ry += q.vr * 0.7 * dt;
      var fl = q.size * 0.4;
      if (q.z < fl) { q.z = fl; if (q.vz < 0) q.vz = -q.vz * 0.35; q.vx *= 0.75; q.vy *= 0.75; q.vr *= 0.6; }
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

  /* ---------------- the frame ---------------- */
  function setGlow(o, k, col) {
    if (o.glow === k && o.glowCol === col) return;
    o.glow = k; o.glowCol = col;
    o.mat.emissive.copy(k > 0 ? col : BLACK); o.mat.emissiveIntensity = k;
  }
  function setFade(o, a) {
    var m = o.mat;
    if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
    m.opacity = a;
  }

  View.prototype.draw = function (game, ui) {
    if (!game) return;
    ui = ui || {};
    if (this.homeOn) this.leaveHome();
    if (!this.rect) this.fit(game, { x: 0, y: 0, w: this.w, h: this.h });
    if (game !== this.cur) this.build(game);
    /* Only draw a frame that differs from the last. game.js calls draw 60
       times a second and a board mostly stands still: on a phone, rendering
       the same shadows and gloss over and over is heat and battery for nothing.
       Moving is anything animating, or the poses / camera having changed. */
    // ⚠ the end of every animation must change it too, or its last frame stays
    // on screen: a glow after the finger lifts, a ghost of a broken ring
    var sig = [this.w, this.h, this.cx, this.tgt[0], this.tgt[1], this.zoom, this.themeIx, ui.drag ? ui.drag.id : "-", !!ui.hammer, !!ui.shake,
      ui.appear == null || ui.appear >= 1, this.parts.length, this.dying.length, this.flash.length, this.clangs.length], h = 0, bombs = 0;
    game.pieces.forEach(function (p, i) {
      h += (i + 1) * ((p.kind === "ring" ? p.ang : p.s) * 1000 + (p.removed ? 7 : 0) + p.lock * 13);
      if (p.bombGroup && !p.removed) bombs++;
    });
    game.statics.forEach(function (s, i) { if (s.removed) h += (i + 1) * 17; else if (s.kind === "bomb") bombs++; });
    sig.push(h);
    sig = sig.join("|");
    var moving = bombs > 0 || this.parts.length || this.dying.length || this.flash.length || this.clangs.length || ui.drag || ui.shake || ui.hammer ||
      (ui.appear != null && ui.appear < 1);
    if (!moving && sig === this.lastSig) { this.overlay(); return; }
    this.lastSig = sig;
    this.offset(this.cx - this.rcx);         // game.js shakes the screen by nudging cx
    var self = this, t = this.t;
    var dyingOf = new Map();
    this.dying.forEach(function (d) { dyingOf.set(d.p, d); });

    // appear: everything grows in from the board centre and drops into place
    var e = ui.appear != null && ui.appear < 1 ? 1 - Math.pow(1 - ui.appear, 3) : 1, s = 0.85 + 0.15 * e;
    this.piecesG.scale.set(s, s, s);
    this.piecesG.position.set(this.bwx * (1 - s), (1 - e) * 1.6, -this.bwy * (1 - s));

    game.pieces.forEach(function (p) {
      var o = p._o3;
      if (!o) return;
      var d = dyingOf.get(p);
      o.g.visible = !p.removed || !!d;
      if (o.lock) {
        o.lock.g.visible = !p.removed && p.lock > 0;
        if (o.lock.g.visible && o.lock.n !== p.lock) paintLock(o.lock, p.lock);
      }
      if (!o.g.visible) return;
      var shx = 0;
      if (ui.shake && ui.shake.p === p) { var k = ui.shake.t; shx = Math.sin(k * 60) * 4 * Math.max(0, 1 - k / 0.35) / self.sc; }
      var bx = p.kind === "ring" ? p.cx : p.ox, by = p.kind === "ring" ? p.cy : p.oy;
      o.g.position.set(bx + shx, 0, -by);
      o.g.scale.set(1, 1, 1);
      if (p.kind === "ring") o.g.rotation.y = p.ang;
      else { var ds = p.s - o.s0; o.slide.position.set(ds * p.axis[0], 0, -ds * p.axis[1]); }
      if (o.bomb) o.bomb.rotation.y = -(p.kind === "ring" ? p.ang : p.a0);
      if (d) {
        var kk = d.age / (d.life || 0.22);
        if (d.fly) {
          var ee = kk * kk * 9;
          o.g.position.set(bx + d.fly[0] * ee, 0, -(by + d.fly[1] * ee));
          setFade(o, 1 - kk * kk);
        } else {
          o.g.scale.set(1 + kk * 0.25, 1 + kk * 0.25, 1 + kk * 0.25);
          setFade(o, 1 - kk);
          setGlow(o, 0.45, WHITE_E);
        }
        return;
      }
      var held = ui.drag === p, hammer = ui.hammer && Math.sin(t * 8) > 0;
      setGlow(o, held ? 0.32 : hammer ? 0.22 : 0, GLOW);
      // a stuck ring flashes the heads that hold it
      var pulse = ui.shake && ui.shake.p === p && Math.sin(ui.shake.t * 30) > 0;
      o.pulses.forEach(function (h) {
        var on = pulse && h.pin.clamp && h.pin.clamp.active;
        if (on && !h.m) {
          var g = rbox(h.w * 1.04, h.d * 1.04, h.y1 - 0.05, h.y1 + 0.07, h.rr, 0.03);
          g.rotateY(h.th); g.translate(h.c[0], 0, -h.c[1]);
          h.m = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ color: "#ff5a4e", toneMapped: false })));
          o.g.add(h.m);
        }
        if (h.m) h.m.visible = !!on;
      });
    });
    this.statObjs.forEach(function (so) { so.o.visible = !so.s.removed; });
    this.sparks3.forEach(function (sp, i) {
      var fl = 0.6 + 0.4 * Math.sin(t * 22 + i * 1.7);
      sp.scale.setScalar(0.75 + 0.45 * fl);
    });

    // chunks and sparks
    var nc = 0, ns = 0;
    for (var i = 0; i < this.parts.length; i++) {
      var q = this.parts[i], a = 1 - q.age / q.life, sz = q.size * Math.min(1, a * 2.2);
      DUMMY.position.set(q.x, q.z, -q.y);
      DUMMY.rotation.set(q.rx, q.ry, 0);
      DUMMY.scale.setScalar(Math.max(0.001, sz));
      DUMMY.updateMatrix();
      if (q.round) { this.sparkI.setMatrixAt(ns, DUMMY.matrix); this.sparkI.setColorAt(ns, q.col); ns++; }
      else { this.chunks.setMatrixAt(nc, DUMMY.matrix); this.chunks.setColorAt(nc, q.col); nc++; }
    }
    [[this.chunks, nc], [this.sparkI, ns]].forEach(function (m) {
      m[0].count = m[1];
      if (m[1]) { m[0].instanceMatrix.needsUpdate = true; if (m[0].instanceColor) m[0].instanceColor.needsUpdate = true; }
    });

    // flashes: a pale disc and a shock ring on the board, and a warm light
    // ⚠ drawn over the board (normal blending), not added: on a light floor an
    // additive flash adds up to white and disappears (UI_UX_RULES 6.8)
    var lit = 0;
    this.discs.forEach(function (dr, j) {
      var f = self.flash[self.flash.length - 1 - j];
      dr[0].visible = dr[1].visible = !!f;
      if (!f) return;
      var k = f.age / 0.35, R = 1.2 + 3 * k;
      dr[0].position.set(f.x, 0.75, -f.y); dr[0].scale.set(R, R, 1); dr[0].material.opacity = 0.75 * (1 - k);
      dr[1].position.set(f.x, 0.7, -f.y); dr[1].scale.set(R * 1.25, R * 1.25, 1); dr[1].material.opacity = 0.85 * (1 - k);
      if (j === 0) { lit = 2.4 * (1 - k); self.boomLight.position.set(f.x, 1.6, -f.y); }
    });
    this.boomLight.intensity = lit;
    this.stars.forEach(function (sp, j) {
      var k = self.clangs[self.clangs.length - 1 - j];
      sp.visible = !!k;
      if (!k) return;
      var f = k.age / 0.28, sz = 1.6 * (f < 0.25 ? f / 0.25 : 1 - (f - 0.25) / 0.75);
      sp.position.set(k.x, self.RT * 1.6, -k.y);
      sp.scale.set(Math.max(0.001, sz), Math.max(0.001, sz), 1);
      sp.material.rotation = f * 1.2; sp.material.opacity = 1 - f * f;
    });

    this.gl.render(this.scene, this.cam);
    this.overlay();
  };

  /* the 2D layer on top: the firework's flight and the praise words */
  View.prototype.overlay = function () {
    var ctx = this.ctx, self = this, dpr = this.dpr, any = this.rockets.length || this.texts.length;
    if (!any && !this.olDrawn) return;
    this.olDrawn = !!any;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!any) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.rockets.forEach(function (r) {
      var k = r.age / r.dur, e = k * k * (3 - 2 * k);
      var to = self.w2s(r.to[0], r.to[1]);
      var x = r.from[0] + (to[0] - r.from[0]) * e, y = r.from[1] + (to[1] - r.from[1]) * e - Math.sin(k * Math.PI) * 80;
      var e2 = Math.min(1, e + 0.05), k2 = Math.min(1, k + 0.05);
      var nx = r.from[0] + (to[0] - r.from[0]) * e2, ny = r.from[1] + (to[1] - r.from[1]) * e2 - Math.sin(k2 * Math.PI) * 80;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(ny - y, nx - x));
      ctx.fillStyle = "#ffcf4a"; ctx.beginPath(); ctx.arc(-14, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#9b59e8"; ctx.beginPath(); ctx.rect(-10, -6, 20, 12); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-4, -6, 3, 12); ctx.fillRect(3, -6, 3, 12);
      ctx.fillStyle = "#c3a0ff"; ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(18, 0); ctx.lineTo(10, 6); ctx.fill();
      ctx.restore();
    });
    this.texts.forEach(function (tx) {
      var c = self.proj(tx.x, 2 * self.RT + 0.6, -tx.y), k = tx.age / 1.1;
      var y = c[1] - 40 * k - 10, s = Math.round(28 + 10 * Math.min(1, k * 6) - 6 * k);
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      ctx.font = s + "px 'Lilita One', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 9; ctx.strokeStyle = "#24305e"; ctx.strokeText(tx.text, c[0], y + 3);
      ctx.lineWidth = 7; ctx.strokeText(tx.text, c[0], y);
      ctx.fillStyle = tx.col; ctx.fillText(tx.text, c[0], y);
    });
    ctx.globalAlpha = 1;
  };

  /* ---------------- Home ----------------
     The owner (2026-10-17), of the cover picture: "make Home another kind - the
     rings turning in 3D like the game", and of its title "not so like Seat Jam".
     So Home is drawn here, in 3D: three rings of the game held the way a board
     holds them (the top one's pins clamp the two below), on the ground under a
     tilted lens, and over them the title, its letters extruded in the rings'
     candy, the dots on its i's two small rings.
     ⚠ Still. The first cut turned the rings on the ground, twisted the two held
     ones and ran a wave through the letters; the owner: "no animation is fine",
     then "keep the two rings on the letters". So only the i-dots turn - turn,
     twist and wave below are 0, and are the switches back.
     game.js calls home() every frame on Home, with the page's two boxes: where
     the title goes and where the rings go. ⚠ It borrows the play camera, the
     ground and the light; draw() hands them back (leaveHome). */
  var HOME = {
    elev: 50,                  // degrees: tilted, so the rings read as 3D
    turn: 0,                   // radians a second the cluster turns on the ground (was 0.26)
    twist: 0, twistRate: 1.25, // the lower rings' swing, radians (was 1.2: +-69 degrees every 5 s)
    wave: 0,                   // the letters' bob and twist (was 1)
    rings: [                   // engine units: the gap's direction, the pins as [direction, ring]
      { col: "#984be0", x: 0, y: 2.0, gap: 90, pins: [[240, 1], [300, 2]] },
      { col: "#32afdd", x: -2.295, y: -1.975, gap: 240, twist: 1 },
      { col: "#ec8f2e", x: 2.295, y: -1.975, gap: 300, twist: -1 },
    ],
    reach: 4.75,               // the cluster's radius round its middle, tubes and all: what a turning one needs
  };
  /* A pin the way the shipped boards make one, in the ring's own frame: the
     stem from 2.0 to 2.5 out, the head 2.5 to 3.17 - its middle at 2.84, on the
     tube of a ring 4.59 away. Corners in the engine's order. */
  function homePin(th, target) {
    var c = Math.cos(th), s = Math.sin(th);
    function quad(r0, r1, w) {
      var q = [[r0, -w], [r1, -w], [r1, w], [r0, w]];
      return { n: 4, lx: q.map(function (v) { return v[0] * c - v[1] * s; }), ly: q.map(function (v) { return v[0] * s + v[1] * c; }) };
    }
    return { stem: { shapes: [quad(2.0, 2.5, 0.208)] }, trig: { shapes: [quad(2.5, 3.17, 0.342)] }, clamp: { target: target, active: true } };
  }

  /* a letter's outline (M L Q Z, font units) as shapes, holes cut */
  function outline(d) {
    var sp = new THREE.ShapePath(), tk = d.match(/[MLQZ]|-?\d+(?:\.\d+)?/g), i = 0;
    function n() { return parseFloat(tk[i++]); }
    while (i < tk.length) {
      var op = tk[i++];
      if (op === "M") sp.moveTo(n(), n());
      else if (op === "L") sp.lineTo(n(), n());
      else if (op === "Q") { var a = n(), b = n(), x = n(), y = n(); sp.quadraticCurveTo(a, b, x, y); }
    }
    return sp.toShapes(false);            // TrueType: the solid runs clockwise
  }
  /* Candy, as the rings: the face a ramp from a lighter tint at the top to the
     colour, everything turned away from the lens in the colour's dark. */
  function paint(g, col) {
    g.computeBoundingBox();
    var pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, c = new Float32Array(n * 3);
    var y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
    var top = new THREE.Color(mixc(col, WHITE, 0.32)), mid = new THREE.Color(col), side = new THREE.Color(mixc(col, INK, 0.3)), t = new THREE.Color();
    for (var i = 0; i < n; i++) {
      var k = (pos.getY(i) - y0) / Math.max(1e-6, y1 - y0);
      var f = Math.max(0, Math.min(1, (nor.getZ(i) - 0.2) / 0.6));
      t.copy(mid).lerp(top, k * k);
      t.lerp(side, 1 - f);
      c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  }

  View.prototype.buildHome = function () {
    var self = this, hm = this.hm = { t: 0, rings: [] }, n = HOME.rings.length;
    var RT0 = this.RT;
    this.RT = 0.25 * TUBE;                 // makeRing sizes the pins off the board's fattest tube
    var ps = HOME.rings.map(function (r) { return { h: 0.25, R: 1.75, gap: 90, col: r.col, pins: [], stops: [], lock: 0 }; });
    HOME.rings.forEach(function (r, i) {
      (r.pins || []).forEach(function (q) { ps[i].pins.push(homePin((q[0] - r.gap) * Math.PI / 180, ps[q[1]])); });
    });
    var out = 1.75 + 0.25 * TUBE;          // a ring's outer edge
    hm.box = {
      minx: Math.min.apply(null, HOME.rings.map(function (r) { return r.x; })) - out, maxx: Math.max.apply(null, HOME.rings.map(function (r) { return r.x; })) + out,
      miny: Math.min.apply(null, HOME.rings.map(function (r) { return r.y; })) - out, maxy: Math.max.apply(null, HOME.rings.map(function (r) { return r.y; })) + out };
    hm.cx = HOME.rings.reduce(function (a, r) { return a + r.x / n; }, 0);
    hm.cy = HOME.rings.reduce(function (a, r) { return a + r.y / n; }, 0);
    var spin = hm.spin = new THREE.Group();
    spin.position.set(hm.cx, 0, -hm.cy);
    HOME.rings.forEach(function (r, i) {
      var o = self.makeRing(ps[i]), rest = r.gap * Math.PI / 180;
      o.g.position.set(r.x - hm.cx, 0, -(r.y - hm.cy));
      o.g.rotation.y = rest;
      spin.add(o.g);
      hm.rings.push({ g: o.g, rest: rest, twist: r.twist || 0 });
    });
    this.RT = RT0;
    this.scene.add(spin);
    hm.title = this.buildTitle();
  };

  View.prototype.buildTitle = function () {
    if (!TITLE.letters) return null;
    var T = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(24, 1, 0.5, 400), letters: [] };
    T.scene.environment = this.scene.environment;
    T.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a890, 0.5));
    var key = new THREE.DirectionalLight(0xfff3e2, 0.72); key.position.set(-4, 7, 9); T.scene.add(key);
    var fill = new THREE.DirectionalLight(0xdfe9ff, 0.2); fill.position.set(6, 1, 6); T.scene.add(fill);
    var S = 0.001, b = TITLE.box, mx = (b[0] + b[2]) / 2 * S, my = (b[1] + b[3]) / 2 * S;
    T.w = (b[2] - b[0]) * S; T.h = (b[3] - b[1]) * S;
    var DEPTH = 150, BT = 34, BS = 24, dots = TITLE.dots.slice();
    TITLE.letters.forEach(function (L) {
      var g = new THREE.ExtrudeGeometry(outline(L.d), { depth: DEPTH, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelSegments: 4, curveSegments: 7 });
      g.scale(S, S, S);
      g.computeBoundingBox();
      var bx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
      g.translate(-bx, 0, -DEPTH * S / 2);            // each letter turns about its own middle
      var pivot = new THREE.Group();
      pivot.position.set(L.x * S + bx - mx, L.y * S - my, 0);
      pivot.add(new THREE.Mesh(paint(g, L.c), candy({ clearcoat: 0.8, clearcoatRoughness: 0.2 })));
      if (L.ch === "i" && dots.length) {
        // the i's dot is a little ring, turning on its own
        var d = dots.shift(), ring = new THREE.Mesh(paint(new THREE.TorusGeometry(d.r * 0.82 * S, d.r * 0.34 * S, 14, 40), d.c), candy({ clearcoat: 0.8, clearcoatRoughness: 0.2 }));
        ring.position.set(d.x * S - (L.x * S + bx), d.y * S - L.y * S + d.r * 0.12 * S, 0);
        pivot.add(ring);
        T.dots = (T.dots || []).concat([ring]);
      }
      T.scene.add(pivot);
      T.letters.push({ p: pivot, y: pivot.position.y });
    });
    return T;
  };

  // "reduce motion": Home stands still, drawn again only when the page moves
  var CALM = (function () { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();

  View.prototype.home = function (dt, titleBox, heroBox) {
    if (!this.hm) this.buildHome();
    var hm = this.hm, w = this.w, h = this.h, cam = this.cam, t = CALM ? 1.1 : (hm.t += dt);
    var key = [w, h, titleBox.left, titleBox.top, titleBox.width, heroBox.left, heroBox.top, heroBox.width, heroBox.height].join("|");
    var fresh = !this.homeOn || key !== hm.key;
    if (CALM && !fresh) return;
    hm.key = key;
    /* The rings stand still, so their shadows are drawn once, not every frame:
       only the i-dots move, and they cast none. leaveHome turns it back on. */
    this.gl.shadowMap.autoUpdate = false;
    if (fresh || HOME.turn || HOME.twist) this.gl.shadowMap.needsUpdate = true;
    if (!this.homeOn) {
      this.homeOn = true;
      this.piecesG.visible = false; hm.spin.visible = true;
      this.chunks.count = 0; this.sparkI.count = 0; this.boomLight.intensity = 0;
      this.discs.forEach(function (dr) { dr[0].visible = dr[1].visible = false; });
      this.stars.forEach(function (sp) { sp.visible = false; });
      this.stage({ minx: hm.cx - 5, maxx: hm.cx + 5, miny: hm.cy - 5, maxy: hm.cy + 5 });
    }
    this.lastSig = null;                      // the next board draws its first frame whatever
    hm.spin.rotation.y = t * HOME.turn;
    hm.rings.forEach(function (r) { if (r.twist) r.g.rotation.y = r.rest + r.twist * HOME.twist * Math.sin(t * HOME.twistRate); });

    // the lens: tilted, the cluster fitted into the page's box for it - its own box
    // standing still, the circle it sweeps when it turns - and its height
    var E = HOME.elev * Math.PI / 180, R = HOME.reach, top = 0.75, b = hm.box;
    var bw = HOME.turn ? 2 * R : b.maxx - b.minx, bd = HOME.turn ? 2 * R : b.maxy - b.miny;
    var ax = HOME.turn ? hm.cx : (b.minx + b.maxx) / 2, ay = HOME.turn ? hm.cy : (b.miny + b.maxy) / 2;
    var hx = heroBox.left + heroBox.width / 2, hy = heroBox.top + heroBox.height / 2;
    var sc = Math.max(4, Math.min(heroBox.width * 0.92 / bw, heroBox.height * 0.92 / (bd * Math.sin(E) + top * Math.cos(E))));
    var D = h / (2 * sc * TANF);
    cam.aspect = w / Math.max(1, h);
    cam.position.set(ax, D * Math.sin(E), -ay + D * Math.cos(E));
    cam.up.set(0, 1, 0);
    cam.lookAt(ax, top / 2, -ay);
    cam.setViewOffset(w, h, w / 2 - hx, h / 2 - hy, w, h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.gl.render(this.scene, cam);

    var T = hm.title;
    if (T && titleBox && titleBox.width > 4) {
      T.letters.forEach(function (L, i) {
        L.p.position.y = L.y + HOME.wave * 0.022 * Math.sin(t * 2.1 - i * 0.6);
        L.p.rotation.y = HOME.wave * 0.24 * Math.sin(t * 1.35 - i * 0.42);       // the twist, running along the word
        L.p.rotation.z = HOME.wave * 0.035 * Math.sin(t * 1.5 - i * 0.9);
      });
      (T.dots || []).forEach(function (d, i) { d.rotation.y = t * 2.2 + i * 1.3; });   // the one thing that moves
      var eT = 9 * Math.PI / 180, tanT = Math.tan(T.cam.fov * Math.PI / 360);
      var st = Math.min(titleBox.width / (T.w + 0.16), titleBox.height / (T.h + 0.16));
      var DT = h / (2 * st * tanT), tc = T.cam;
      tc.aspect = w / Math.max(1, h);
      tc.position.set(0, DT * Math.sin(eT), DT * Math.cos(eT));
      tc.lookAt(0, 0, 0);
      tc.setViewOffset(w, h, w / 2 - (titleBox.left + titleBox.width / 2), h / 2 - (titleBox.top + titleBox.height / 2), w, h);
      tc.updateProjectionMatrix();
      this.gl.autoClear = false;
      this.gl.clearDepth();
      this.gl.render(T.scene, tc);
      this.gl.autoClear = true;
    }
    this.overlay();
  };
  /* back to a board: its pieces, its camera, its ground and shadow box */
  View.prototype.leaveHome = function () {
    this.homeOn = false;
    this.gl.shadowMap.autoUpdate = true;
    if (this.hm) this.hm.spin.visible = false;
    this.piecesG.visible = true;
    this.stageKey = "";
    if (this.bb) { this.apply(); this.stage(this.bb); }
    this.lastSig = null;
  };

  return { View: View };
})();

if (typeof module !== "undefined") module.exports = RRView3D;
