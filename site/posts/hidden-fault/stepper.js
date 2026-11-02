// stepper.js
// The demo: signals over time, fold into 3D, turn to the edge, the law behind the sheet.
// Mounted by the demo cell in index.tmd via:
//   const { mountStepper } = await import("./stepper.js");

import { limitAlarms, normalStats, outputPerTurn, featureAlarm, standardize, pca3, physicsNormal, plannedThroughput, SIGNALS } from "./line-model.js";

const NORMAL = "steelblue", WORN = "darkorange", LIMIT = "#d64545", PCA = "mediumseagreen";
const LABELS = {
  wide: ["line speed (m/min)", "screw speed (rpm)", "melt pressure (bar)", "diameter (mm)"],
  narrow: ["line speed", "screw speed", "pressure", "diameter"],
};
const CAMERA = {
  1: { yaw: -Math.PI / 4, pitch: 0.12 },
  2: { yaw: -Math.PI / 4, pitch: 0.12 },
  3: { yaw: Math.PI / 4, pitch: 0.1 },
  4: { yaw: 0.7, pitch: 0.22 },
};

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

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

// text kept inside the canvas: align "left" or "right" at x, shifted back in if it would overflow
function clampedText(ctx, text, x, y, align, width) {
  const w = ctx.measureText(text).width;
  let left = align === "right" ? x - w : x;
  left = Math.max(4, Math.min(width - 4 - w, left));
  ctx.textAlign = "left";
  ctx.fillText(text, left, y);
}

function arrow(ctx, x0, y0, x1, y1, colour, width, dashed) {
  const ang = Math.atan2(y1 - y0, x1 - x0), hl = 11;
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = width;
  ctx.setLineDash(dashed ? [6, 5] : []);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(ang) * hl * 0.8, y1 - Math.sin(ang) * hl * 0.8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - hl * Math.cos(ang - 0.4), y1 - hl * Math.sin(ang - 0.4));
  ctx.lineTo(x1 - hl * Math.cos(ang + 0.4), y1 - hl * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
}

