// demo.js
// The flood demo: the scenes of the Thessaly plain, and the reader's own flood map.
// Mounted by the demo cell in index.tmd via:
//   const { mountDemo } = await import("./demo.js");

import { N, boxMean, changeMeasure, dbToPower, decodeDb, flagCounts } from "./flood.js";

const WATER = [59, 130, 246], FALSE = [249, 115, 22];   // blue, orange: readable for most colour vision

const SCENES = [
  { key: "s2-before", file: "s2-before.webp", label: "Photo 31 Aug" },
  { key: "s2-cloud", file: "s2-cloud.webp", label: "Photo 5 Sep" },
  { key: "s1-before", file: "s1-before.png", label: "Radar 26 Aug" },
  { key: "s1-after", file: "s1-after.png", label: "Radar 7 Sep" },
  { key: "s2-after", file: "s2-after.webp", label: "Photo 10 Sep" },
  { key: "change", label: "Change" },
];

const METHODS = {
  difference: { label: "after − before", min: -0.4, max: 0, step: 0.005, start: -0.05, digits: 3, unit: "", span: 0.3 },
  ratio: { label: "after ÷ before, in dB", min: -15, max: 0, step: 0.25, start: -1.5, digits: 2, unit: " dB", span: 12 },
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`could not load ${file}`));
    im.src = new URL(file, import.meta.url).href;
  });
}

function pixelsOf(im) {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, N, N);
  return ctx.getImageData(0, 0, N, N).data;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function slider(labelText, min, max, step, value) {
  const input = el("input", { type: "range", min, max, step, value: String(value) });
  const out = el("output", { style: "font-variant-numeric: tabular-nums; margin-left: 0.4em" });
  const wrap = el("label", { class: "tali-input", style: "display: block; margin: 0.35em 0" }, labelText + " ", input, out);
  return { wrap, input, out };
}

