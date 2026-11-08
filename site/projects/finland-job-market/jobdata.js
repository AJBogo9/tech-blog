// jobdata.js
// loads the page's data files and draws the line charts that every cell shares

export const EU27 = "AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" ");

// each colour is a light-dark() pair: dark mode takes lighter steps of the same hues,
// and the browser switches them with the page theme, without a redraw
const pair = (light, dark) => `light-dark(${light}, ${dark})`;
export const COLORS = [
  pair("#c2410c", "#ea580c"), pair("#2563eb", "#3b82f6"), pair("#0f766e", "#0d9488"), pair("#a16207", "#bd8c10"),
  pair("#7c3aed", "#8b5cf6"), pair("#db2777", "#ec4899"), pair("#475569", "#64748b"), pair("#65a30d", "#65a30d"),
];

// a background line that recedes in both themes
export const FAINT = pair("#94a3b8", "#475569");

// every cell on the page shares one download of the data files
let loading = null;
export function loadAll() {
  const get = async (name) => {
    const res = await fetch(new URL(`data/${name}.json`, import.meta.url));
    if (!res.ok) throw new Error(`could not load ${name}.json`);
    return res.json();
  };
  loading ??= Promise.all(["lfs", "regions", "occupations", "eu"].map(get))
    .then(([lfs, regions, occupations, eu]) => ({ lfs, regions, occupations, eu }));
  return loading;
}

export const toDate = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
export const monthLabel = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

