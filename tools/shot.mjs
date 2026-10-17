// Drive the built game (dist/index.html) in a headless Chrome and bring back a
// screenshot plus whatever the console said. Raw CDP over Node's own WebSocket:
// no Playwright download, just a Chromium already on the machine.
//
//   node tools/shot.mjs                          home screen, 390x844
//   node tools/shot.mjs --level 10               start level 10, screenshot
//   node tools/shot.mjs --level 5 --play 3       play the first 3 moves of the solver's line
//   node tools/shot.mjs --level 1 --drag 300,420,300,520   a real pointer drag (css px)
//   node tools/shot.mjs --size 1915x940 --dpr 2 --out wide
//   node tools/shot.mjs --eval "__rr.start(4)"   any script, then the shot
//
// ⚠ Chrome runs with its own throw-away profile and is stopped by its own pid.
// Never `taskkill /IM chrome.exe`: that closes the user's browser too.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(HERE, ".shots");
const PORT = Number(process.env.RR_CDP_PORT ?? 9334);
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v != null && !v.startsWith("--") ? v : true;
};
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map(); this.logs = [];
    ws.addEventListener("message", e => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) { this.waiting.get(m.id)(m); this.waiting.delete(m.id); }
      if (m.method === "Runtime.consoleAPICalled") this.logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description).join(" "));
      if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; this.logs.push(`[error] ${d.exception?.description ?? d.text}`); }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise(res => { this.waiting.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) this.logs.push("[eval error] " + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
    return r.result?.result?.value;
  }
}

async function main() {
  const [w, h] = String(arg("size", "390x844")).split("x").map(Number);
  const dpr = Number(arg("dpr", 1));
  const name = String(arg("out", "shot"));
  const exe = BROWSERS.find(existsSync);
  if (!exe) throw new Error("no Chrome or Edge found");
  const profile = mkdtempSync(join(tmpdir(), "rr-cdp-"));
  const chrome = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new",
    "--no-first-run", "--no-default-browser-check", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files",
    `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(150); }
    }
    const page = targets.find(t => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener("open", r));
    const cdp = new Cdp(ws);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < h });
    const q = arg("query", "");
    const url = pathToFileURL(join(ROOT, "dist", "index.html")).href + (q ? "?" + q : "");
    await cdp.send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await cdp.eval("!!window.__rr")) break; await sleep(100); }
    await sleep(900);   // the board fades in for 0.45 s and takes no input meanwhile
    if (arg("fresh", false)) { await cdp.eval("localStorage.clear(); location.reload()"); await sleep(800); }
    if (arg("seen", false)) await cdp.eval("Object.assign(__rr.save().seen,{tut:1,boom:1,hammer:1,stick:1,bomb:1,chain:1,boomTaught:1,hammerTaught:1,stickDemo:1,bombDemo:1})");
    const lvl = arg("level", null);
    // ⚠ Headless Chrome draws the 3D view on the CPU (SwiftShader) at 3-6 fps
    // while it animates, and game.js caps a frame at 1/30 s, so the 0.45 s
    // fade-in takes 2-4 s here. A real pointer sent before that is ignored.
    const pointer = arg("drag", false) || arg("tdrag", false) || arg("click", false);
    if (lvl) { await cdp.eval(`__rr.start(${Number(lvl)})`); await sleep(pointer ? 3500 : 900); }
    const ev = arg("eval", null);
    if (ev) { const v = await cdp.eval(String(ev)); if (v !== undefined) console.log("eval:", JSON.stringify(v)); await sleep(400); }
    const play = arg("play", null);
    if (play) {
      // the solver's winning line for this board, played through the engine
      const sol = JSON.parse(readFileSync(join(ROOT, "src", "lv", "solutions.json"), "utf8"));
      const id = await cdp.eval("__rr.game.lv.id");
      const line = (sol[id] || []).slice(0, play === true ? 999 : Number(play));
      for (const m of line) {
        await cdp.eval(`(function(){const g=__rr.game,p=g.byId[${JSON.stringify(m.id)}];if(!p||p.removed)return;const d=g.begin(p);if(d)d.moveTo(${m.pose});})()`);
        await sleep(Number(arg("gap", 350)));
      }
      await sleep(600);
    }
    const after = arg("after", null);
    if (after) { await sleep(1800); const v = await cdp.eval(String(after)); if (v !== undefined) console.log("after:", JSON.stringify(v)); await sleep(500); }
    const drag = arg("drag", null);
    if (drag) {
      const [x1, y1, x2, y2] = String(drag).split(",").map(Number);
      const steps = 24;
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, button: "left", buttons: 1 });
        await sleep(16);
      }
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
      await sleep(500);
    }
    const tdrag = arg("tdrag", null);
    if (tdrag) {
      // a finger, not a mouse: touch events, the way a phone sends them
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      const pts = String(tdrag).split(",").map(Number);
      const tp = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(pts[0], pts[1]) });
      for (let k = 2; k + 1 < pts.length; k += 2) {
        const [ax, ay, bx, by] = [pts[k - 2], pts[k - 1], pts[k], pts[k + 1]];
        for (let i = 1; i <= 12; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(ax + (bx - ax) * i / 12, ay + (by - ay) * i / 12) });
          await sleep(16);
        }
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(600);
    }
    const click = arg("click", null);
    if (click) {
      const [x, y] = String(click).split(",").map(Number);
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(600);
    }
    await sleep(Number(arg("wait", 300)));
    const state = await cdp.eval("JSON.stringify({level: window.__rr && __rr.game && __rr.game.lv.id, left: window.__rr && __rr.game && __rr.game.left()})");
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, name + ".png");
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log("state:", state);
    console.log(cdp.logs.length ? cdp.logs.join("\n") : "(console clean)");
    console.log("->", file);
    ws.close();
  } finally {
    chrome.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
