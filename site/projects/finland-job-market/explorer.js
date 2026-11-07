// explorer.js
// the explorer: pick a data set, the series to compare and how to show them

import { COLORS, EU27, lineChart, movingAverage, ratio, rows } from "./jobdata.js";

const MAX_SERIES = COLORS.length;

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function select(name, options, value, onchange) {
  const s = el("select", { name, onchange: () => onchange(s.value) });
  for (const [v, label] of options) s.append(el("option", { value: v }, label));
  s.value = value;
  return s;
}

const label = (text, ...controls) => el("label", { class: "tali-input", style: "display: inline-flex; gap: 0.4em; align-items: center; margin: 0.25em 1.2em 0.25em 0" }, text, ...controls);

export async function mountExplorer(container, data) {
  const { lfs, regions, occupations, eu } = data;
  const euNames = { ...eu.names, EU27_2020: "EU", EA21: "Euro area" };
  const regionNames = regions.areas;
  const occNames = occupations.occupations;

  // each topic: its own controls, its chosen series, and a function that returns the lines to draw
  const topics = {
    eu: {
      title: "EU comparison",
      measure: "TOTAL", picked: ["FI", "SE", "EE", "ES", "EU27_2020"],
      measures: [["TOTAL", "Unemployment rate, all ages"], ["Y_LT25", "Unemployment rate, under 25"]],
      choices: () => [...EU27, "EU27_2020", ...Object.keys(eu.series.TOTAL).filter((g) => !EU27.includes(g) && g.length === 2)]
        .filter((g) => eu.series.TOTAL[g]).map((g) => [g, euNames[g] ?? g]),
      lines() { return { months: eu.months, percent: true, unit: "% of labour force, seasonally adjusted", named: this.picked.map((g) => [euNames[g] ?? g, eu.series[this.measure][g] ?? []]) }; },
      source: eu.source,
    },
    survey: {
      title: "Finland, labour force survey",
      measure: "rate",
      measures: [["rate", "Unemployment rate"], ["young", "Unemployment rate, under 25"], ["emprate", "Employment rate, ages 20 to 64"], ["counts", "Employed and unemployed"]],
      lines() {
        const s = (k) => lfs.series[k].values;
        const m = {
          rate: [["Trend", s("tyottaste_trendi")], ["Seasonally adjusted", s("Tyottaste_kausi")]],
          young: [["Under 25, trend", s("Tyottaste_15_24_trendi")], ["All ages, trend", s("tyottaste_trendi")]],
          emprate: [["Ages 20 to 64, trend", s("Tyollaste_20_64_trendi")]],
          counts: [["Employed", s("tyolliset_trendi")], ["Unemployed", s("tyottomat_trendi")]],
        }[this.measure];
        return { months: lfs.months, percent: this.measure !== "counts", unit: this.measure === "counts" ? "thousands, trend" : "%", named: m };
      },
      source: lfs.source,
    },
    regions: {
      title: "Regions",
      measure: "TYOTOSUUS", picked: ["SSS", "MK01", "MK06", "MK17"],
      measures: [...Object.entries(regions.measures), ["PER_VACANCY", "Unemployed jobseekers per open vacancy"]],
      choices: () => Object.entries(regionNames),
      lines() {
        const get = (a) => (this.measure === "PER_VACANCY"
          ? ratio(regions.values[a].TYOTTOMATLOPUSSA, regions.values[a].AVPAIKATLOPUSSA)
          : regions.values[a][this.measure]);
        const percent = this.measure === "TYOTOSUUS";
        return { months: regions.months, percent, unit: percent ? "% of workforce" : this.measure === "PER_VACANCY" ? "jobseekers per vacancy" : "persons, end of month", named: this.picked.map((a) => [regionNames[a], get(a)]) };
      },
      source: regions.source,
    },
    occupations: {
      title: "Occupations",
      measure: "TYOTTOMATLOPUSSA", area: "SSS", picked: ["2512", "2511", "2514", "2519"],
      measures: [...Object.entries(occupations.measures), ["PER_VACANCY", "Unemployed jobseekers per open vacancy"]],
      choices: () => Object.entries(occNames).map(([c, n]) => [c, c === "SSS" ? n : `${c} ${n}`]),
      lines() {
        const v = occupations.values[this.area];
        const get = (c) => (this.measure === "PER_VACANCY" ? ratio(v.TYOTTOMATLOPUSSA[c], v.AVPAIKATLOPUSSA[c]) : v[this.measure][c]);
        return { months: occupations.months, percent: false, unit: this.measure === "PER_VACANCY" ? "jobseekers per vacancy" : `persons, end of month, ${occupations.areas[this.area]}`, named: this.picked.map((c) => [occNames[c], get(c)]) };
      },
      source: occupations.source,
    },
  };

  const state = { topic: "eu", from: "2015", smooth: false, index: false };
  const topicBar = el("div", { role: "radiogroup", "aria-label": "Data set", style: "margin-bottom: 0.4em" });
  const controls = el("div");
  const chips = el("div", { style: "display: flex; flex-wrap: wrap; gap: 0.35em; margin: 0.3em 0" });
  const common = el("div");
  const chartBox = el("div", { style: "margin-top: 0.5em" });
  const foot = el("p", { style: "font-size: 0.85em; color: var(--tali-muted, #777)" });
  container.style.cssText = "text-align: left; font-size: 0.85em";
  container.append(topicBar, controls, chips, common, chartBox, foot);

  for (const [key, t] of Object.entries(topics)) {
    const r = el("input", { type: "radio", name: "explorer-topic", value: key });
    if (key === state.topic) r.checked = true;
    r.addEventListener("change", () => { state.topic = key; buildControls(); draw(); });
    topicBar.append(el("label", { class: "tali-input", style: "display: inline-block; margin-right: 1em; white-space: nowrap" }, r, " " + t.title));
  }

  const years = Array.from({ length: 2026 - 2009 + 1 }, (_, i) => String(2009 + i));
  const smooth = el("input", { type: "checkbox", name: "explorer-smooth" });
  const index = el("input", { type: "checkbox", name: "explorer-index" });
  smooth.addEventListener("change", () => { state.smooth = smooth.checked; draw(); });
  index.addEventListener("change", () => { state.index = index.checked; draw(); });
  common.append(
    label("From", select("explorer-from", years.map((y) => [y, y]), state.from, (v) => { state.from = v; draw(); })),
    label("", smooth, "12-month average"),
    label("", index, "Index, first month shown = 100"),
  );

  function buildChips(t) {
    chips.replaceChildren();
    if (!t.picked) return;
    t.picked.forEach((code, i) => {
      const name = (t.choices().find(([c]) => c === code) ?? [code, code])[1];
      chips.append(el("span", { style: `display: inline-flex; align-items: center; gap: 0.3em; border: 1px solid var(--tali-border, #ccc); border-radius: 999px; padding: 0.05em 0.6em; font-size: 0.85em` },
        el("span", { style: `width: 0.7em; height: 0.7em; border-radius: 50%; background: ${COLORS[i]}` }),
        name,
        el("button", { type: "button", "aria-label": `Remove ${name}`, style: "border: none; background: none; cursor: pointer; color: inherit; font: inherit", onclick: () => { t.picked.splice(i, 1); buildChips(t); draw(); } }, "×")));
    });
  }

  function buildControls() {
    const t = topics[state.topic];
    controls.replaceChildren();
    controls.append(label("Measure", select("explorer-measure", t.measures, t.measure, (v) => { t.measure = v; draw(); })));
    if (state.topic === "occupations") controls.append(label("Area", select("explorer-area", Object.entries(occupations.areas), t.area, (v) => { t.area = v; draw(); })));
    if (t.picked) {
      const listId = `explorer-list-${state.topic}`;
      const input = el("input", { name: `explorer-add-${state.topic}`, list: listId, placeholder: state.topic === "occupations" ? "Type an occupation, e.g. engineer" : "Type a name", style: "min-width: 16em" });
      const list = el("datalist", { id: listId }, ...t.choices().map(([, n]) => el("option", { value: n })));
      const add = () => {
        const hit = t.choices().find(([, n]) => n.toLowerCase() === input.value.trim().toLowerCase());
        if (!hit || t.picked.includes(hit[0]) || t.picked.length >= MAX_SERIES) return;
        t.picked.push(hit[0]); input.value = ""; buildChips(t); draw();
      };
      input.addEventListener("change", add);
      controls.append(label("Add", input, list, el("span", { style: "font-size: 0.85em; color: var(--tali-muted, #777); white-space: nowrap" }, `up to ${MAX_SERIES} lines`)));
    }
    buildChips(t);
  }

  let current = [];
  function draw() {
    const t = topics[state.topic];
    const { months, percent, unit, named } = t.lines();
    const from = `${state.from}-01`;
    const start = months.findIndex((m) => m >= from);
    let lines = named.map(([n, v]) => [n, state.smooth ? movingAverage(v, 12) : v]);
    if (state.index) {
      lines = lines.map(([n, v]) => {
        const first = v.slice(start).find((x) => x != null && x !== 0);
        return [n, v.map((x) => (x == null || first == null ? null : (100 * x) / first))];
      });
    }
    current = rows(months, lines, from);
    const width = Math.max(320, Math.min(820, container.clientWidth || 700));
    chartBox.replaceChildren(current.length
      ? lineChart(current, { width, height: 420, percent: percent && !state.index, yLabel: state.index ? "index, first month shown = 100" : unit, domain: lines.map(([n]) => n), valueOnly: true })
      : el("p", {}, "No data for this selection."));
    const csv = ["month,series,value", ...current.map((r) => `${r.month},"${r.series}",${r.value}`)].join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `finland-job-market-${state.topic}.csv` }, "Download these lines as CSV");
    const lastMonth = current.reduce((m, r) => (r.month > m ? r.month : m), "");
    foot.replaceChildren(`Source: ${t.source}. Data up to ${lastMonth}. `, a);
  }

  buildControls();
  draw();
}
