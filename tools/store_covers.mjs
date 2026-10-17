// The store pictures CrazyGames asks for, rendered from the game's own Home
// (render3d.js home(): the 3D title over the three pinned rings), not painted:
//
//   node tools/store_covers.mjs        -> store/cover-1920x1080.png, cover-800x1200.png, cover-800x800.png
//
// Reads dist/index.html: build first (cd src && python build.py). The buttons
// are hidden and the two boxes laid out for each shape. Same headless Chrome as
// shot.mjs - its own throw-away profile, stopped by its own pid, never
// `taskkill /IM chrome.exe` (that closes the user's browser too).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store");
const PORT = 9336;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);

// each shape: the title box and the rings box, as CSS over #home
const SHAPES = [
  { w: 1920, h: 1080, css: `#home{display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:70px 90px}
     #homeHero{grid-column:1;grid-row:1;height:900px}#homeTitle{grid-column:2;grid-row:1;width:820px;justify-self:center}` },
  { w: 800, h: 1200, css: `#home{padding:90px 40px 70px}#homeTitle{width:700px}#homeHero{min-height:0}` },
  { w: 800, h: 800, css: `#home{padding:46px 40px 30px}#homeTitle{width:560px}#homeHero{min-height:0}` },
];

async function shoot(shape) {
  const profile = mkdtempSync(join(tmpdir(), "rr-cover-"));
  const chrome = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run",
    "--no-default-browser-check", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--allow-file-access-from-files",
    `--window-size=${shape.w},${shape.h}`, "about:blank"], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { await sleep(150); } }
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener("open", r));
    let id = 0; const wait = new Map();
    ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
    const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = expr => send("Runtime.evaluate", { expression: expr, returnByValue: true });
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: shape.w, height: shape.h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(join(ROOT, "dist", "index.html")).href });
    for (let i = 0; i < 100; i++) { const r = await evaluate("!!window.__rr"); if (r.result?.result?.value) break; await sleep(150); }
    await sleep(1500);
    await evaluate(`__rr.home(); document.getElementById("homeLow").hidden = true;
      const st = document.createElement("style"); st.textContent = ${JSON.stringify(shape.css)}; document.head.appendChild(st);`);
    await sleep(3500);       // SwiftShader draws a few frames a second at this size
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT, `cover-${shape.w}x${shape.h}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log("->", file);
    ws.close();
  } finally {
    chrome.kill();
  }
}

if (!exe) throw new Error("no Chrome or Edge found");
mkdirSync(OUT, { recursive: true });
for (const s of SHAPES) await shoot(s);
