// figures.js
// The two static figures of the theory section: the line with its control loop,
// and the distance of each hour from the PCA plane.
// Drawn by the {js} cells in index.tmd via:
//   const { drawLoopDiagram, drawSpeChart } = await import("./figures.js");

import { standardize, pca3, spe } from "./line-model.js";

const NS = "http://www.w3.org/2000/svg";
const NORMAL = "steelblue", WORN = "darkorange", LIMIT = "#d64545";

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
}

function text(parent, x, y, str, attrs = {}) {
  const t = el("text", { x, y, "font-size": 15, fill: "var(--tali-muted)", ...attrs }, parent);
  t.textContent = str;
  return t;
}

function svgRoot(container, w, h, label) {
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", role: "img", "aria-label": label });
  svg.style.cssText = "display:block;max-width:100%;height:auto;font-family:inherit;color:var(--tali-fg);";
  container.replaceChildren(svg);
  return svg;
}

// the line from left to right, with the diameter loop drawn from the gauge back to the screw
export function drawLoopDiagram(container) {
  const svg = svgRoot(container, 640, 230, "A cable line: pay-off reel, extruder, cooling trough, diameter gauge, capstan and take-up reel, with a loop from the gauge back to the extruder screw");
  const y = 150;
  const defs = el("defs", {}, svg);
  const head = el("marker", { id: "hf-head", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: "currentColor" }, head);
  // conductor, bare then insulated
  el("line", { x1: 40, y1: y, x2: 290, y2: y, stroke: "#b87333", "stroke-width": 3 }, svg);
  el("line", { x1: 290, y1: y, x2: 600, y2: y, stroke: "currentColor", "stroke-width": 6 }, svg);
  // reels
  for (const [cx, label] of [[40, "pay-off"], [600, "take-up"]]) {
    el("circle", { cx, cy: y, r: 26, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
    el("circle", { cx, cy: y, r: 4, fill: "currentColor" }, svg);
    text(svg, cx, y + 48, label, { "text-anchor": "middle" });
  }
  // extruder: hopper, barrel with the screw, crosshead around the conductor
  el("path", { d: "M138,58 L172,58 L162,82 L148,82 z", fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  el("rect", { x: 120, y: 82, width: 150, height: 30, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  let zig = "M126,97";
  for (let x = 132; x <= 262; x += 12) zig += ` L${x},${(x / 12) % 2 < 1 ? 86 : 108}`;
  el("path", { d: zig, fill: "none", stroke: WORN, "stroke-width": 2 }, svg);
  el("rect", { x: 270, y: 78, width: 34, height: 90, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  text(svg, 195, 132, "extruder screw", { "text-anchor": "middle", fill: WORN });
  // cooling trough
  el("rect", { x: 330, y: y - 14, width: 130, height: 28, fill: NORMAL, "fill-opacity": 0.18, stroke: NORMAL }, svg);
  text(svg, 395, y + 40, "cooling", { "text-anchor": "middle" });
  // diameter gauge
  el("circle", { cx: 495, cy: y, r: 15, fill: "none", stroke: "currentColor", "stroke-width": 2 }, svg);
  text(svg, 495, y + 40, "gauge", { "text-anchor": "middle" });
  // capstan
  el("circle", { cx: 545, cy: y - 14, r: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  el("circle", { cx: 545, cy: y + 14, r: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.5 }, svg);
  // the control loop
  el("path", { d: `M495,${y - 16} L495,28 L195,28 L195,80`, fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "6 4", "marker-end": "url(#hf-head)" }, svg);
  text(svg, 345, 20, "the controller holds the diameter by changing the screw speed", { "text-anchor": "middle", fill: "currentColor" });
}

// distance of each hour from the plane PCA fits to normal running, with an empirical alarm line
export function drawSpeChart(container, data) {
  const { params: p, samples } = data;
  const pts = standardize(data);
  const normal = samples.filter((s) => s.phase === "normal");
  const model = pca3(normal.map((s) => pts[s.t]));
  const dist = spe(pts, model).map(Math.sqrt);
  const limit = Math.sqrt(1.2) * Math.max(...normal.map((s) => dist[s.t]));
  const W = 640, H = 230, left = 56, right = 10, top = 14, bottom = 40;
  const svg = svgRoot(container, W, H, "Distance of each hour from the PCA plane, flat during normal running and rising after the screw starts to wear");
  const hi = Math.max(...dist) * 1.05;
  const X = (t) => left + (t / (samples.length - 1)) * (W - left - right), Y = (v) => top + (H - top - bottom) * (1 - v / hi);
  const rampStart = p.fastRunStart - p.rampHours;
  el("rect", { x: X(rampStart), y: top, width: W - right - X(rampStart), height: H - top - bottom, fill: "var(--tali-border)", "fill-opacity": 0.35 }, svg);
  el("rect", { x: left, y: top, width: W - left - right, height: H - top - bottom, fill: "none", stroke: "var(--tali-border)" }, svg);
  el("line", { x1: left, x2: W - right, y1: Y(limit), y2: Y(limit), stroke: LIMIT, "stroke-width": 1.5, "stroke-dasharray": "5 4" }, svg);
  const dots = el("g", {}, svg);
  for (const s of samples) el("rect", { x: X(s.t) - 1.2, y: Y(dist[s.t]) - 1.2, width: 2.4, height: 2.4, fill: s.phase === "normal" ? NORMAL : WORN }, dots);
  text(svg, left + 6, Y(limit) - 6, "alarm line", { fill: LIMIT });
  text(svg, X(rampStart) - 6, top + 16, "fast run", { "text-anchor": "end" });
  for (const day of [0, 10, 20, 30]) {
    const anchor = day === 0 ? "start" : day === 30 ? "end" : "middle";
    text(svg, X(Math.min(day * 24, samples.length - 1)), H - bottom + 20, `day ${day}`, { "text-anchor": anchor, "font-size": 13 });
  }
  const ylab = text(svg, 0, 0, "distance from the plane", { "font-size": 13, "text-anchor": "middle" });
  ylab.setAttribute("transform", `translate(18 ${top + (H - top - bottom) / 2}) rotate(-90)`);
}
