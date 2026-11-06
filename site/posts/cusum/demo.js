// demo.js
// The demo: the line's signals with alarm limits, then the output per screw turn with its own limit.
// Mounted by the demo cell in index.tmd via:
//   const { mountDemo } = await import("./demo.js");

import { limitAlarms, normalStats, outputPerTurn, outputStats, featureAlarm, SIGNALS } from "./line-model.js";
import { shewhartArl } from "./detection.js";

const NORMAL = "steelblue", WORN = "darkorange", LIMIT = "#d64545";
const LABELS = {
  wide: ["line speed (m/min)", "screw speed (rpm)", "melt pressure (bar)", "diameter (mm)"],
  narrow: ["line speed", "screw speed", "pressure", "diameter"],
};

function themeColours() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return { fg: v("--tali-fg", "#222"), muted: v("--tali-muted", "#777"), border: v("--tali-border", "#ccc") };
}

function sizeCanvas(canvas, height) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth;
  canvas.style.height = height + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: height };
}

// a mean run length in hours, in words
function every(hours) {
  if (hours < 48) return `every ${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
  const days = hours / 24;
  if (days < 730) return `every ${days.toFixed(0)} days`;
  return `every ${(days / 365).toFixed(0)} years`;
}

export function mountDemo(container, data) {
  const { params: p, samples } = data;
  const hours = samples.length, rampStart = p.fastRunStart - p.rampHours;
  const stats = normalStats(data);
  const feature = outputPerTurn(data), fStats = outputStats(data);
  const normalHours = samples.filter((s) => s.phase === "normal").length;

  // fixed y ranges, so moving the limits moves lines, not axes
  const range = (xs, mean, sd) => {
    const lo = Math.min(Math.min(...xs), mean - 4 * sd), hi = Math.max(Math.max(...xs), mean + 4 * sd);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  };
  const ranges = Object.fromEntries(SIGNALS.map((k) => [k, range(samples.map((s) => s[k]), stats[k].mean, stats[k].sd)]));
  ranges.diameter = [Math.min(7.85, Math.min(...samples.map((s) => s.diameter)) - 0.03), 8.15];
  ranges.feature = range(feature, fStats.mean, fStats.sd);

  const captions = {
    1: "One dot per hour for two months. The orange dots come after the screw starts to wear.",
    2: "The plastic the cable carries away, divided by the screw speed. The dashed line is the alarm limit, the chosen number of standard deviations below its mean in normal running.",
  };

  // DOM
  container.replaceChildren();
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5em;margin-bottom:0.6em;";
  const buttons = ["1 · The signals", "2 · Output per screw turn"].map((name, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = name; b.dataset.step = String(i + 1);
    b.style.cssText = "font:inherit;font-size:0.9em;padding:0.35em 0.7em;border-radius:6px;background:transparent;color:inherit;cursor:pointer;border:1px solid var(--tali-border);";
    buttonRow.append(b);
    return b;
  });
  const main = document.createElement("canvas");
  main.style.cssText = "display:block;width:100%;";
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4em 1.2em;align-items:center;margin-top:0.5em;font-size:0.9em;text-align:left;";
  const label = document.createElement("label");
  label.className = "tali-input";
  const prefix = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "1"; slider.max = "4"; slider.step = "0.1"; slider.value = "3";
  slider.setAttribute("aria-label", "Alarm limit in standard deviations");
  const kOut = document.createElement("span");
  label.append(prefix, " ", slider, " ", kOut);
  const readout = document.createElement("span");
  readout.style.color = "var(--tali-muted)";
  controls.append(label, readout);
  const caption = document.createElement("p");
  caption.style.cssText = "margin:0.6em 0 0;min-height:4.5em;text-align:left;font-size:0.95em;";
  container.append(buttonRow, main, controls, caption);

  let step = 1, M, raf = 0;
  const k = () => +slider.value;

  function updateReadout() {
    kOut.textContent = `${k().toFixed(1)} σ`;
    if (step === 1) {
      prefix.textContent = "Alarm limits at ±";
      const r = limitAlarms(data, k());
      const caught = r.firstCatch === null ? "The wear is not caught." : `The wear is caught ${r.firstCatch} hours after it starts.`;
      readout.textContent = `False alarms in normal running: ${r.falseAlarms}. ${caught}`;
    } else {
      prefix.textContent = "Alarm limit at −";
      const r = featureAlarm(data, k());
      const caught = r.firstAlarm === null ? "The wear is not caught." : `The wear is caught ${r.firstAlarm} hours after it starts.`;
      readout.textContent = `A false alarm ${every(shewhartArl(k()))} on average, ${r.falseAlarms} in the ${normalHours / 24} days of normal running. ${caught}`;
    }
  }

  function go(n) {
    step = n;
    buttons.forEach((b) => {
      const on = +b.dataset.step === step;
      b.style.borderColor = on ? "var(--tali-accent)" : "var(--tali-border)";
      b.style.color = on ? "var(--tali-accent)" : "inherit";
      b.setAttribute("aria-pressed", String(on));
    });
    main.setAttribute("aria-label", step === 1 ? "Hourly line signals with their alarm limits" : "Hourly output per screw turn with its alarm limit, and the diameter");
    caption.textContent = captions[step];
    updateReadout();
    requestDraw();
  }

  function layout() {
    const narrow = container.clientWidth < 640;
    M = sizeCanvas(main, narrow ? 360 : 420);
    M.narrow = narrow;
  }

  // strips stacked top to bottom; each row is [key, label, share of the height]
  function drawStrips(rows) {
    const { ctx, w, h, narrow } = M, col = themeColours();
    const left = narrow ? 78 : 150, right = 10, top = 8, gap = 10, bottom = 22;
    const usable = h - top - bottom - gap * (rows.length - 1);
    const X = (t) => left + (t / (hours - 1)) * (w - left - right);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${narrow ? 11 : 13}px ${getComputedStyle(container).fontFamily}`;
    ctx.textBaseline = "middle";
    // the fast run, shaded
    ctx.fillStyle = col.border; ctx.globalAlpha = 0.35;
    ctx.fillRect(X(rampStart), top, w - right - X(rampStart), h - top - bottom);
    ctx.globalAlpha = 1;
    let y0 = top;
    for (const row of rows) {
      const ch = usable * row.share, [lo, hi] = ranges[row.key];
      const Y = (v) => y0 + ch * (1 - (v - lo) / (hi - lo));
      ctx.strokeStyle = col.border; ctx.lineWidth = 1; ctx.strokeRect(left, y0, w - left - right, ch);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = LIMIT; ctx.beginPath();
      for (const v of row.limits) { ctx.moveTo(left, Y(v)); ctx.lineTo(w - right, Y(v)); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col.muted; ctx.textAlign = "right";
      const lines = row.label.split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln, left - 8, y0 + ch / 2 + (i - (lines.length - 1) / 2) * 16));
      for (const s of samples) {
        ctx.fillStyle = s.phase === "normal" ? NORMAL : WORN;
        ctx.fillRect(X(s.t) - 1, Y(row.value(s)) - 1, 2.2, 2.2);
      }
      if (row.mark !== undefined && row.mark !== null) {
        ctx.strokeStyle = WORN; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(row.mark), Y(row.value(samples[row.mark])), 6, 0, 2 * Math.PI); ctx.stroke();
      }
      y0 += ch + gap;
    }
    const fx = X(p.faultStart);
    ctx.strokeStyle = WORN; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fx, top); ctx.lineTo(fx, h - bottom); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = WORN; ctx.textAlign = "right";
    ctx.fillText("screw starts to wear", fx - 6, top + 10);
    ctx.fillStyle = col.muted; ctx.textAlign = "center";
    for (const day of [0, 15, 30, 45, 60]) {
      ctx.textAlign = day === 0 ? "left" : day === 60 ? "right" : "center";
      ctx.fillText(`day ${day}`, X(Math.min(day * 24, hours - 1)), h - bottom + 13);
    }
  }

  function draw() {
    raf = 0;
    const diameterRow = { key: "diameter", label: M.narrow ? LABELS.narrow[3] : LABELS.wide[3], limits: p.diameterSpec, value: (s) => s.diameter };
    if (step === 1) {
      const labels = M.narrow ? LABELS.narrow : LABELS.wide;
      const rows = SIGNALS.map((key, i) => ({
        key, label: labels[i], share: 0.25, value: (s) => s[key],
        limits: [stats[key].mean - k() * stats[key].sd, stats[key].mean + k() * stats[key].sd],
      }));
      drawStrips([...rows, { ...diameterRow, share: 0.25 }]);
    } else {
      const r = featureAlarm(data, k());
      drawStrips([
        { key: "feature", label: "output per\nscrew turn", share: 0.72, value: (s) => feature[s.t], limits: [r.limit], mark: r.firstAlarm === null ? null : p.faultStart + r.firstAlarm },
        { ...diameterRow, share: 0.28 },
      ]);
    }
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(draw); }

  buttons.forEach((b) => b.addEventListener("click", () => go(+b.dataset.step)));
  slider.addEventListener("input", () => { updateReadout(); requestDraw(); });
  new MutationObserver(requestDraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", requestDraw);
  new ResizeObserver(() => { layout(); requestDraw(); }).observe(container);

  layout();
  go(1);
}