export async function mountDemo(container) {
  container.style.cssText = "margin: 1em 0; text-align: left";
  const status = el("p", { style: "color: var(--tali-muted, #777)" }, "Loading the scenes …");
  container.append(status);

  const images = Object.fromEntries(await Promise.all(
    SCENES.filter((s) => s.file).map(async (s) => [s.key, await loadImage(s.file)]),
  ));
  images.dry = await loadImage("dry-mask.png");

  const before = dbToPower(decodeDb(pixelsOf(images["s1-before"])));
  const after = dbToPower(decodeDb(pixelsOf(images["s1-after"])));
  const dryPx = pixelsOf(images.dry);
  const dry = new Uint8Array(N * N);
  for (let i = 0; i < dry.length; i++) dry[i] = dryPx[i * 4] > 127 ? 1 : 0;

  // the 10 September photo in pale grey, the base of the flood map
  const photo = pixelsOf(images["s2-after"]);
  const pale = new Uint8ClampedArray(N * N);
  for (let i = 0; i < pale.length; i++) {
    const g = 0.299 * photo[i * 4] + 0.587 * photo[i * 4 + 1] + 0.114 * photo[i * 4 + 2];
    pale[i] = 150 + 0.4 * g;
  }

  const state = { scene: "s2-before", method: "difference", k: 1, threshold: METHODS.difference.start };
  const smoothed = new Map();
  const smooth = (k) => {
    if (!smoothed.has(k)) smoothed.set(k, { before: boxMean(before, N, k), after: boxMean(after, N, k) });
    return smoothed.get(k);
  };
  let measure = null;
  const updateMeasure = () => {
    const s = smooth(state.k);
    measure = changeMeasure(s.before, s.after, state.method);
  };

  // layout: two square canvases, side by side when there is room
  const sceneCanvas = el("canvas", { width: N, height: N, role: "img", "aria-label": "Satellite scene of the Thessaly plain",
    style: "width: 100%; aspect-ratio: 1; display: block; border: 1px solid var(--tali-border, #ccc)" });
  const mapCanvas = el("canvas", { width: N, height: N, role: "img", "aria-label": "Flood map from the radar change",
    style: "width: 100%; aspect-ratio: 1; display: block; border: 1px solid var(--tali-border, #ccc)" });
  const tabs = el("div", { role: "group", "aria-label": "Scene", style: "display: flex; flex-wrap: wrap; gap: 0.3em; margin-bottom: 0.4em" });
  const tabButtons = SCENES.map((s) => {
    const b = el("button", { type: "button", style: "font: inherit; font-size: 0.85em; padding: 0.15em 0.5em; cursor: pointer; border: 1px solid var(--tali-border, #ccc); border-radius: 4px; background: transparent; color: inherit" }, s.label);
    b.addEventListener("click", () => { state.scene = s.key; draw(); });
    tabs.append(b);
    return [s.key, b];
  });
  const small = "font-size: 0.85em; color: var(--tali-muted, #777); margin: 0.3em 0 0";
  const sceneCap = el("p", { style: small });
  const mapCap = el("p", { style: small },
    "Your flood map for 7 September, drawn on the 10 September photo. ",
    el("span", { style: `color: rgb(${WATER})` }, "Blue"), ": flagged, and water on 10 September. ",
    el("span", { style: `color: rgb(${FALSE})` }, "Orange"), ": flagged, but dry land on 10 September.");
  const panels = el("div", { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1em; align-items: start" },
    el("div", {}, tabs, sceneCanvas, sceneCap),
    el("div", {}, el("div", { style: "height: 1.9em" }), mapCanvas, mapCap));

  // controls
  const methodBox = el("div", { role: "radiogroup", "aria-label": "Change measure", style: "margin: 0.6em 0 0.2em" }, "Change measure: ");
  for (const [key, m] of Object.entries(METHODS)) {
    const r = el("input", { type: "radio", name: "flood-method", value: key });
    if (key === state.method) r.checked = true;
    r.addEventListener("change", () => {
      state.method = key;
      const mm = METHODS[key];
      Object.assign(thr.input, { min: mm.min, max: mm.max, step: mm.step });
      thr.input.value = String(mm.start);
      state.threshold = mm.start;
      updateMeasure(); draw();
    });
    methodBox.append(el("label", { class: "tali-input", style: "display: inline-block; margin-right: 1em; white-space: nowrap" }, r, " " + m.label));
  }
  const win = slider("Smoothing window", 1, 9, 2, 1);
  const thr = slider("Flag a pixel when the change is below", METHODS.difference.min, METHODS.difference.max, METHODS.difference.step, METHODS.difference.start);
  const readout = el("p", { "aria-live": "polite", style: "font-variant-numeric: tabular-nums; margin: 0.5em 0" });
  win.input.addEventListener("input", () => { state.k = Number(win.input.value); updateMeasure(); draw(); });
  thr.input.addEventListener("input", () => { state.threshold = Number(thr.input.value); draw(); });

  status.remove();
  container.append(panels, methodBox, win.wrap, thr.wrap, readout);

  const sceneCtx = sceneCanvas.getContext("2d");
  const mapCtx = mapCanvas.getContext("2d");
  const changeImg = new ImageData(N, N), mapImg = new ImageData(N, N);

  function draw() {
    const m = METHODS[state.method];
    for (const [key, b] of tabButtons) {
      const on = key === state.scene;
      b.setAttribute("aria-pressed", String(on));
      b.style.background = on ? "var(--tali-fg, #222)" : "transparent";
      b.style.color = on ? "var(--tali-bg, #fff)" : "inherit";
    }
    // scene panel
    if (state.scene === "change") {
      for (let i = 0; i < N * N; i++) {
        const v = 127.5 + (measure[i] / m.span) * 127.5;
        changeImg.data[i * 4] = changeImg.data[i * 4 + 1] = changeImg.data[i * 4 + 2] = v;
        changeImg.data[i * 4 + 3] = 255;
      }
      sceneCtx.putImageData(changeImg, 0, 0);
      sceneCap.textContent = `The change measure, ${m.label}, after smoothing. Darker means the ground got darker; mid grey means no change.`;
    } else {
      sceneCtx.drawImage(images[state.scene], 0, 0, N, N);
      sceneCap.textContent = state.scene.startsWith("s1")
        ? "Sentinel-1 radar, 6.4 km across. Brighter means more of the radar pulse came back."
        : "Sentinel-2 photo in natural colour, 6.4 km across.";
    }
    // flood map
    for (let i = 0; i < N * N; i++) {
      const j = i * 4;
      if (measure[i] < state.threshold) {
        const c = dry[i] ? FALSE : WATER;
        mapImg.data[j] = c[0]; mapImg.data[j + 1] = c[1]; mapImg.data[j + 2] = c[2];
      } else {
        mapImg.data[j] = mapImg.data[j + 1] = mapImg.data[j + 2] = pale[i];
      }
      mapImg.data[j + 3] = 255;
    }
    mapCtx.putImageData(mapImg, 0, 0);
    // controls and readout
    win.out.textContent = `${state.k} × ${state.k} pixels (${state.k * 10} m)`;
    thr.out.textContent = state.threshold.toFixed(m.digits) + m.unit;
    const c = flagCounts(measure, state.threshold, dry);
    readout.textContent = `Flagged: ${c.flaggedKm2.toFixed(1)} km², of which ${c.floodKm2.toFixed(1)} km² is water on 10 September ` +
      `and ${c.falseKm2.toFixed(1)} km² is dry land, ${(100 * c.falseShare).toFixed(1)} % of all the dry land.`;
  }

  updateMeasure();
  draw();
}
