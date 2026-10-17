const RR = require("../src/engine.js");
const L = require("../src/lv/levels.json");
for (const lv of L) {
  const g = new RR.Game(lv);
  for (const c of g.mismatch) {
    const t = c.trig.shapes[0];
    const cx = t.x.reduce((a, b) => a + b) / t.n, cy = t.y.reduce((a, b) => a + b) / t.n;
    const T = c.target;
    let info;
    if (T.kind === "ring") {
      const dr = Math.hypot(cx - T.cx, cy - T.cy) - T.R;
      let ang = Math.atan2(cy - T.cy, cx - T.cx) - T.ang;
      ang = ((ang * 180 / Math.PI) % 360 + 360) % 360; if (ang > 180) ang -= 360;
      info = `ring R=${T.R} gap=${T.gap} radialOff=${dr.toFixed(3)} headAngleFromGapCentre=${ang.toFixed(1)}`;
    } else {
      const s = T.body.shapes[0]; let d = 1e9;
      for (let k = 0; k < s.n - 1; k++) {
        const ax = s.x[k], ay = s.y[k], bx = s.x[k + 1], by = s.y[k + 1];
        const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        let u = L2 ? ((cx - ax) * vx + (cy - ay) * vy) / L2 : 0; u = Math.max(0, Math.min(1, u));
        d = Math.min(d, Math.hypot(cx - ax - vx * u, cy - ay - vy * u));
      }
      info = `stick dist(headCentre, centreline)=${d.toFixed(3)}`;
    }
    console.log(lv.id, c.owner.id, c.pin.k, "->", T.id, info);
  }
}
