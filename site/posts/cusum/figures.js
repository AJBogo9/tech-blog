// figures.js
// The figures of the theory section: Ville's inequality on simulated normal running, the
// evidence and the CUSUM on the demo's residual, and the delay of each detector against its
// false-alarm rate.
// Drawn by the {js} cells in index.tmd via:
//   const fig = await import("./figures.js");

import { residual, rng } from "./line-model.js";
import { llr, cusumPath, firstCrossing, cusumThreshold, cusumDelay, shewhartLimit, shewhartArl, firstOrderDelay, normalRunningEvidence, evidenceMaxima } from "./detection.js";

const NS = "http://www.w3.org/2000/svg";
const NORMAL = "steelblue", WORN = "darkorange", LIMIT = "#d64545";
export const YEAR = 8760; // hours: the false-alarm budget, one a year on average

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

function text(parent, x, y, str, attrs = {}) {
  const t = el("text", { x, y, "font-size": 14, fill: "var(--tali-muted)", ...attrs }, parent);
  t.textContent = str;
  return t;
}

function svgRoot(container, w, h, label) {
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", role: "img", "aria-label": label });
  svg.style.cssText = "display:block;max-width:100%;height:auto;font-family:inherit;color:var(--tali-fg);";
  container.replaceChildren(svg);
  return svg;
}

function polyline(parent, pts, attrs) {
  return el("polyline", { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), fill: "none", ...attrs }, parent);
}

// a panel over the hours [t0, t1] with a value range [lo, hi]; values outside are clipped
function panel(svg, box, t0, t1, lo, hi) {
  const id = `clip${Math.random().toString(36).slice(2)}`;
  const cp = el("clipPath", { id }, svg);
  el("rect", { x: box.x, y: box.y, width: box.w, height: box.h }, cp);
  el("rect", { x: box.x, y: box.y, width: box.w, height: box.h, fill: "none", stroke: "var(--tali-border)" }, svg);
  const g = el("g", { "clip-path": `url(#${id})` }, svg);
  return {
    g,
    X: (t) => box.x + ((t - t0) / (t1 - t0)) * box.w,
    Y: (v) => box.y + box.h * (1 - (v - lo) / (hi - lo)),
  };
}

function dayTicks(svg, P, box, t0, t1) {
  for (let day = Math.ceil(t0 / 24); day * 24 <= t1; day++) {
    if (day % 2) continue;
    text(svg, P.X(day * 24), box.y + box.h + 18, `day ${day}`, { "text-anchor": "middle", "font-size": 12 });
  }
}

function changeLine(svg, P, box, t) {
  el("line", { x1: P.X(t), x2: P.X(t), y1: box.y, y2: box.y + box.h, stroke: WORN, "stroke-opacity": 0.6 }, svg);
}