// trailing mean over `n` months; null until a full window of values exists
export function movingAverage(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { sum = 0; count = 0; continue; }
    sum += v; count++;
    if (count > n) { sum -= values[i - n]; count = n; }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

// element-wise a / b, null where either is missing or b is zero
export const ratio = (a, b) => a.map((v, i) => (v == null || !b[i] ? null : v / b[i]));

// rows {date, series, value} for Plot, dropping missing values and months before `from`
export function rows(months, named, from = "0000-00") {
  const out = [];
  for (const [series, values] of named) {
    values.forEach((value, i) => {
      if (value != null && months[i] >= from) out.push({ date: toDate(months[i]), month: months[i], series, value });
    });
  }
  return out;
}

// a number as the charts print it
export const formatter = (percent) => (v) => (percent ? `${v.toFixed(1)} %`
  : Number.isInteger(v) || Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const STYLE = `
.jm-chart { position: relative; }
.jm-chart svg { display: block; overflow: visible; touch-action: pan-y; }
.jm-chart svg:focus-visible { outline: 2px solid var(--tali-accent, currentColor); outline-offset: 4px; }
.jm-key { display: flex; flex-wrap: wrap; gap: .2em 1em; font: 12px/1.4 system-ui, sans-serif; margin: 0 0 .4em 56px; }
.jm-key[hidden] { display: none; }
.jm-key span { display: inline-flex; align-items: center; gap: .4em; }
.jm-sw { display: inline-block; width: .8em; height: .8em; border-radius: 2px; flex: none; }
.jm-tip { position: absolute; z-index: 2; pointer-events: none; min-width: 9em; max-width: 18em;
  background: var(--tali-bg, #fff); color: var(--tali-fg, #222); border: 1px solid var(--tali-border-strong, #888);
  border-radius: var(--tali-radius, 2px); padding: .45em .6em; font: 12px/1.45 system-ui, sans-serif; text-align: left;
  box-shadow: 0 2px 10px rgb(0 0 0 / .12); }
.jm-tip[hidden] { display: none; }
.jm-tip-head { font-weight: 600; margin-bottom: .2em; }
.jm-tip-row { display: grid; grid-template-columns: auto 1fr auto; gap: .5em; align-items: center; }
.jm-tip-row .v { font-variant-numeric: tabular-nums; text-align: right; }
.jm-tip-row .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jm-chart [data-series], .jm-chart g[aria-description] { transition: opacity .12s; }
`;

function ensureStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.append(s);
}
export { ensureStyle };

// A responsive line chart with a label at the end of each line, used by every cell.
// It draws at its container's width and redraws when that changes. Hovering, tapping or
// using the arrow keys shows one tooltip with every line's value in that month.
// `chart.highlight(name)` dims the other lines; `highlight(null)` undoes it.
// `height` is a number of pixels, or a function of the chart's width. The first line is
// drawn heavier unless `emphasizeFirst` is false. `band: { name, lower, upper }` draws the
// series `name` as the shaded gap between the series `lower` and `upper` instead of as a
// line. `zero` overrides whether the y axis includes zero.
export function lineChart(data, { height: heightOf = 360, yLabel = "", colors = COLORS, domain, percent = false, marks = [], emphasizeFirst = true, band = null, zero } = {}) {
  ensureStyle("jm-chart-style", STYLE);
  const Plot = globalThis.Plot;
  const names = domain ?? [...new Set(data.map((d) => d.series))];
  const colorOf = (n) => colors[names.indexOf(n)];
  const fmt = formatter(percent);
  const short = (name) => (name.length > 28 ? `${name.slice(0, 27)}…` : name);
  const bySeries = new Map(names.map((n) => [n, data.filter((d) => d.series === n)]));
  const byMonth = new Map();
  for (const d of data) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, []);
    byMonth.get(d.month).push(d);
  }
  const months = [...byMonth.keys()].sort();
  const monthTimes = months.map((m) => +toDate(m));

  // a band row sits halfway between its two edges, every other row at its value
  const isBand = (d) => band != null && d.series === band.name;
  const edge = (m, n) => byMonth.get(m).find((d) => d.series === n)?.value;
  const yOf = (d) => (isBand(d) ? (edge(d.month, band.lower) + edge(d.month, band.upper)) / 2 : d.value);
  const bandRows = band ? bySeries.get(band.name)
    .map((d) => ({ ...d, lo: edge(d.month, band.lower), hi: edge(d.month, band.upper) }))
    .filter((d) => d.lo != null && d.hi != null) : [];

  const wrap = document.createElement("div");
  wrap.className = "jm-chart";
  const key = document.createElement("div");
  key.className = "jm-key";
  key.append(...names.map((n) => {
    const s = document.createElement("span");
    const sw = document.createElement("i");
    sw.className = "jm-sw";
    sw.style.background = colorOf(n);
    s.append(sw, n);
    s.dataset.series = n;
    return s;
  }));
  const tip = document.createElement("div");
  tip.className = "jm-tip";
  tip.hidden = true;
  tip.setAttribute("aria-live", "polite");

  const M = { top: 24, bottom: 30, left: 56 };
  let svg = null, sx = null, sy = null, hover = null, shown = -1, lastWidth = 0, focus = null, height = 0;

  function draw(width) {
    height = typeof heightOf === "function" ? heightOf(width) : heightOf;
    const showNames = width >= 640;
    key.hidden = showNames || names.length < 2;
    const right = showNames ? 150 : 52;
    const plot = Plot.plot({
      width, height, marginTop: M.top, marginBottom: M.bottom, marginLeft: M.left, marginRight: right,
      // plot fills its own tooltips with --plot-background, which it sets to white
      style: "--plot-background: var(--tali-bg, #fff)",
      x: { type: "utc", label: null },
      y: { grid: true, label: yLabel, zero: zero ?? (!percent && data.every((d) => d.value >= 0)) },
      color: { domain: names, range: colors },
      marks: [
        ...marks,
        ...(band ? [Plot.areaY(bandRows, { x: "date", y1: "lo", y2: "hi", fill: "series", fillOpacity: 0.3, ariaDescription: band.name })] : []),
        ...names.filter((n) => n !== band?.name).map((n, i) => Plot.lineY(bySeries.get(n), { x: "date", y: "value", stroke: "series", strokeWidth: emphasizeFirst && i === 0 ? 2.4 : 1.7, ariaDescription: n })),
      ],
    });
    sx = plot.scale("x");
    sy = plot.scale("y");

    // end labels, nudged apart so that lines ending close together stay readable
    const ends = names.map((n) => {
      const s = bySeries.get(n);
      const d = s[s.length - 1];
      return d && { n, d, y: sy.apply(yOf(d)) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    const gap = 13, top = M.top, bottom = height - M.bottom;
    ends.forEach((e, i) => { e.ly = Math.max(e.y, i ? ends[i - 1].ly + gap : top); });
    for (let i = ends.length - 1; i >= 0; i--) {
      const limit = i === ends.length - 1 ? bottom : ends[i + 1].ly - gap;
      if (ends[i].ly > limit) ends[i].ly = limit;
    }
    // plot's svg sets text-anchor middle, which these labels must not inherit
    const labels = svgEl("g", { "font-size": 11, "font-family": "system-ui, sans-serif", "text-anchor": "start" });
    const lx = Math.max(...ends.map((e) => sx.apply(e.d.date))) + 6;
    for (const e of ends) {
      const t = svgEl("text", { x: lx, y: e.ly, dy: "0.32em", fill: colorOf(e.n), "data-series": e.n });
      t.textContent = showNames ? `${short(e.n)} ${fmt(e.d.value)}` : fmt(e.d.value);
      labels.append(t);
    }

    // the hover layer: a rule at the month and a dot on each line
    hover = svgEl("g", { visibility: "hidden", "pointer-events": "none" });
    hover.append(svgEl("line", { y1: top, y2: bottom, stroke: "currentColor", "stroke-opacity": 0.35 }));
    plot.append(labels, hover);
    plot.setAttribute("tabindex", "0");
    plot.setAttribute("aria-label", `Line chart${yLabel ? ` of ${yLabel}` : ""}. Use the arrow keys to read the values month by month.`);
    plot.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
    plot.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
    plot.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    plot.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -12, PageDown: 12 }[e.key];
      if (step) { e.preventDefault(); show(Math.min(months.length - 1, Math.max(0, (shown < 0 ? months.length - 1 : shown) + step))); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); show(e.key === "Home" ? 0 : months.length - 1); }
      else if (e.key === "Escape") hide();
    });
    plot.addEventListener("focus", () => { if (shown < 0) show(months.length - 1); });
    plot.addEventListener("blur", hide);
    if (svg) svg.replaceWith(plot); else wrap.append(key, plot, tip);
    svg = plot;
    applyFocus();
    if (shown >= 0) show(shown);
  }

  // the index of the month nearest to a pointer position
  function nearest(clientX) {
    const r = svg.getBoundingClientRect();
    const t = +sx.invert((clientX - r.left) * (svg.width.baseVal.value / r.width));
    let lo = 0, hi = monthTimes.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (monthTimes[mid] < t) lo = mid; else hi = mid; }
    return t - monthTimes[lo] < monthTimes[hi] - t ? lo : hi;
  }

  function show(i) {
    if (i < 0 || !months.length) return;
    shown = i;
    const m = months[i];
    const at = byMonth.get(m).slice().sort((a, b) => yOf(b) - yOf(a));
    const x = sx.apply(toDate(m));
    hover.setAttribute("visibility", "visible");
    hover.firstChild.setAttribute("x1", x);
    hover.firstChild.setAttribute("x2", x);
    hover.replaceChildren(hover.firstChild, ...at.filter((d) => !isBand(d)).map((d) => svgEl("circle", {
      cx: x, cy: sy.apply(d.value), r: 3.5, fill: colorOf(d.series), stroke: "var(--tali-bg, #fff)", "stroke-width": 1.5, "data-series": d.series,
    })));
    const head = document.createElement("div");
    head.className = "jm-tip-head";
    head.textContent = monthLabel(m);
    tip.replaceChildren(head, ...at.map((d) => {
      const row = document.createElement("div");
      row.className = "jm-tip-row";
      row.dataset.value = d.value;
      row.dataset.series = d.series;
      const sw = document.createElement("i");
      sw.className = "jm-sw";
      sw.style.background = colorOf(d.series);
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = d.series;
      const v = document.createElement("span");
      v.className = "v";
      v.textContent = fmt(d.value);
      row.append(sw, n, v);
      return row;
    }));
    tip.hidden = false;
    // beside the rule, on the side away from the end labels unless there is no room there
    const r = svg.getBoundingClientRect(), w0 = wrap.getBoundingClientRect();
    const scale = r.width / svg.width.baseVal.value;
    const left = r.left - w0.left + x * scale;
    const w = tip.offsetWidth;
    const toLeft = x > (M.left + sx.range[1]) / 2 ? left - 14 - w >= 0 : left + 14 + w > wrap.clientWidth;
    tip.style.left = `${toLeft ? left - 14 - w : left + 14}px`;
    tip.style.top = `${r.top - w0.top + M.top * scale}px`;
    applyFocus();
  }

  function hide() {
    shown = -1;
    tip.hidden = true;
    if (hover) hover.setAttribute("visibility", "hidden");
  }

  function applyFocus() {
    if (!svg) return;
    for (const e of wrap.querySelectorAll("g[aria-description], [data-series]")) {
      const name = e.getAttribute("aria-description") ?? e.dataset.series;
      e.style.opacity = focus == null || name === focus ? "" : "0.15";
    }
  }

  wrap.highlight = (name) => { focus = name; applyFocus(); };

  // a tap outside the chart, or Escape anywhere, closes the tooltip
  const ac = new AbortController();
  document.addEventListener("pointerdown", (e) => { if (!wrap.contains(e.target)) hide(); }, { signal: ac.signal });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, { signal: ac.signal });

  // draw once the chart has a width, redraw when it changes, and let go once it is removed
  let attached = false;
  const ro = new ResizeObserver(() => {
    if (!wrap.isConnected) { if (attached) { ac.abort(); ro.disconnect(); } return; }
    attached = true;
    const width = Math.floor(wrap.clientWidth);
    if (width > 0 && width !== lastWidth) { lastWidth = width; draw(Math.max(280, width)); }
  });
  ro.observe(wrap);
  return wrap;
}