export function mountStepper(container, data) {
  const { params: p, samples } = data;
  const hours = samples.length, rampStart = p.fastRunStart - p.rampHours;
  const stats = normalStats(data);
  const std = standardize(data);
  const feature = outputPerTurn(data), fAlarm = featureAlarm(data);
  const outOfSpec = samples.find((s) => s.diameter < p.diameterSpec[0]);
  const normalPts = samples.filter((s) => s.phase === "normal").map((s) => std[s.t]);
  const model = pca3(normalPts), nrm = physicsNormal(data);
  let pcaDir = model.components[2];
  if (pcaDir[0] * nrm[0] + pcaDir[1] * nrm[1] + pcaDir[2] * nrm[2] < 0) pcaDir = pcaDir.map((x) => -x);
  // the sheet predicted by physics, in standardize() coordinates: screw = c * speed
  const c = plannedThroughput(1, p) / p.q;
  const sheetY = (x) => (c * (stats.speed.mean + 3 * stats.speed.sd * x) - stats.screw.mean) / (3 * stats.screw.sd);

  // fixed y ranges, so moving the limits moves lines, not axes
  const ranges = SIGNALS.map((k) => {
    const xs = samples.map((s) => s[k]);
    const lo = Math.min(Math.min(...xs), stats[k].mean - 4 * stats[k].sd), hi = Math.max(Math.max(...xs), stats[k].mean + 4 * stats[k].sd);
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  });
  ranges.push([Math.min(7.85, Math.min(...samples.map((s) => s.diameter)) - 0.03), 8.15]);
  const keys = [...SIGNALS, "diameter"];

  const captions = {
    1: "One dot per hour for a month. The orange dots come after the screw starts to wear. The controller holds the diameter by turning the screw faster, until the last day, when the line runs its fastest product and the worn screw runs out of speed.",
    2: "Each hour becomes one dot in three dimensions: line speed, screw speed and melt pressure. The dashed box is the alarm limits. Seen from the front, the orange dots sit inside the cloud.",
    3: "Turned to its edge, the cloud is a thin sheet. The orange dots have left the sheet, and they are still inside the box.",
    4: `The sheet is plastic in = plastic out. At a fixed diameter, screw speed grows in step with line speed. The arrow points off the sheet, and PCA finds the same direction from normal running alone (green dashes). The output per screw turn, below, crosses its alarm line ${fAlarm.firstAlarm} hours after the wear starts, ${outOfSpec ? outOfSpec.t - p.faultStart - fAlarm.firstAlarm : "?"} hours before the diameter leaves its limits.`,
  };

  // DOM
  container.replaceChildren();
  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5em;margin-bottom:0.6em;";
  const names = ["1 · Over time", "2 · Fold into 3D", "3 · Turn to the edge", "4 · The law"];
  const buttons = names.map((name, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = name; b.dataset.step = String(i + 1);
    b.style.cssText = "font:inherit;font-size:0.9em;padding:0.35em 0.7em;border-radius:6px;background:transparent;color:inherit;cursor:pointer;border:1px solid var(--tali-border);";
    buttonRow.append(b);
    return b;
  });
  const main = document.createElement("canvas");
  // vertical swipes still scroll the page on phones; horizontal drags turn the 3D view
  main.style.cssText = "display:block;width:100%;touch-action:pan-y;";
  main.setAttribute("aria-label", "Hourly line signals, then the same hours as a 3D cloud");
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4em 1.2em;align-items:center;margin-top:0.5em;font-size:0.9em;text-align:left;";
  const label = document.createElement("label");
  label.className = "tali-input";
  label.append("Alarm limits at ± ");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "1"; slider.max = "4"; slider.step = "0.1"; slider.value = "3";
  const kOut = document.createElement("span");
  label.append(slider, " ", kOut);
  const readout = document.createElement("span");
  readout.style.color = "var(--tali-muted)";
  controls.append(label, readout);
  const feat = document.createElement("canvas");
  feat.style.cssText = "display:block;width:100%;margin-top:0.6em;transition:opacity 0.4s;";
  feat.setAttribute("aria-label", "Output per screw turn over the month, with its alarm line");
  const caption = document.createElement("p");
  caption.style.cssText = "margin:0.6em 0 0;min-height:4.5em;text-align:left;font-size:0.95em;";
  container.append(buttonRow, main, controls, feat, caption);

  // state
  const cam = { ...CAMERA[1] };
  const st = { step: 1, morph: 0, sheet: 0, arrow: 0 };
  const targets = {
    1: { morph: 0, sheet: 0, arrow: 0 },
    2: { morph: 1, sheet: 0, arrow: 0 },
    3: { morph: 1, sheet: 1, arrow: 0 },
    4: { morph: 1, sheet: 1, arrow: 1 },
  };
  let tween = null, raf = 0, M, F, drag = null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function k() { return +slider.value; }

  function updateReadout() {
    kOut.textContent = `${k().toFixed(1)} σ`;
    const r = limitAlarms(data, k());
    const caught = r.firstCatch === null ? "The wear is not caught." : `The wear is caught ${r.firstCatch} hours after it starts.`;
    readout.textContent = `False alarms in normal running: ${r.falseAlarms}. ${caught}`;
  }

  function finishTween() {
    if (!tween) return;
    Object.assign(st, tween.to.state);
    Object.assign(cam, tween.to.cam);
    tween = null;
  }

  function go(step) {
    finishTween();
    st.step = step;
    tween = {
      t0: performance.now(), dur: reduced.matches ? 0 : 1500,
      from: { state: { morph: st.morph, sheet: st.sheet, arrow: st.arrow }, cam: { ...cam } },
      to: { state: targets[step], cam: CAMERA[step] },
    };
    buttons.forEach((b) => {
      const on = +b.dataset.step === step;
      b.style.borderColor = on ? "var(--tali-accent)" : "var(--tali-border)";
      b.style.color = on ? "var(--tali-accent)" : "inherit";
      b.setAttribute("aria-pressed", String(on));
    });
    caption.textContent = captions[step];
    requestDraw();
  }

  function layout() {
    const narrow = container.clientWidth < 640;
    M = sizeCanvas(main, narrow ? 380 : 440);
    F = sizeCanvas(feat, narrow ? 130 : 150);
    M.narrow = narrow;
  }

  // strip charts
  function strip() {
    const left = M.narrow ? 78 : 150, right = 10, top = 8, gap = 10;
    return { left, right, top, gap, ch: (M.h - top - gap * 3 - 8) / 4 };
  }
  const xOf = (L, t) => L.left + (t / (hours - 1)) * (M.w - L.left - L.right);
  function yOf(L, ki, val) {
    const [lo, hi] = ranges[ki], y0 = L.top + ki * (L.ch + L.gap);
    return y0 + L.ch * (1 - (val - lo) / (hi - lo));
  }

  function proj(q) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = q[0] * cy - q[1] * sy, d1 = q[0] * sy + q[1] * cy;
    const d2 = d1 * cp - q[2] * sp, z2 = d1 * sp + q[2] * cp;
    const f = 5 / (5 + d2), sc = Math.min(M.w, M.h) * (M.narrow ? 0.25 : 0.3);
    return [M.w / 2 + x1 * sc * f, M.h / 2 + 6 - z2 * sc * f, d2];
  }

  function drawStrips(ctx, col, alpha) {
    const L = strip(), labels = M.narrow ? LABELS.narrow : LABELS.wide;
    ctx.globalAlpha = alpha;
    ctx.font = `${M.narrow ? 11 : 13}px ${getComputedStyle(container).fontFamily}`;
    ctx.textBaseline = "middle";
    // the fast run, shaded
    ctx.fillStyle = col.border; ctx.globalAlpha = alpha * 0.35;
    ctx.fillRect(xOf(L, rampStart), L.top, M.w - L.right - xOf(L, rampStart), M.h - L.top - 8);
    ctx.globalAlpha = alpha;
    keys.forEach((key, ki) => {
      const y0 = L.top + ki * (L.ch + L.gap);
      ctx.strokeStyle = col.border; ctx.lineWidth = 1; ctx.strokeRect(L.left, y0, M.w - L.left - L.right, L.ch);
      const lims = key === "diameter" ? p.diameterSpec : [stats[key].mean - k() * stats[key].sd, stats[key].mean + k() * stats[key].sd];
      ctx.setLineDash([5, 4]); ctx.strokeStyle = LIMIT; ctx.beginPath();
      for (const v of lims) { const y = yOf(L, ki, v); ctx.moveTo(L.left, y); ctx.lineTo(M.w - L.right, y); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col.muted; ctx.textAlign = "right"; ctx.fillText(labels[ki], L.left - 8, y0 + L.ch / 2);
      if (ki === 1) return; // screw speed dots morph separately
      for (const s of samples) {
        ctx.fillStyle = s.phase === "normal" ? NORMAL : WORN;
        ctx.fillRect(xOf(L, s.t) - 1, yOf(L, ki, s[key]) - 1, 2.2, 2.2);
      }
    });
    const fx = xOf(L, p.faultStart);
    ctx.strokeStyle = WORN; ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath(); ctx.moveTo(fx, L.top); ctx.lineTo(fx, M.h - 8); ctx.stroke();
    ctx.globalAlpha = alpha; ctx.fillStyle = WORN; ctx.textAlign = "right";
    ctx.fillText("screw starts to wear", fx - 6, L.top + 10);
    const dy = L.top + 3 * (L.ch + L.gap) + L.ch - 10;
    ctx.fillText(M.narrow ? "screw runs out of speed" : "the worn screw runs out of speed", xOf(L, rampStart) - 6, dy);
    ctx.globalAlpha = 1;
  }

  function drawBox(ctx, col, b) {
    const corners = [];
    for (const x of [-b, b]) for (const y of [-b, b]) for (const z of [-b, b]) corners.push([x, y, z]);
    ctx.strokeStyle = LIMIT; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const a = corners[i], e = corners[j];
      if ([0, 1, 2].filter((d) => a[d] !== e[d]).length !== 1) continue;
      const pa = proj(a), pe = proj(e);
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pe[0], pe[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = `${M.narrow ? 11 : 13}px ${getComputedStyle(container).fontFamily}`;
    ctx.fillStyle = col.muted; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lab = (q, t) => { const r = proj(q); ctx.fillText(t, r[0], r[1]); };
    lab([0, -b * 1.25, -b * 1.12], "line speed");
    lab([-b * 1.25, 0, -b * 1.12], "screw speed");
    const verts = [[-b, -b], [-b, b], [b, -b], [b, b]].map(([x, y]) => proj([x, y, b * 0.6]));
    const leftV = verts.reduce((a, e) => (e[0] < a[0] ? e : a));
    clampedText(ctx, "melt pressure", leftV[0] - 8, leftV[1], "right", M.w);
    const tops = [[-b, -b], [-b, b], [b, -b], [b, b]].map(([x, y]) => proj([x, y, b]));
    const rightT = tops.reduce((a, e) => (e[0] > a[0] ? e : a));
    ctx.fillStyle = LIMIT; clampedText(ctx, "alarm limits", rightT[0], rightT[1] - 12, "right", M.w);
  }

  function drawSheet(ctx, b, alpha) {
    const q = [[-b, sheetY(-b), -b], [b, sheetY(b), -b], [b, sheetY(b), b], [-b, sheetY(-b), b]].map(proj);
    ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = NORMAL;
    ctx.beginPath(); q.forEach((r, i) => (i ? ctx.lineTo(r[0], r[1]) : ctx.moveTo(r[0], r[1]))); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = alpha * 0.55; ctx.strokeStyle = NORMAL; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawArrows(ctx, col, b, alpha) {
    const centre = [0, sheetY(0), 0], len = 0.9 * b;
    const c0 = proj(centre), tipN = proj(centre.map((x, i) => x + nrm[i] * len)), tipP = proj(centre.map((x, i) => x + pcaDir[i] * len));
    ctx.globalAlpha = alpha;
    arrow(ctx, c0[0], c0[1], tipN[0], tipN[1], col.fg, 4, false);
    arrow(ctx, c0[0], c0[1], tipP[0], tipP[1], PCA, 2, true);
    const leftward = tipN[0] < c0[0], dx = leftward ? -10 : 10, align = leftward ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = col.fg; clampedText(ctx, "plastic in = plastic out", tipN[0] + dx, tipN[1] - 12, align, M.w);
    ctx.fillStyle = PCA; clampedText(ctx, "PCA, from data alone", tipN[0] + dx, tipN[1] + 12, align, M.w);
    ctx.globalAlpha = 1;
  }

  function drawMain() {
    const { ctx } = M, col = themeColours(), m = st.morph, L = strip(), b = k() / 3;
    ctx.clearRect(0, 0, M.w, M.h);
    if (m < 0.999) drawStrips(ctx, col, 1 - m);
    if (m > 0.001) {
      ctx.globalAlpha = m;
      drawBox(ctx, col, b);
      ctx.globalAlpha = 1;
      if (st.sheet > 0.001) drawSheet(ctx, b, m * st.sheet);
    }
    // screw-speed dots fly from their strip into the cloud; the fast run fades out
    const pts = [];
    for (const s of samples) {
      const a = [xOf(L, s.t), yOf(L, 1, s.screw)];
      if (s.phase === "fast") { if (m < 0.999) pts.push({ x: a[0], y: a[1], d: 0, worn: true, alpha: 1 - m }); continue; }
      const e = proj(std[s.t]);
      pts.push({ x: lerp(a[0], e[0], m), y: lerp(a[1], e[1], m), d: e[2], worn: s.phase !== "normal", alpha: m > 0.5 ? 0.85 : 1 });
    }
    if (m > 0.5) pts.sort((u, v) => v.d - u.d);
    const r = lerp(1.2, 2.3, m);
    for (const q of pts) {
      ctx.globalAlpha = q.alpha; ctx.fillStyle = q.worn ? WORN : NORMAL;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (st.arrow > 0.001) drawArrows(ctx, col, b, st.arrow);
  }

  function drawFeature() {
    const { ctx } = F, col = themeColours(), left = M.narrow ? 78 : 150, right = 10, top = 8, bottom = 18;
    ctx.clearRect(0, 0, F.w, F.h);
    const lo = Math.min(...feature) - 0.03, hi = Math.max(...feature) + 0.03;
    const X = (t) => left + (t / (hours - 1)) * (F.w - left - right), Y = (v) => top + (F.h - top - bottom) * (1 - (v - lo) / (hi - lo));
    ctx.fillStyle = col.border; ctx.globalAlpha = 0.35;
    ctx.fillRect(X(rampStart), top, F.w - right - X(rampStart), F.h - top - bottom);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col.border; ctx.lineWidth = 1; ctx.strokeRect(left, top, F.w - left - right, F.h - top - bottom);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = LIMIT;
    ctx.beginPath(); ctx.moveTo(left, Y(fAlarm.limit)); ctx.lineTo(F.w - right, Y(fAlarm.limit)); ctx.stroke(); ctx.setLineDash([]);
    for (const s of samples) { ctx.fillStyle = s.phase === "normal" ? NORMAL : WORN; ctx.fillRect(X(s.t) - 1, Y(feature[s.t]) - 1, 2.2, 2.2); }
    ctx.font = `${M.narrow ? 11 : 13}px ${getComputedStyle(container).fontFamily}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "right"; ctx.fillStyle = col.muted;
    const mid = top + (F.h - top - bottom) / 2;
    ctx.fillText("output per", left - 8, mid - 8); ctx.fillText("screw turn", left - 8, mid + 8);
    ctx.textAlign = "left"; ctx.fillStyle = LIMIT; ctx.fillText("alarm line", left + 6, Y(fAlarm.limit) + 11);
    ctx.textAlign = "right"; ctx.fillStyle = col.muted; ctx.fillText(M.narrow ? "out of spec" : "diameter out of spec", F.w - right - 6, top + 10);
    if (fAlarm.firstAlarm !== null) {
      const t = p.faultStart + fAlarm.firstAlarm;
      ctx.strokeStyle = WORN; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(t), Y(feature[t]), 6, 0, 2 * Math.PI); ctx.stroke();
    }
  }

  function frame(now) {
    raf = 0;
    if (tween) {
      const e = tween.dur === 0 ? 1 : ease(Math.min(1, (now - tween.t0) / tween.dur));
      for (const key of ["morph", "sheet", "arrow"]) st[key] = lerp(tween.from.state[key], tween.to.state[key], e);
      cam.yaw = lerp(tween.from.cam.yaw, tween.to.cam.yaw, e);
      cam.pitch = lerp(tween.from.cam.pitch, tween.to.cam.pitch, e);
      if (e >= 1) tween = null;
    }
    drawMain();
    feat.style.opacity = st.arrow.toFixed(3);
    feat.style.display = st.arrow > 0.01 ? "block" : "none";
    if (st.arrow > 0.01) drawFeature();
    if (tween) requestDraw();
  }
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

  // events
  buttons.forEach((b) => b.addEventListener("click", () => go(+b.dataset.step)));
  slider.addEventListener("input", () => { updateReadout(); requestDraw(); });
  main.addEventListener("pointerdown", (e) => {
    if (st.morph < 0.5 && !(tween && tween.to.state.morph === 1)) return;
    finishTween();
    drag = { x: e.clientX, y: e.clientY };
    main.setPointerCapture(e.pointerId);
  });
  main.addEventListener("pointermove", (e) => {
    if (!drag) return;
    cam.yaw += (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch + (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
    requestDraw();
  });
  const endDrag = () => (drag = null);
  main.addEventListener("pointerup", endDrag);
  main.addEventListener("pointercancel", endDrag);
  new MutationObserver(requestDraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", requestDraw);
  new ResizeObserver(() => { layout(); requestDraw(); }).observe(container);

  layout();
  updateReadout();
  go(1);
}
