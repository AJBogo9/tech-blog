// jobdata.js
// loads the page's data files and turns them into rows for Observable Plot

export const EU27 = "AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" ");

export const COLORS = ["#c2410c", "#2563eb", "#0f766e", "#a16207", "#7c3aed", "#db2777", "#475569", "#65a30d"];

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

export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return { fg: v("--tali-fg", "#222"), muted: v("--tali-muted", "#777"), border: v("--tali-border", "#ccc") };
}

// a line chart with a label at the end of each line, used by both the highlights and the explorer
export function lineChart(data, { width, height = 360, yLabel = "", colors = COLORS, domain, percent = false, marks = [], valueOnly = false } = {}) {
  const Plot = globalThis.Plot;
  const names = domain ?? [...new Set(data.map((d) => d.series))];
  const short = (name) => (name.length > 28 ? `${name.slice(0, 27)}…` : name);
  const fmt = (v) => (percent ? `${v.toFixed(1)} %` : Number.isInteger(v) || Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
  return Plot.plot({
    width, height,
    marginRight: valueOnly ? 64 : 150, marginLeft: 56,
    x: { type: "utc", label: null },
    y: { grid: true, label: yLabel, zero: !percent && data.every((d) => d.value >= 0) },
    color: { domain: names, range: colors },
    marks: [
      ...marks,
      Plot.lineY(data, { x: "date", y: "value", stroke: "series", strokeWidth: (d) => (d.series === names[0] ? 2.4 : 1.5) }),
      Plot.text(data, Plot.selectLast({ x: "date", y: "value", z: "series", fill: "series", text: (d) => (valueOnly ? fmt(d.value) : `${short(d.series)} ${fmt(d.value)}`), textAnchor: "start", dx: 6, fontSize: 11 })),
      Plot.tip(data, Plot.pointerX({ x: "date", y: "value", stroke: "series", title: (d) => `${d.series}\n${d.month}: ${fmt(d.value)}` })),
    ],
  });
}
