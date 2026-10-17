/* Rotate Ring - the shell: screens, input, gold, boosters, save, sound.
   The rules live in engine.js and the pictures in render.js; nothing here
   decides what may move. */
(function () {
  "use strict";

  /* ---------------- tuning, in one block ----------------
     ⚠ None of these numbers are in the APK: prices and rewards of the shipped
     game live in its remote config. They are ours, and README says so.
     ⚠ THE SCORE IS THE GOLD (the owner: "gold is the score"). There are no
     points a piece: the pill on top is the purse, and it only grows when a
     board is won ("points are added when you win") - a board restarted halfway
     earns nothing. */
  const TUNE = /*__TUNE__*/{};
  const COMBO_WINDOW = 2.4;                       // seconds between pieces that still chain (pop pitch, praise)
  const BOOM_UNLOCK = TUNE.BOOM_UNLOCK || 4, BOOM_FREE = 3;     // the video unlocks the firework on level 4, with 3
  const HAMMER_UNLOCK = TUNE.HAMMER_UNLOCK || 8, HAMMER_FREE = 3;
  /* Gold, the owner's numbers: every board won pays WIN_GOLD, and a booster you
     are out of costs PRICE. Read as wins (UI_UX_RULES 6.4): five wins buy a
     firework, ten wins buy a hammer. */
  const WIN_GOLD = TUNE.WIN_GOLD || 10;
  const PRICE = { boom: TUNE.PRICE_BOOM || 50, hammer: TUNE.PRICE_HAMMER || 100 };
  const PRAISE = ["Great!", "Excellent!", "Amazing!", "Incredible!"];
  /* Praise is rare on purpose (the owner: "only now and then"): always for the
     last piece of a board, always for a hard one or one that took a long while,
     otherwise on 30% of clears. A cascade gets one word, not one each. */
  const PRAISE_CHANCE = 0.3;
  const PRAISE_SLOW = 12;      // seconds since the previous clear that make it "a long while"
  const PRAISE_HARD = 3;       // links on the piece at the start that make it "hard"
  const PRAISE_LAST = ["Amazing!", "Excellent!", "Perfect!"];
  const PRAISE_COL = ["#5bcf3c", "#3fb6e6", "#b06cf0", "#ff8a3d"];
  const WIN_TITLE = "LEVEL COMPLETE!";
  /* Hard levels - the owner, for now: "20, 30, 40 ... are the hard ones" (the
     APK carries no difficulty; tools/difficulty.js measures traps if a real
     grading is wanted later). UI_UX_RULES 2.9: the tag takes the place of the
     word LEVEL, it never adds width. */
  const isHard = n => n >= 20 && n % 10 === 0;   // the owner: the complete screen as in SeatawayO, whose band says this

  const SAVE_KEY = "rotatering.save.v1";      // ⚠ never rename after launch
  const LEVELS = window.RR_LEVELS || [];
  const N = LEVELS.length;

  /* ---------------- save ---------------- */
  function fresh() {
    return { level: 1, gold: 0, boom: 0, hammer: 0, seen: {}, sound: true, vib: true, played: 0 };
  }
  let save = fresh();
  function load() {
    try {
      const raw = PLATFORM.storage.getItem(SAVE_KEY);
      if (raw) save = Object.assign(fresh(), JSON.parse(raw));
    }
    catch (e) { save = fresh(); }
  }
  function persist() { PLATFORM.storage.setItem(SAVE_KEY, JSON.stringify(save)); }

  /* UI_UX_RULES 4: ?reset and ?level=N, applied after the host's save has
     loaded, then stripped so a refresh does not apply them again. */
  function devLinks() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    let touched = false;
    if (q.has("reset")) { wipe(); touched = true; }
    if (q.has("level")) {
      const n = parseInt(q.get("level"), 10);
      if (Number.isFinite(n)) { save.level = Math.max(1, n); persist(); }
      touched = true;
    }
    if (touched) try { history.replaceState(null, "", location.pathname); } catch (e) { /* file:// */ }
  }
  /* progress goes; the sound and vibration switches stay (UI_UX_RULES 4.5) */
  function wipe() {
    const keep = { sound: save.sound, vib: save.vib };
    save = Object.assign(fresh(), keep);
    persist();
  }

  /* ---------------- sound: synthesised, no files ---------------- */
  const SFX = (function () {
    let ac = null, master = null;
    function ctx() {
      if (ac) return ac;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.55;
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -10;
        master.connect(comp); comp.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    function on() { return save.sound && !PLATFORM.hostMuted() && !adPlaying; }
    function tone(f0, f1, dur, type, vol, delay) {
      const a = ctx(); if (!a || !on()) return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, freq, vol, q) {
      const a = ctx(); if (!a || !on()) return;
      const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(master); s.start();
    }
    let lastTick = 0, lastBump = 0, lastClink = 0, unlocked = false;
    return {
      unlock() {
        const a = ctx(); if (!a) return;
        if (a.state === "suspended") a.resume();
        if (!unlocked) {
          // iOS: one silent buffer started inside a gesture opens the audio for good
          try { const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); unlocked = true; }
          catch (e) { /* try again on the next touch */ }
        }
      },
      tick() { const now = performance.now(); if (now - lastTick < 45) return; lastTick = now; noise(0.025, 2600, 0.12, 4); },
      bump() { const now = performance.now(); if (now - lastBump < 160) return; lastBump = now; tone(150, 90, 0.07, "sine", 0.25); },
      // two solid pieces meeting: a short metal clink (the owner: "like two metal bars hitting")
      clink() { const now = performance.now(); if (now - lastClink < 220) return; lastClink = now; tone(2400, 1800, 0.05, "triangle", 0.12); noise(0.03, 5000, 0.12, 6); },
      nope() { tone(220, 180, 0.08, "square", 0.08); tone(180, 150, 0.1, "square", 0.08, 0.09); },
      latch() { tone(1250, 820, 0.05, "triangle", 0.22); noise(0.03, 3500, 0.15, 3); },
      pop(k) { const f = 520 * Math.pow(1.12, Math.min(k, 8)); tone(f, f * 2.1, 0.12, "sine", 0.32); noise(0.06, 1800, 0.18, 1.5); },
      boom() { noise(0.55, 300, 0.9, 0.7); tone(90, 40, 0.4, "sine", 0.6); },
      whoosh() { noise(0.4, 1200, 0.25, 0.8); },
      smash() { noise(0.18, 900, 0.6, 0.9); tone(160, 60, 0.18, "square", 0.15); },
      click() { tone(700, 500, 0.04, "triangle", 0.15); },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f * 1.01, 0.22, "triangle", 0.25, i * 0.11)); },
    };
  })();
  function buzz(ms) { if (save.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* not allowed */ } }

  /* ---------------- dom ---------------- */
  const $ = id => document.getElementById(id);
  const cv = $("cv");
  let view = null;
  let adPlaying = false;

  function show(id, on) { $(id).hidden = !on; }
  let toastT = 0;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------------- state ---------------- */
  let state = "boot";      // home | play | won | menu
  // hud: where the gold pill is heading; shown: what it says now (it counts up)
  let game = null, levelNo = 1, shown = 0, hud = 0, combo = 0, lastGone = -9;
  let drag = null;         // {p, d, id, target, last, u}
  let hammer = false, busyBoost = false;
  let appear = 1, shakeFx = null, winT = -1, clock = 0, levelT0 = 0;
  let tutor = null;        // {p, phase}
  let introQ = [];

  function levelData(n) { return LEVELS[(n - 1) % N]; }

  /* the free rectangle between the bars, css px */
  function playRect() {
    const W = innerWidth, H = innerHeight;
    if (state === "home") {
      const lo = $("logo").getBoundingClientRect(), hl = $("homeLow").getBoundingClientRect();
      return { x: 0, y: lo.bottom + 6, w: W, h: Math.max(80, hl.top - lo.bottom - 12) };
    }
    const top = $("topbar").getBoundingClientRect().bottom;
    const bot = $("boosters").getBoundingClientRect().top;
    return { x: 0, y: top, w: W, h: Math.max(100, bot - top) };
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.resize(innerWidth, innerHeight, dpr);
    if (state !== "home" && game) { view.fit(game, playRect()); refreshZoom(); }
  }

  /* ---------------- level flow ---------------- */
  function startLevel(n) {
    levelNo = Math.max(1, n);
    game = new RR.Game(levelData(levelNo));
    game.sweep(); game.events.length = 0;
    // how tied in each piece starts: a piece in three or more links is a hard one
    game.pieces.forEach(p => { p._links = game.clamps.filter(c => c.active && (c.owner === p || c.target === p)).length; });
    shown = hud = save.gold; combo = 0; lastGone = -9; winT = -1; levelT0 = clock;
    drag = null; hammer = false; busyBoost = false; shakeFx = null;
    endTutorSilently(); introQ = [];
    if (coach) { $(COACH[coach.kind].tool).classList.remove("teach"); coach = null; }
    show("coachDim", false); show("coachSkip", false); show("coachHand", false);
    state = "play";
    show("home", false); show("hud", true); show("win", false);
    $("lvNum").textContent = levelNo;
    const lvPill = $("lvNum").parentNode;
    lvPill.classList.toggle("hard", isHard(levelNo));
    lvPill.querySelector("small").textContent = isHard(levelNo) ? "HARD" : "LEVEL";
    // SeatawayO's "HARD LEVEL" stamp: plays once on entering (a retry plays it again)
    const stamp = $("hardStamp");
    if (stamp) { stamp.hidden = true; void stamp.offsetWidth; stamp.hidden = !isHard(levelNo); }
    $("score").textContent = save.gold;
    view.parts.length = 0; view.texts.length = 0; view.dying.length = 0;
    if (view.setTheme) view.setTheme(levelNo);
    view.fit(game, playRect());
    refreshZoom();
    appear = 0;
    unlockBoosters();
    refreshTools();
    setBanner(false);
    PLATFORM.gameplayStart();
    track("level_start", { level: levelNo, id: game.lv.id });
    queueIntros();
    nextIntro();
  }

  function unlockBoosters() {
    if (levelNo >= BOOM_UNLOCK && !save.seen.boom) {
      save.seen.boom = 1; save.boom += BOOM_FREE; persist();
      introQ.push({ coach: "boom" });
    } else if (levelNo >= BOOM_UNLOCK && !save.seen.boomTaught) {
      // a save from before the lesson existed: teach it once, on this level
      introQ.push({ coach: "boom" });
    }
    if (levelNo >= HAMMER_UNLOCK && !save.seen.hammer) {
      save.seen.hammer = 1; save.hammer += HAMMER_FREE; persist();
      introQ.push({ coach: "hammer" });
    } else if (levelNo >= HAMMER_UNLOCK && !save.seen.hammerTaught) {
      introQ.push({ coach: "hammer" });
    }
  }

  /* coach cards for pieces whose rule a player cannot guess from their face */
  function queueIntros() {
    const lv = game.lv;
    const has = {
      stick: lv.sticks.length > 0,
      bomb: (lv.bombs && lv.bombs.length) || game.pieces.some(p => p.bombGroup),
      chain: game.pieces.some(p => p.lock > 0),
      closed: game.pieces.some(p => p.kind === "ring" && !(p.gap > 0) && game.clamps.some(c => c.active && c.target === p)),
    };
    // ⚠ Fresh flags: seen.stick / seen.bomb were set by the old text cards, and a
    // save that saw those would never get the hand (the owner's did not, on 16).
    if (has.stick && !save.seen.stickDemo) { save.seen.stickDemo = 1; stickDemo = true; }
    // only on the first board with a bomb: setting it off at once was checked
    // winnable there (see bombMove), not on every bomb board after it
    const firstBomb = LEVELS.findIndex(l => l.rings.some(r => r.bomb) || l.sticks.some(t => t.bomb) || (l.bombs && l.bombs.length > 0)) + 1;
    if (has.bomb && levelNo === firstBomb && !save.seen.bombDemo) { save.seen.bombDemo = 1; bombDemo = true; }
    if (has.chain && !save.seen.chain) { save.seen.chain = 1; introQ.push({ title: "Chains", art: "chain", txt: "A chained ring won't move. Each piece you clear takes one link off the lock." }); }
    persist();
  }

  const ART = {
    rocket: '<svg viewBox="0 0 64 64"><use href="#i-rocket"/></svg>',
    hammer: '<svg viewBox="0 0 64 64"><use href="#i-hammer"/></svg>',
    stick: '<svg viewBox="0 0 150 110"><rect x="10" y="44" width="130" height="22" rx="11" fill="#2f9a22"/><rect x="10" y="44" width="130" height="16" rx="8" fill="#6ac53e"/><rect x="62" y="36" width="28" height="38" rx="7" fill="#c9ced5" stroke="#7f858e" stroke-width="2"/><path d="M118 24c10 8 14 16 14 16" stroke="#9a6a45" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M134 44l-4-12-8 8z" fill="#9a6a45"/></svg>',
    bomb: '<svg viewBox="0 0 150 110"><circle cx="60" cy="58" r="34" fill="none" stroke="#ae2f28" stroke-width="13"/><circle cx="60" cy="58" r="34" fill="none" stroke="#dd433e" stroke-width="9" stroke-dasharray="190 30"/><circle cx="96" cy="70" r="18" fill="#8a3c1e"/><path d="M96 58l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffd23f"/><path d="M98 52q6-8 12-6" stroke="#a8742c" stroke-width="3" fill="none"/><circle cx="111" cy="46" r="4" fill="#ffd23f"/></svg>',
    chain: '<svg viewBox="0 0 150 110"><circle cx="75" cy="55" r="40" fill="none" stroke="#ae2f28" stroke-width="13"/><circle cx="75" cy="55" r="40" fill="none" stroke="#dd433e" stroke-width="9"/><path d="M45 25L105 85M105 25L45 85" stroke="#8d939b" stroke-width="5" stroke-dasharray="8 4"/><rect x="58" y="46" width="34" height="30" rx="8" fill="#b5bbc3"/><path d="M64 46v-6a11 11 0 0 1 22 0v6" stroke="#7d838b" stroke-width="5" fill="none"/><text x="75" y="70" font-size="20" text-anchor="middle" fill="#3d3a44" font-family="Lilita One">3</text></svg>',
  };

  function nextIntro() {
    if (!introQ.length) { show("intro", false); maybeTutor(); return; }
    const it = introQ[0];
    if (!it.title) {                       // a lesson with no card in front of it
      introQ.shift(); show("intro", false);
      state = "play"; PLATFORM.gameplayStart();
      startCoach(it.coach);
      return;
    }
    $("introTitle").textContent = it.title;
    $("introArt").innerHTML = ART[it.art] || "";
    $("introTxt").textContent = it.txt;
    show("intro", true);
    state = "menu"; PLATFORM.gameplayStop();
  }
  function introDone() {
    const it = introQ.shift();
    SFX.click();
    if (it && it.coach) {
      show("intro", false); state = "play"; PLATFORM.gameplayStart();
      startCoach(it.coach);
      return;
    }
    if (!introQ.length) { show("intro", false); state = "play"; PLATFORM.gameplayStart(); maybeTutor(); }
    else nextIntro();
  }

  /* ---------------- booster lessons ----------------
     The level that unlocks a booster teaches it (as the original does on level
     4): the board goes dark, the button stays lit, a hand taps it, and the only
     way on is to press it - or the X, which still counts as taught
     (UI_UX_RULES 6.7). ⚠ No words: the owner, "a tutorial needs no text". The
     lesson's use is free. The hammer has a second step: the hand points at a
     piece to smash. */
  let coach = null;        // {kind, step}
  const COACH = {
    boom: { tool: "tBoom", icon: "#i-rocket", title: "Firework", what: "Blows up one random ring or bar." },
    hammer: { tool: "tHammer", icon: "#i-hammer", title: "Hammer", what: "Smashes the ring or bar you choose." },
  };
  function startCoach(kind) {
    const c = COACH[kind];
    coach = { kind, step: "press" };
    drag = null;
    $(c.tool).classList.add("teach");
    show("coachDim", true); show("coachSkip", true); show("coachHand", true);
    placeCoachHand();
  }
  function endCoach(taught) {
    if (!coach) return;
    const c = COACH[coach.kind];
    $(c.tool).classList.remove("teach");
    show("coachDim", false); show("coachSkip", false); show("coachHand", false);
    if (taught) { save.seen[coach.kind + "Taught"] = 1; persist(); }
    coach = null;
    if (introQ.length) nextIntro(); else maybeTutor();
  }
  function skipCoach() {
    SFX.click();
    if (coach && coach.kind === "hammer" && hammer) { hammer = false; setBanner(false); refreshTools(); }
    endCoach(true);
  }
  /* ⚠ UI_UX_RULES 6.6: the fingertip is the anchor, and the hand never leaves the
     screen. The buttons sit at the very bottom, so the hand comes from above. */
  function placeCoachHand() {
    if (!coach) return;
    const h = $("coachHand");
    let x, y, down;
    if (coach.step === "press") {
      const r = $(COACH[coach.kind].tool).getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + 6;
      down = r.bottom + 70 > innerHeight;
    } else {
      const p = coach.target;
      if (!p || p.removed) return;
      const c = centreOnTube(p), s = view.w2s(c[0], c[1]);
      x = s[0]; y = s[1];
      down = y + 76 > innerHeight;
    }
    // the fingertip sits at 30% / 6% of the image; rotate(180) flips it about that point
    h.classList.toggle("down", down);
    h.style.left = (x - 58 * 0.3) + "px";
    h.style.top = (y - 66 * 0.06) + "px";
  }
  function centreOnTube(p) {
    if (p.kind === "ring") { const a = p.ang + Math.PI; return [p.cx + Math.cos(a) * p.R, p.cy + Math.sin(a) * p.R]; }
    const s = p.body.shapes[0], k = Math.floor(s.n / 2);
    return [(s.x[k] + s.x[Math.max(0, k - 1)]) / 2, (s.y[k] + s.y[Math.max(0, k - 1)]) / 2];
  }

  /* ---------------- walkthroughs: a hand, no words ----------------
     Level 1: the hand moves along the arc of the ring the player can turn.
     The first board with bars: the hand slides along a bar, the way it comes out.
     The first board with a bomb (the owner: "a tutorial for the bomb, once"):
     the hand drags the piece that sets a bomb off soonest, the way it goes off.
     ⚠ No caption (the owner: "a tutorial needs no text"). The piece comes from
     the board, never a hard-coded id. */
  let stickDemo = false, bombDemo = false;
  function maybeTutor() {
    if (!game || tutor) return;
    if (levelNo === 1 && !save.seen.tut) {
      const p = game.pieces.find(q => !q.removed && !game.stuckReason(q) && game.clamps.some(c => c.active && c.target === q));
      if (p) { tutor = { p, t: 0 }; show("tut", true); }
      return;
    }
    if (stickDemo) {
      stickDemo = false;
      // the bar that travels furthest before it is stopped, and that way
      let best = null;
      for (const p of game.pieces) {
        if (p.removed || p.kind !== "stick" || game.stuckReason(p)) continue;
        for (const dir of [1, -1]) {
          const s0 = game.snapshot(), d = game.begin(p);
          const r = d ? d.moveTo(dir * 3) : { moved: 0 };
          game.restore(s0); game.events.length = 0;
          if (!best || Math.abs(r.moved) > best.go) best = { p, dir, go: Math.abs(r.moved) };
        }
      }
      if (best && best.go > 0.2) { tutor = { p: best.p, t: 0, a0: best.p.s, dir: best.dir, go: Math.min(1.6, best.go) }; show("tut", true); return; }
    }
    if (bombDemo) {
      bombDemo = false;
      const b = bombMove();
      if (b) { tutor = { p: b.p, t: 0, a0: b.p.kind === "ring" ? b.p.ang : b.p.s, dir: b.dir, go: b.go, bomb: true }; show("tut", true); }
    }
  }
  /* The drag that sets a bomb off soonest - a piece carrying one first.
     ⚠ Setting the bomb off at once must leave the board winnable. Checked with
     tools/solve.js solve(lv, budget, pre) on 10017, the first board with a bomb:
     either way round, still winnable. Re-check if the order of boards changes. */
  function bombMove() {
    let best = null;
    for (const p of game.pieces) {
      if (p.removed || game.stuckReason(p)) continue;
      for (const dir of [1, -1]) {
        const s0 = game.snapshot(), d = game.begin(p);
        if (!d) continue;
        const r = d.moveTo(d.pose() + dir * (p.kind === "ring" ? 2 * Math.PI : p.reach * 2 + 6));
        game.restore(s0); game.events.length = 0;
        if (!r.boom) continue;
        const cost = Math.abs(r.moved) + (p.bombGroup ? 0 : 100);
        if (!best || cost < best.cost) best = { p, dir, go: Math.abs(r.moved), cost };
      }
    }
    return best;
  }
  function endTutor() {
    if (!tutor) return;
    tutor = null; show("tut", false);
    save.seen.tut = 1; persist();
  }
  function placeHand(dt) {
    if (!tutor) return;
    tutor.t += dt;
    const p = tutor.p;
    const k = (tutor.t % 2.2) / 2.2;
    let s;
    if (tutor.bomb) {
      // from the bomb, the way that sets it off (shown a little further than the
      // bump itself, or a 0.2 rad turn would hardly move the hand)
      const bs = p.bombGroup && p.bombGroup.shapes[0];
      const o = bs ? [bs.x[0], bs.y[0]] : centreOnTube(p);
      if (p.kind === "ring") {
        const u = tutor.dir * Math.max(0.6, Math.min(1.6, tutor.go)) * Math.sin(k * Math.PI / 2);
        const c = Math.cos(u), sn = Math.sin(u), x = o[0] - p.cx, y = o[1] - p.cy;
        s = view.w2s(p.cx + x * c - y * sn, p.cy + x * sn + y * c);
      } else {
        const ax = p.axis || [1, 0];
        const dx = ax[0] * p.ca - ax[1] * p.sa, dy = ax[0] * p.sa + ax[1] * p.ca;
        const u = tutor.dir * Math.max(0.7, Math.min(1.6, tutor.go)) * Math.sin(k * Math.PI / 2);
        s = view.w2s(o[0] + dx * u, o[1] + dy * u);
      }
    } else if (p.kind === "stick") {
      // from the middle of the bar, out along its slide
      const c = centreOnTube(p), ax = p.axis || [1, 0];
      const dx = ax[0] * p.ca - ax[1] * p.sa, dy = ax[0] * p.sa + ax[1] * p.ca;
      const u = tutor.dir * tutor.go * Math.sin(k * Math.PI / 2);
      s = view.w2s(c[0] + dx * u, c[1] + dy * u);
    } else {
      const a = p.ang + Math.PI * 0.9 - Math.sin(k * Math.PI) * 1.2;
      s = view.w2s(p.cx + Math.cos(a) * p.R, p.cy + Math.sin(a) * p.R);
    }
    const h = $("hand");
    h.style.left = (s[0] - 16) + "px"; h.style.top = (s[1] - 4) + "px";
    h.style.opacity = k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 1;
  }

  /* ---------------- input ---------------- */
  function worldAt(e) { return view.s2w(e.clientX, e.clientY); }

  /* ---------------- zoom & pan (big boards only) ---------------- */
  const pointers = new Map();
  let pinch = null, pan = null;
  function refreshZoom() {
    const can = state === "play" && view.canZoom();
    show("zOut", can); show("zIn", can);
    $("zOut").disabled = view.atMin(); $("zIn").disabled = view.atMax();
  }
  function zoomBy(f, sx, sy) { view.zoomAt(f, sx, sy); refreshZoom(); }
  /* UI_UX_RULES 2.10: the first press of a zoom button teaches the shortcut,
     after half a second, for the device in hand */
  function zoomButton(f) {
    SFX.click(); zoomBy(f);
    if (!save.seen.zoomTip) {
      save.seen.zoomTip = 1; persist();
      const touch = window.matchMedia && matchMedia("(pointer:coarse)").matches;
      setTimeout(() => toast(touch ? "Tip: pinch with two fingers to zoom" : "Tip: scroll the mouse wheel to zoom"), 500);
    }
  }

  function onDown(e) {
    SFX.unlock();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state !== "play") return;
    if (pointers.size === 2 && view.canZoom()) {
      drag = null; pan = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (drag || busyBoost || appear < 1 || pointers.size > 1) return;
    if (coach && coach.step === "press") return;
    const w = worldAt(e);
    const slop = Math.max(0.45, 26 / view.sc);
    const p = game.pick(w[0], w[1], slop);
    if (!p) {
      if (!view.atMin()) pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (hammer) { useHammer(p); return; }
    if (coach) return;
    const why = game.stuckReason(p);
    if (why) {
      shakeFx = { p, t: 0 };
      SFX.nope(); buzz(15);
      if (why === "chained") toast("Clear " + p.lock + " more piece" + (p.lock > 1 ? "s" : "") + " to break the chain");
      return;
    }
    const d = game.begin(p);
    if (!d) return;
    drag = { p, d, id: e.pointerId, target: d.pose(), travel: 0 };
    if (p.kind === "ring") drag.last = Math.atan2(w[1] - p.cy, w[0] - p.cx);
    else { drag.u = game.stickGrab(p, w[0], w[1]); drag.lw = w; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browser */ }
  }
  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch.d > 0) zoomBy(d / pinch.d, mx, my);
      view.panBy(mx - pinch.mx, my - pinch.my);
      pinch.d = d; pinch.mx = mx; pinch.my = my;
      return;
    }
    if (pan && e.pointerId === pan.id) { view.panBy(e.clientX - pan.x, e.clientY - pan.y); pan.x = e.clientX; pan.y = e.clientY; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const w = worldAt(e), p = drag.p;
    if (p.kind === "ring") {
      const a = Math.atan2(w[1] - p.cy, w[0] - p.cx);
      let da = a - drag.last;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      drag.last = a;
      // a finger near the centre would spin the ring wildly
      if (Math.hypot(w[0] - p.cx, w[1] - p.cy) > p.R * 0.3) drag.target += da;
    } else {
      const t = game.stickTangent(p, drag.u);
      drag.target += (w[0] - drag.lw[0]) * t[0] + (w[1] - drag.lw[1]) * t[1];
      drag.lw = w;
    }
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pan && e.pointerId === pan.id) pan = null;
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
  }
  function onWheel(e) {
    if (state !== "play" || !view.canZoom()) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }

  /* one physics step of the drag, once a frame */
  function stepDrag() {
    if (!drag) return;
    const d = drag.d, p = drag.p;
    if (p.removed) { drag = null; return; }
    const before = d.pose();
    const r = d.moveTo(drag.target);
    if (p.kind === "stick" && Math.abs(r.moved) > 1e-6) p._dir = r.moved > 0 ? 1 : -1;
    drag.travel += Math.abs(r.moved) * (p.kind === "ring" ? p.R : 1);
    if (drag.travel > 0.45) { drag.travel = 0; SFX.tick(); }
    if (r.blocked && !r.boom) {
      // re-base, so a finger that turns back moves the piece back at once
      drag.target = d.pose();
      if (Math.abs(d.pose() - before) < 1e-6) { SFX.bump(); } else SFX.clink();
      // a small flash where they meet (render3d.js / render.js find the spot and throttle it)
      if (view.clang) view.clang(game, p, Math.abs(r.moved));
    }
    if (r.boom || p.removed) drag = null;
    // a demo ends once the player has moved its piece a fair way (level 1 ends on the release)
    if (tutor && tutor.p === p && tutor.a0 != null && Math.abs((p.kind === "ring" ? p.ang : p.s) - tutor.a0) > 0.3) endTutor();
  }

  /* ---------------- what happened ---------------- */
  function digest() {
    if (!game) return;
    game.sweep();
    const ev = game.events.splice(0);
    let goneNow = 0;
    const since = clock - (lastGone > -9 ? lastGone : levelT0);
    const goneList = [];
    for (const e of ev) {
      if (e.type === "release") { SFX.latch(); buzz(8); if (tutor) endTutor(); }
      else if (e.type === "grip") { SFX.latch(); buzz(6); }
      else if (e.type === "boom") {
        if (tutor && tutor.bomb) endTutor();
        view.kaboom(e.x, e.y); SFX.boom(); buzz(40);
        shakeScreen = 0.35;
      } else if (e.type === "gone") {
        const p = e.piece;
        if (p.kind === "stick" && e.cause === "free") {
          const t = game.stickTangent(p, 0), k = p._dir || 1;
          view.flyout(p, t[0] * k, t[1] * k);
        } else view.burst(p, e.cause !== "free");
        goneNow++;
        if (clock - lastGone < COMBO_WINDOW) combo++; else combo = 0;
        lastGone = clock;
        goneList.push(p);
        SFX.pop(combo);
        buzz(12);
      }
    }
    if (goneNow) praise(goneList, since);
    if (state === "play" && game.won() && winT < 0) { winT = 0; drag = null; hammer = false; setBanner(false); }
  }
  let shakeScreen = 0;

  function praise(list, since) {
    const last = game.left() === 0;
    const hard = list.some(p => (p._links || 0) >= PRAISE_HARD) || since >= PRAISE_SLOW;
    if (!last && !hard && Math.random() >= PRAISE_CHANCE) return;
    const p = list[list.length - 1], c = centre(p);
    let word, k;
    if (last) { word = PRAISE_LAST[Math.floor(Math.random() * PRAISE_LAST.length)]; k = 2; }
    else { k = Math.min(Math.max(combo, hard ? 1 : 0), PRAISE.length - 1); word = PRAISE[k]; }
    view.say(word, c[0], c[1] + 1, PRAISE_COL[Math.min(k, PRAISE_COL.length - 1)]);
  }

  function centre(p) {
    if (p.kind === "ring") return [p.cx, p.cy];
    const s = p.body.shapes[0], k = Math.floor(s.n / 2);
    return [s.x[k], s.y[k]];
  }

  /* ---------------- boosters ----------------
     Firework: one random ring or bar goes. Hammer: the player picks the one.
     ⚠ The count comes off when the piece actually breaks, not on the tap
     (UI_UX_RULES 6.3), and an armed hammer can be put down for free. */
  function refreshTools() {
    tool("tBoom", "bBoom", "boom", levelNo < BOOM_UNLOCK, BOOM_UNLOCK);
    tool("tHammer", "bHammer", "hammer", levelNo < HAMMER_UNLOCK, HAMMER_UNLOCK);
    $("tHammer").classList.toggle("armed", hammer);
  }
  /* UI_UX_RULES 2.5 / 6.2: one badge - red with the count while there are
     some, gold with the price once there are none. A price the purse cannot
     meet (and no video to watch instead) greys the button before it is tapped. */
  function tool(id, bid, kind, locked, at) {
    const n = save[kind], b = $(bid), t = $(id);
    t.classList.toggle("locked", locked);
    t.classList.remove("poor");
    b.className = "badge font";
    if (locked) { b.classList.add("lock"); b.textContent = "Lv" + at; }
    else if (n > 0) b.textContent = n;
    else {
      b.classList.add("price");
      b.innerHTML = '<svg viewBox="0 0 32 32"><use href="#i-coin"/></svg>' + PRICE[kind];
      if (save.gold < PRICE[kind] && !PLATFORM.canReward()) t.classList.add("poor");
    }
  }
  /* Out of a booster: the price was on its badge already; this sheet shows the
     purse, buys one, and always has a free way out (UI_UX_RULES 3.8). */
  let buying = null;
  function offer(kind) {
    return new Promise(done => {
      const price = PRICE[kind], can = save.gold >= price;
      $("buyTitle").textContent = kind === "boom" ? "Firework" : "Hammer";
      $("buyIcon").innerHTML = '<use href="' + COACH[kind].icon + '"/>';
      $("buyHave").textContent = save.gold;
      $("buyPrice").textContent = price;
      $("buyGold").disabled = !can;
      show("buyNeed", !can);
      show("buyAd", PLATFORM.canReward());
      buying = { kind, done, was: state };
      state = "menu"; PLATFORM.gameplayStop();
      show("buy", true);
    });
  }
  function closeBuy(ok) {
    if (!buying) return;
    const b = buying; buying = null;
    show("buy", false);
    state = b.was;
    if (state === "play") PLATFORM.gameplayStart();
    b.done(ok);
  }
  async function earn(kind) {
    if (!PLATFORM.canReward()) {
      toast("No " + (kind === "boom" ? "fireworks" : "hammers") + " left - win levels for gold");
      return false;
    }
    adPlaying = true; PLATFORM.gameplayStop();
    const ok = await PLATFORM.rewarded();
    adPlaying = false; if (state === "play") PLATFORM.gameplayStart();
    if (ok) { save[kind] += 1; persist(); refreshTools(); toast("+1 " + (kind === "boom" ? "firework" : "hammer")); }
    return ok;
  }
  function targets() {
    const alive = game.pieces.filter(p => !p.removed);
    const sel = alive.filter(p => p.rnd);
    return sel.length ? sel : alive;
  }
  async function onBoom() {
    SFX.unlock();
    if (state !== "play" || busyBoost || winT >= 0) return;
    if (levelNo < BOOM_UNLOCK) { toast("Fireworks unlock at level " + BOOM_UNLOCK); return; }
    const lesson = coach && coach.kind === "boom";
    if (coach && !lesson) return;
    if (!lesson && save.boom <= 0 && !(await offer("boom"))) return;
    if (state !== "play" || busyBoost || winT >= 0) return;
    const list = targets();
    if (!list.length) return;
    const p = list[Math.floor(Math.random() * list.length)];
    if (hammer) { hammer = false; setBanner(false); refreshTools(); }
    busyBoost = true; drag = null;
    if (lesson) { $("tBoom").classList.remove("teach"); show("coachDim", false); show("coachSkip", false); show("coachHand", false); }
    const r = $("tBoom").getBoundingClientRect();
    SFX.whoosh();
    view.rocket([r.left + r.width / 2, r.top + r.height / 2], centre(p), () => {
      busyBoost = false;
      if (p.removed || !game || state !== "play") { if (lesson) endCoach(true); return; }
      if (!lesson) { save.boom -= 1; persist(); }
      refreshTools();
      if (lesson) endCoach(true);
      const c = centre(p);
      view.kaboom(c[0], c[1]); SFX.boom(); buzz(40); shakeScreen = 0.3;
      game.smash(p, "boom");
      track("booster", { kind: "boom", level: levelNo });
    });
  }
  async function onHammer() {
    SFX.unlock();
    if (state !== "play" || busyBoost || winT >= 0) return;
    if (levelNo < HAMMER_UNLOCK) { toast("The hammer unlocks at level " + HAMMER_UNLOCK); return; }
    const lesson = coach && coach.kind === "hammer";
    if (coach && !lesson) return;
    if (lesson && coach.step === "target") return;     // already armed for the lesson
    if (hammer) { hammer = false; setBanner(false); refreshTools(); return; }
    if (!lesson && save.hammer <= 0 && !(await offer("hammer"))) return;
    if (state !== "play" || busyBoost || winT >= 0) return;
    hammer = true; drag = null;
    refreshTools();
    if (lesson) {
      // step 2: the board comes back, the hand points at a piece to smash
      coach.step = "target";
      coach.target = targets().find(p => game.stuckReason(p)) || targets()[0];
      $("tHammer").classList.remove("teach");
      show("coachDim", false);
      placeCoachHand();
    } else setBanner(true, "Tap a ring or bar to smash it");
  }
  function useHammer(p) {
    hammer = false; setBanner(false);
    const lesson = coach && coach.kind === "hammer";
    if (!lesson) { save.hammer -= 1; persist(); }
    refreshTools();
    if (lesson) endCoach(true);
    const c = centre(p);
    view.kaboom(c[0], c[1]); SFX.smash(); buzz(35); shakeScreen = 0.25;
    game.smash(p, "hammer");
    track("booster", { kind: "hammer", level: levelNo });
  }
  function setBanner(on, txt) {
    if (txt) $("bannerTxt").textContent = txt;
    show("banner", on);
  }

  /* ---------------- win ---------------- */
  function showWin() {
    state = "won";
    PLATFORM.gameplayStop(); PLATFORM.happytime();
    save.level = Math.max(save.level, levelNo + 1);
    save.played += 1;
    save.gold += WIN_GOLD; hud = save.gold;
    persist();
    const pill = $("score"); pill.classList.remove("pop"); void pill.offsetWidth; pill.classList.add("pop");
    track("level_end", { level: levelNo, id: game.lv.id, result: "win", gold: save.gold });
    $("winTitle").textContent = WIN_TITLE;
    $("winNext").innerHTML = "<small>" + (isHard(levelNo + 1) ? "HARD" : "LEVEL") + "</small> " + (levelNo + 1);
    $("winNext").classList.toggle("hard", isHard(levelNo + 1));
    featMeter(levelNo);
    show("win", true);
    SFX.win();
    // the gold counts up on the card, while the pill above counts up to the purse
    const el = $("winGoldN"), t0 = performance.now();
    (function up() {
      const k = Math.min(1, (performance.now() - t0) / 700);
      el.textContent = "+" + Math.round(WIN_GOLD * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(up);
    })();
  }
  /* The feature meter on the win card: Seat Jam's "30% TO NEXT FEATURE" (the owner:
     "how many levels until something new opens"). The new things are the two
     boosters and the first board with a bar, a bomb, a chain - read off the
     shipped order, so a reordered campaign moves them with it. */
  const FEATURES = (function () {
    const first = test => { const i = LEVELS.findIndex(test); return i < 0 ? 0 : i + 1; };
    return [
      { level: BOOM_UNLOCK, name: "Firework", icon: "#i-rocket" },
      { level: HAMMER_UNLOCK, name: "Hammer", icon: "#i-hammer" },
      { level: first(l => l.sticks.length > 0), name: "Bars", icon: "#i-bar" },
      { level: first(l => l.rings.some(r => r.bomb) || l.sticks.some(t => t.bomb) || (l.bombs && l.bombs.length > 0)), name: "Bombs", icon: "#i-bomb" },
      { level: first(l => l.rings.some(r => r.lock > 0)), name: "Chains", icon: "#i-chain" },
    ].filter(f => f.level > 1).sort((a, b) => a.level - b.level);
  })();
  function featMeter(cleared) {
    const next = FEATURES.find(f => f.level > cleared);
    show("winFeat", !!next);
    if (!next) return;
    const prev = FEATURES.filter(f => f.level < next.level).pop(), from = prev ? prev.level : 1;
    const span = Math.max(1, next.level - from), left = next.level - 1 - cleared;
    const pct = k => Math.max(0, Math.min(100, 100 * (k - from + 1) / span));
    $("winFeatIc").innerHTML = '<use href="' + next.icon + '"/>';
    $("winFeatTxt").textContent = left <= 0 ? "New next level: " + next.name : left + (left > 1 ? " levels" : " level") + " to " + next.name;
    // runs from where the player was to where they are now (Seat Jam: a bar that moves is the reward)
    const fill = $("winFeatFill");
    fill.style.transition = "none"; fill.style.width = pct(cleared - 1) + "%"; void fill.offsetWidth;
    fill.style.transition = ""; setTimeout(() => { fill.style.width = pct(cleared) + "%"; }, 350);
    $("winFeatBadge").classList.toggle("hit", left <= 0);
  }

  /* ⚠ No gift every few levels (the owner took it out): boosters come from the
     ones each unlock gives, and after that from gold. */
  function onNext() {
    SFX.click();
    show("win", false);
    startLevel(levelNo + 1);
  }

  /* ---------------- home ---------------- */
  function goHome() {
    state = "home";
    drag = null; hammer = false; endTutorSilently();
    PLATFORM.gameplayStop();
    show("hud", false); show("win", false); show("settings", false);
    show("zOut", false); show("zIn", false);
    show("home", true);
    $("homeLevel").textContent = save.level;
    $("playBtn").classList.toggle("hard", isHard(save.level));
    $("homeGoldN").textContent = save.gold;
    view.parts.length = 0; view.texts.length = 0;
    // Home always stands on the cream ground: its sky and clouds are drawn for it
    if (view.setTheme) view.setTheme(1);
  }
  function endTutorSilently() { tutor = null; show("tut", false); }

  /* ---------------- settings ---------------- */
  let wasState = null;
  function openSettings() {
    SFX.click();
    wasState = state;
    if (state === "play") { state = "menu"; PLATFORM.gameplayStop(); }
    $("swSound").classList.toggle("on", save.sound);
    $("swVib").classList.toggle("on", save.vib);
    $("devLevel").value = levelNo;
    show("setHome", wasState === "play" || wasState === "menu");
    show("settings", true);
  }
  function closeSettings() {
    show("settings", false);
    if (wasState === "play") { state = "play"; PLATFORM.gameplayStart(); }
  }

  /* ---------------- telemetry ----------------
     ⚠ Not wired yet: no Firebase project exists for this game, and creating one
     is the owner's call. Every call site is already in place. */
  function track(name, data) { /* nothing is sent */ void name; void data; }

  /* ---------------- frame ---------------- */
  let lastT = 0;
  function frame(t) {
    const dt = Math.min(1 / 30, (t - lastT) / 1000 || 0);
    lastT = t; clock += dt;
    if (state === "home") {
      // Home's rings and title turn in 3D (render3d.js home()) in the page's two boxes;
      // the 2D view has none, and the page shows its flat copies instead
      if (view.home) view.home(dt, $("homeTitle").getBoundingClientRect(), $("homeHero").getBoundingClientRect());
    } else if (game) {
      if (appear < 1) appear = Math.min(1, appear + dt / 0.45);
      if (state === "play") { stepDrag(); digest(); }
      if (shakeFx) { shakeFx.t += dt; if (shakeFx.t > 0.4) shakeFx = null; }
      if (winT >= 0 && state === "play") {
        winT += dt;
        if (winT > 0.9 && !view.busy()) showWin();
      }
      if (shown !== hud) {
        shown = shown < hud ? Math.min(hud, shown + Math.max(5, Math.ceil((hud - shown) * 0.08))) : hud;
        $("score").textContent = shown;
      }
      view.tick(dt);
      const ctx = view.ctx;
      let sx = 0;
      if (shakeScreen > 0) { shakeScreen = Math.max(0, shakeScreen - dt); sx = Math.sin(clock * 70) * 5 * shakeScreen; }
      view.cx += sx;
      view.draw(game, { drag: drag && drag.p, shake: shakeFx, hammer, appear });
      view.cx -= sx;
      void ctx;
      placeHand(dt);
      if (coach && coach.step === "target") placeCoachHand();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  function wire() {
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("wheel", onWheel, { passive: false });
    $("zIn").onclick = () => zoomButton(1.35);
    $("zOut").onclick = () => zoomButton(1 / 1.35);
    window.addEventListener("resize", resize);
    $("playBtn").onclick = () => { SFX.unlock(); SFX.click(); startLevel(save.level); };
    $("homeSet").onclick = openSettings;
    $("btnSet").onclick = openSettings;
    $("btnRestart").onclick = () => { SFX.click(); if (state === "play") startLevel(levelNo); };
    $("tBoom").onclick = onBoom;
    $("tHammer").onclick = onHammer;
    $("bannerX").onclick = () => { hammer = false; setBanner(false); refreshTools(); };
    $("winNext").onclick = onNext;
    $("introOk").onclick = introDone;
    $("buyGold").onclick = () => {
      if (!buying) return;
      const k = buying.kind;
      if (save.gold < PRICE[k]) return;
      save.gold -= PRICE[k]; save[k] += 1; persist();
      shown = hud = save.gold; $("score").textContent = save.gold;
      SFX.click(); refreshTools();
      closeBuy(true);
    };
    $("buyAd").onclick = async () => { if (!buying) return; show("buy", false); closeBuy(await earn(buying.kind)); };
    $("buyNo").onclick = () => { SFX.click(); closeBuy(false); };
    $("coachSkip").onclick = skipCoach;
    window.addEventListener("resize", () => { if (coach) placeCoachHand(); });
    $("swSound").onclick = () => { save.sound = !save.sound; persist(); $("swSound").classList.toggle("on", save.sound); SFX.click(); };
    $("swVib").onclick = () => { save.vib = !save.vib; persist(); $("swVib").classList.toggle("on", save.vib); buzz(20); };
    $("setResume").onclick = () => { SFX.click(); closeSettings(); };
    $("setHome").onclick = () => { SFX.click(); show("settings", false); goHome(); };
    $("setPrivacy").onclick = () => show("privacy", true);
    $("privacyOk").onclick = () => show("privacy", false);
    $("devGo").onclick = () => {
      const n = parseInt($("devLevel").value, 10);
      if (!Number.isFinite(n) || n < 1) return;
      show("settings", false); startLevel(n);
    };
    $("setReset").onclick = () => { SFX.click(); show("confirm", true); };
    $("confNo").onclick = () => show("confirm", false);
    // a wiped save is a new player: straight into level 1, walkthrough and all
    $("confYes").onclick = () => { SFX.click(); wipe(); show("confirm", false); show("settings", false); startLevel(1); };
    document.addEventListener("visibilitychange", () => { if (document.hidden) drag = null; });
    // ⚠ iPhone Safari ignores user-scalable=no: its own pinch would zoom the page
    // under the game. And it only lets audio start from a touchend or click.
    document.addEventListener("gesturestart", e => e.preventDefault());
    document.addEventListener("dblclick", e => e.preventDefault());
    const unlockOnce = () => { SFX.unlock(); };
    document.addEventListener("touchend", unlockOnce, { passive: true });
    document.addEventListener("click", unlockOnce);
  }

  /* The 3D view (render3d.js) when the browser has WebGL; the 2D one otherwise,
     or with ?2d in the address to compare. Same contract, game.js never asks. */
  function makeView() {
    let flat = false;
    try { flat = new URLSearchParams(location.search).has("2d"); } catch (e) { /* old browser */ }
    if (!flat && window.RRView3D) {
      try { return new RRView3D.View(cv); } catch (e) { console.warn("3D view unavailable, drawing in 2D:", e && e.message); }
    }
    document.documentElement.classList.add("flat");
    return new RRView.View(cv);
  }

  async function boot() {
    view = makeView();
    PLATFORM.loadingStart();
    await PLATFORM.init();          // ⚠ nothing reads the save before this
    load();
    devLinks();
    wire();
    resize();
    PLATFORM.loadingStop();
    $("boot").classList.add("gone");
    window.__rr = { get game() { return game; }, get view() { return view; }, start: startLevel, home: goHome, save: () => save, LEVELS };
    // a new player goes straight into level 1: one click less to gameplay
    if (save.level === 1 && !save.played) startLevel(1);
    else goHome();
    requestAnimationFrame(frame);
  }
  if (!N) { document.body.insertAdjacentHTML("beforeend", "<p style='position:fixed;top:40%;width:100%;text-align:center'>No levels in this build.</p>"); return; }
  boot();
})();