// top: the summed log-likelihood ratio and its running minimum; bottom: their gap, the CUSUM
export function drawEvidence(container, data, delta = 1) {
  const p = data.params, y = residual(data), t0 = 600, t1 = 800;
  const s = y.map((v) => llr(v, delta));
  const S = [], runMin = [];
  let acc = 0, m = 0;
  for (const v of s) { acc += v; m = Math.min(m, acc); S.push(acc); runMin.push(m); }
  const W = cusumPath(y, delta), h = delta * cusumThreshold(YEAR, delta / 2);
  const alarm = firstCrossing(W, h, p.faultStart);
  const W0 = 640, H0 = 430, left = 64, right = 12;
  const svg = svgRoot(container, W0, H0, "The summed log-likelihood ratio drifts down before the wear and climbs after it; the CUSUM, its height above its running minimum, crosses the threshold soon after the wear starts");
  const base = S[t0];
  const top = { x: left, y: 12, w: W0 - left - right, h: 190 }, bot = { x: left, y: 250, w: W0 - left - right, h: 140 };
  const A = panel(svg, top, t0, t1, -70, 50), B = panel(svg, bot, t0, t1, 0, 16);
  const hrs = []; for (let t = t0; t <= t1; t++) hrs.push(t);
  polyline(A.g, hrs.map((t) => [A.X(t), A.Y(S[t] - base)]), { stroke: "currentColor", "stroke-width": 1.5 });
  polyline(A.g, hrs.map((t) => [A.X(t), A.Y(runMin[t] - base)]), { stroke: NORMAL, "stroke-width": 1.5, "stroke-dasharray": "4 3" });
  polyline(B.g, hrs.map((t) => [B.X(t), B.Y(W[t])]), { stroke: "currentColor", "stroke-width": 1.5 });
  el("line", { x1: bot.x, x2: bot.x + bot.w, y1: B.Y(h), y2: B.Y(h), stroke: LIMIT, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
  changeLine(svg, A, top, p.faultStart); changeLine(svg, B, bot, p.faultStart);
  if (alarm !== null) el("circle", { cx: B.X(alarm), cy: B.Y(h), r: 6, fill: "none", stroke: WORN, "stroke-width": 2 }, svg);
  text(svg, A.X(p.faultStart) - 6, top.y + 18, "screw starts to wear", { "text-anchor": "end", fill: WORN });
  text(svg, A.X(t0) + 8, A.Y(14), "summed evidence", { fill: "currentColor" });
  text(svg, A.X(t0) + 8, A.Y(-60), "dashed: its running minimum", { fill: NORMAL });
  text(svg, B.X(t0) + 8, B.Y(h) - 7, `threshold ${h.toFixed(2)}: one false alarm a year`, { fill: LIMIT });
  text(svg, B.X(t0) + 8, B.Y(13), "CUSUM = the gap between the two", { fill: "currentColor" });
  dayTicks(svg, B, bot, t0, t1);
  const ylab = (str, box) => {
    const t = text(svg, 0, 0, str, { "font-size": 13, "text-anchor": "middle" });
    t.setAttribute("transform", `translate(18 ${box.y + box.h / 2}) rotate(-90)`);
  };
  ylab("nats", top); ylab("nats", bot);
  for (const v of [-50, 0, 50]) text(svg, left - 6, A.Y(v) + 4, String(v), { "text-anchor": "end", "font-size": 12 });
  for (const v of [0, 8, 16]) text(svg, left - 6, B.Y(v) + 4, String(v), { "text-anchor": "end", "font-size": 12 });
  return { alarm: alarm === null ? null : alarm - p.faultStart, h };
}

// delay against hours between false alarms, for a step change of delta sd
export function mountDelayCurves(container) {
  container.replaceChildren();
  const plot = document.createElement("div");
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4em 1.4em;align-items:center;margin-top:0.4em;font-size:0.9em;text-align:left;";
  const label = document.createElement("label");
  label.className = "tali-input";
  const input = document.createElement("input");
  input.type = "range"; input.min = "0.25"; input.max = "2"; input.step = "0.05"; input.value = "1";
  const out = document.createElement("span");
  label.append("Size of the change", " ", input, " ", out);
  controls.append(label);
  const readout = document.createElement("p");
  readout.style.cssText = "margin:0.4em 0 0;font-size:0.9em;color:var(--tali-muted);text-align:left;";
  container.append(plot, controls, readout);

  const W0 = 640, H0 = 360, left = 66, right = 14, top = 12, bottom = 44;
  const gx = [2, 6], gy = [0, 4]; // log10 ranges: 100 h to a million h, 1 h to 10,000 h
  const X = (g) => left + ((Math.log10(g) - gx[0]) / (gx[1] - gx[0])) * (W0 - left - right);
  const Y = (d) => top + (1 - (Math.log10(Math.max(d, 1)) - gy[0]) / (gy[1] - gy[0])) * (H0 - top - bottom);
  const gammas = []; for (let e = gx[0]; e <= gx[1] + 1e-9; e += 0.05) gammas.push(10 ** e);

  function draw() {
    const d = +input.value;
    out.textContent = `${d.toFixed(2)} σ`;
    const svg = svgRoot(plot, W0, H0, "Detection delay against hours between false alarms for a limit on single hours, the CUSUM, and the first-order rate log gamma over the KL divergence");
    const box = { x: left, y: top, w: W0 - left - right, h: H0 - top - bottom };
    const id = "dc-clip";
    const cp = el("clipPath", { id }, svg);
    el("rect", { x: box.x, y: box.y, width: box.w, height: box.h }, cp);
    for (let e = gy[0]; e <= gy[1]; e++) {
      el("line", { x1: box.x, x2: box.x + box.w, y1: Y(10 ** e), y2: Y(10 ** e), stroke: "var(--tali-border)", "stroke-opacity": 0.6 }, svg);
      text(svg, left - 6, Y(10 ** e) + 4, (10 ** e).toLocaleString("en-US"), { "text-anchor": "end", "font-size": 12 });
    }
    for (let e = gx[0]; e <= gx[1]; e++) {
      el("line", { y1: box.y, y2: box.y + box.h, x1: X(10 ** e), x2: X(10 ** e), stroke: "var(--tali-border)", "stroke-opacity": 0.6 }, svg);
      text(svg, X(10 ** e), box.y + box.h + 17, ["100", "1,000", "10,000", "100,000", "a million"][e - gx[0]], { "text-anchor": e === gx[1] ? "end" : "middle", "font-size": 12 });
    }
    text(svg, left + box.w / 2, H0 - 6, "hours between false alarms (log scale)", { "text-anchor": "middle", "font-size": 13 });
    const yl = text(svg, 0, 0, "delay, hours (log scale)", { "font-size": 13, "text-anchor": "middle" });
    yl.setAttribute("transform", `translate(16 ${box.y + box.h / 2}) rotate(-90)`);
    el("line", { y1: box.y, y2: box.y + box.h, x1: X(YEAR), x2: X(YEAR), stroke: "currentColor", "stroke-dasharray": "2 3" }, svg);
    text(svg, X(YEAR) + 5, box.y + box.h - 8, "one a year", { "font-size": 12 });
    const g = el("g", { "clip-path": `url(#${id})` }, svg);
    const curve = (f, attrs) => polyline(g, gammas.map((gm) => [X(gm), Y(f(gm))]), { "stroke-width": 2, ...attrs });
    curve((gm) => shewhartArl(shewhartLimit(gm), d), { stroke: LIMIT });
    curve((gm) => firstOrderDelay(gm, d), { stroke: "var(--tali-muted)", "stroke-dasharray": "6 4", "stroke-width": 1.5 });
    curve((gm) => cusumDelay(gm, d), { stroke: NORMAL });
    // legend
    const items = [[LIMIT, "a limit on single hours", false], [NORMAL, "CUSUM: the best possible", false], ["var(--tali-muted)", "log γ / KL, the first-order rate", true]];
    items.forEach(([c, name, dashed], i) => {
      const ly = box.y + 20 + i * 18, lx = box.x + 12;
      el("line", { x1: lx, x2: lx + 22, y1: ly - 4, y2: ly - 4, stroke: c, "stroke-width": 2, "stroke-dasharray": dashed ? "6 4" : "none" }, svg);
      text(svg, lx + 28, ly, name, { "font-size": 12 });
    });
    const sh = shewhartArl(shewhartLimit(YEAR), d), cu = cusumDelay(YEAR, d);
    const fmt = (v) => (v < 100 ? v.toFixed(1) : v.toFixed(0));
    readout.textContent = `At one false alarm a year: a limit on single hours rings ${fmt(sh)} hours after the change on average, the CUSUM ${fmt(cu)} hours.`;
  }
  input.addEventListener("input", draw);
  draw();
}

// summed evidence for a change in simulated normal running, against a level log A that the
// reader moves; Ville's inequality says at most a share 1/A of the runs ever reach it
export function mountVille(container, runs = 2000, drawn = 200, seed = 11) {
  container.replaceChildren();
  const rand = rng(seed);
  const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const hours = 200, shown = 40; // no run of these seeds first reaches 1 nat or more after hour 40
  const paths = normalRunningEvidence(runs, hours, 1, gauss), maxima = evidenceMaxima(paths);
  const plot = document.createElement("div");
  const label = document.createElement("label");
  label.className = "tali-input";
  label.style.cssText = "display:inline-flex;align-items:center;gap:0.4em;margin-top:0.4em;font-size:0.9em;";
  const input = document.createElement("input");
  input.type = "range"; input.min = "0.5"; input.max = "6"; input.step = "0.25"; input.value = "3";
  const out = document.createElement("span");
  label.append("Level log A", input, out);
  const readout = document.createElement("p");
  readout.style.cssText = "margin:0.4em 0 0;font-size:0.9em;color:var(--tali-muted);text-align:left;";
  container.append(plot, label, readout);

  const W0 = 640, H0 = 320, left = 56, right = 12, top = 12, bottom = 40;
  const lo = -25, hi = 8;
  const box = { x: left, y: top, w: W0 - left - right, h: H0 - top - bottom };
  function draw() {
    const a = +input.value;
    out.textContent = `${a.toFixed(2)} nats`;
    const svg = svgRoot(plot, W0, H0, "Simulated runs of normal running: the summed evidence for a change drifts down, and only a few runs ever climb to the level log A");
    const P = panel(svg, box, 0, shown, lo, hi);
    for (let i = 0; i < drawn; i++) {
      const hit = paths[i].slice(0, shown).some((v) => v >= a);
      const pts = [[P.X(0), P.Y(0)], ...paths[i].slice(0, shown).map((v, n) => [P.X(n + 1), P.Y(v)])];
      polyline(P.g, pts, { stroke: hit ? WORN : NORMAL, "stroke-width": hit ? 1.6 : 1, "stroke-opacity": hit ? 0.95 : 0.2 });
    }
    el("line", { x1: box.x, x2: box.x + box.w, y1: P.Y(a), y2: P.Y(a), stroke: LIMIT, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
    text(svg, box.x + box.w - 8, P.Y(a) - 7, `log A = ${a.toFixed(2)} nats`, { "text-anchor": "end", fill: LIMIT });
    for (const v of [-20, -10, 0]) text(svg, left - 6, P.Y(v) + 4, String(v), { "text-anchor": "end", "font-size": 12 });
    for (const h of [0, 10, 20, 30, 40]) text(svg, P.X(h), box.y + box.h + 17, String(h), { "text-anchor": "middle", "font-size": 12 });
    text(svg, left + box.w / 2, H0 - 4, "hours of normal running", { "text-anchor": "middle", "font-size": 13 });
    const yl = text(svg, 0, 0, "summed evidence, nats", { "font-size": 13, "text-anchor": "middle" });
    yl.setAttribute("transform", `translate(16 ${box.y + box.h / 2}) rotate(-90)`);
    const share = maxima.filter((m) => m >= a).length / runs;
    const pct = (v) => `${(100 * v).toFixed(v < 0.01 ? 2 : 1)}\u00a0%`;
    readout.textContent = `${maxima.filter((m) => m >= a).length} of ${runs.toLocaleString("en-US")} runs (${pct(share)}) reach ${a.toFixed(2)} nats within ${hours} hours. Ville's inequality allows at most 1/A = ${pct(Math.exp(-a))}.`;
  }
  input.addEventListener("input", draw);
  draw();
}
