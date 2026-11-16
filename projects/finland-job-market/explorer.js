// explorer.js
// the explorer: pick a data set and a measure, then tick the lines to compare in a list
// beside the chart. Each line keeps its colour while it is shown, and the view is kept
// in the page address so a link reproduces it.

import { COLORS, ensureStyle, formatter, lineChart, movingAverage, ratio, rows } from "./jobdata.js";

const MAX = COLORS.length;

// ISCO-08 major groups; X holds the employment services' own codes (students, no occupation, ...)
const FAMILIES = [
  ["0", "Armed forces"], ["1", "Managers"], ["2", "Professionals"], ["3", "Technicians and associate professionals"],
  ["4", "Clerical support workers"], ["5", "Service and sales workers"], ["6", "Skilled agricultural, forestry and fishery workers"],
  ["7", "Craft and related trades workers"], ["8", "Plant and machine operators and assemblers"], ["9", "Elementary occupations"],
  ["X", "Not an occupation: students, services, unknown"],
];

const STYLE = `
.jm-explorer { container-type: inline-size; font-size: .8em; line-height: 1.4; text-align: left; }
.jm-explorer select, .jm-explorer input, .jm-explorer button { font: inherit; color: inherit; }
.jm-explorer select, .jm-explorer input[type=search] { background: var(--tali-bg, #fff); border: 1px solid var(--tali-border-strong, #888);
  border-radius: var(--tali-radius, 2px); padding: .25em .4em; min-height: 2em; }
.jm-explorer input[type=checkbox] { width: 1.05em; height: 1.05em; margin: 0; }
.jm-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.jm-top { display: flex; flex-wrap: wrap; gap: .6em 1.4em; align-items: center; margin-bottom: .8em; }
.jm-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--tali-border-strong, #888); border-radius: var(--tali-radius, 2px); }
.jm-seg label { position: relative; padding: .35em .8em; cursor: pointer; white-space: nowrap; }
.jm-seg label + label { border-left: 1px solid var(--tali-border-strong, #888); }
.jm-seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.jm-seg label:has(input:checked) { background: var(--tali-fg, #222); color: var(--tali-bg, #fff); }
.jm-seg label:has(input:focus-visible) { outline: 2px solid var(--tali-accent, currentColor); outline-offset: 2px; }
.jm-field { display: inline-flex; gap: .45em; align-items: center; }
.jm-field > span:first-child { font-weight: 600; }
.jm-main { display: grid; gap: 1em; grid-template-columns: minmax(0, 1fr); }
.jm-toolbar { display: flex; flex-wrap: wrap; gap: .4em 1.2em; align-items: center; margin-bottom: .4em; }
.jm-toolbar label { display: inline-flex; gap: .4em; align-items: center; cursor: pointer; }
.jm-panel { min-width: 0; }
.jm-panel-in { display: flex; flex-direction: column; gap: .45em; }
.jm-panel-tools { display: flex; gap: .45em; flex-wrap: wrap; }
.jm-panel-tools > * { flex: 1 1 10em; min-width: 0; }
.jm-panel-tools > input[type=search] { flex: 2 1 14em; }
.jm-list { border: 1px solid var(--tali-border, #ccc); border-radius: var(--tali-radius, 2px); margin: 0; padding: 0;
  overflow: auto; max-height: max(15rem, 45vh); overscroll-behavior: contain; }
.jm-head { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: baseline; gap: 1em;
  padding: .35em .6em; font-size: .85em; font-weight: 600; background: var(--tali-code-bg, #f4f4f4); }
.jm-head button { border: none; background: none; padding: 0; text-decoration: underline; cursor: pointer; font-weight: 400; }
.jm-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .55em; align-items: center;
  padding: .3em .6em; min-height: 2.1em; cursor: pointer; }
.jm-row:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.jm-row .jm-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jm-row .jm-code { opacity: .6; font-variant-numeric: tabular-nums; margin-right: .3em; }
.jm-row .jm-val { font-variant-numeric: tabular-nums; opacity: .75; }
.jm-row.jm-full { opacity: .55; }
.jm-empty { padding: .6em; opacity: .75; }
.jm-live { min-height: 1.3em; margin: 0; font-size: .9em; }
.jm-foot { font-size: .9em; color: var(--tali-muted, #666); margin: .8em 0 0; }
.jm-foot button { border: none; background: none; padding: 0; text-decoration: underline; cursor: pointer; color: inherit; }
/* beside the chart, the list takes the chart's height and scrolls inside it */
@container (min-width: 880px) {
  .jm-main { grid-template-columns: minmax(0, 1fr) 17.5rem; }
  .jm-panel { position: relative; min-height: 24rem; }
  .jm-panel-in { position: absolute; inset: 0; }
  .jm-list { max-height: none; flex: 1 1 auto; min-height: 0; }
}
`;

function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
}

const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const lastValue = (values) => { for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i]; return null; };

export async function mountExplorer(container, data) {
  ensureStyle("jm-explorer-style", STYLE);
  const { lfs, regions, occupations, eu } = data;
  const euNames = { ...eu.names, EU27_2020: "EU", EA21: "Euro area" };
  const s = (k) => lfs.series[k].values;

  // each data set: its measures, its options, and the values of one option
  const topics = {
    eu: {
      title: "EU countries", noun: "countries",
      measure: "TOTAL", measures: [["TOTAL", "Unemployment rate, all ages"], ["Y_LT25", "Unemployment rate, under 25"]],
      defaults: ["FI", "SE", "EE", "ES", "EU27_2020"],
      choices: () => Object.keys(eu.series.TOTAL).map((g) => [g, euNames[g] ?? g]),
      values(code) { return eu.series[this.measure][code] ?? []; },
      months: eu.months, percent: () => true, unit: () => "% of labour force, seasonally adjusted",
      source: "Eurostat, une_rt_m",
      method: "The monthly unemployment rate from each country's labour force survey, seasonally adjusted. Finland's figures come from Statistics Finland and leave out conscripts. Spain's monthly figures are estimated from its quarterly survey and its register of unemployed jobseekers.",
    },
    survey: {
      title: "Finland, survey", noun: "series",
      measure: "rate",
      measures: [["rate", "Unemployment rate"], ["young", "Unemployment rate, ages 15 to 24"], ["emprate", "Employment rate, ages 20 to 64"], ["counts", "Employed and unemployed"]],
      series: {
        rate: [["tyottaste_trendi", "Trend"], ["Tyottaste_kausi", "Seasonally adjusted"]],
        young: [["Tyottaste_15_24_trendi", "Ages 15 to 24, trend"], ["tyottaste_trendi", "All ages, trend"]],
        emprate: [["Tyollaste_20_64_trendi", "Ages 20 to 64, trend"]],
        counts: [["tyolliset_trendi", "Employed"], ["tyottomat_trendi", "Unemployed"]],
      },
      get defaults() { return this.series[this.measure].map(([c]) => c); },
      choices() { return this.series[this.measure]; },
      values: (code) => s(code),
      months: lfs.months, percent() { return this.measure !== "counts"; }, unit() { return this.measure === "counts" ? "thousands of people, trend" : "%"; },
      source: "Statistics Finland, Labour Force Survey (tyti/135z)",
      method: "Statistics Finland's Labour Force Survey asks about 12,500 people each month whether they worked or looked for work, and publishes the figures for ages 15 to 74. The trend removes seasonal and random variation. Its latest months are revised as new months come in.",
    },
    regions: {
      title: "Regions", noun: "regions",
      measure: "TYOTOSUUS", measures: [...Object.entries(regions.measures), ["PER_VACANCY", "Unemployed jobseekers per open vacancy"]],
      defaults: ["SSS", "MK01", "MK06", "MK17"],
      choices: () => Object.entries(regions.areas),
      values(code) {
        const v = regions.values[code];
        return this.measure === "PER_VACANCY" ? ratio(v.TYOTTOMATLOPUSSA, v.AVPAIKATLOPUSSA) : v[this.measure];
      },
      months: regions.months, percent() { return this.measure === "TYOTOSUUS"; },
      unit() { return this.measure === "TYOTOSUUS" ? "% of workforce" : this.measure === "PER_VACANCY" ? "jobseekers per vacancy" : "persons, end of month"; },
      source: "KEHA Centre, employment service statistics (tyonv/12r5)",
      method: "Counts from the employment services' register, taken on the last weekday of each month. Open vacancies are only the jobs that employers reported to the employment services. The regions leave out the vacancies with a flexible or unknown location.",
    },
    occupations: {
      title: "Occupations", noun: "occupations",
      measure: "TYOTTOMATLOPUSSA", area: "SSS", family: "",
      measures: [...Object.entries(occupations.measures), ["PER_VACANCY", "Unemployed jobseekers per open vacancy"]],
      defaults: ["2512", "2511", "2514", "2519"],
      choices: () => Object.entries(occupations.occupations),
      values(code) {
        const v = occupations.values[this.area];
        return this.measure === "PER_VACANCY" ? ratio(v.TYOTTOMATLOPUSSA[code], v.AVPAIKATLOPUSSA[code]) : v[this.measure][code];
      },
      months: occupations.months, percent: () => false,
      unit() { return this.measure === "PER_VACANCY" ? "jobseekers per vacancy" : `persons, end of month, ${occupations.areas[this.area]}`; },
      source: "KEHA Centre, employment service statistics (tyonv/12ti)",
      method: "Counts from the employment services' register, taken on the last weekday of each month. Unemployed jobseekers are grouped by the occupation recorded for them, and open vacancies by the occupation of the job.",
    },
  };

  // the lines picked in each data set, and the colour slot each one holds while it is shown
  const picks = {};
  const pickState = (t) => {
    const k = t === topics.survey ? `survey:${t.measure}` : t.title;
    if (!picks[k]) {
      picks[k] = { list: [], slot: new Map() };
      for (const c of t.defaults) add(picks[k], c);
    }
    return picks[k];
  };
  function add(p, code) {
    const used = new Set(p.slot.values());
    p.slot.set(code, [...COLORS.keys()].find((i) => !used.has(i)));
    p.list.push(code);
  }
  function remove(p, code) {
    p.list.splice(p.list.indexOf(code), 1);
    p.slot.delete(code);
  }

  const state = { topic: "eu", from: "2015", smooth: false, index: false, query: "", sort: "value" };
  readAddress();

  // controls
  const seg = h("div", { class: "jm-seg", role: "radiogroup", "aria-label": "Data set" });
  for (const [key, t] of Object.entries(topics)) {
    const r = h("input", { type: "radio", name: "explorer-topic", value: key, checked: key === state.topic });
    r.addEventListener("change", () => { state.topic = key; state.query = ""; changed({ controls: true }); });
    seg.append(h("label", {}, r, t.title));
  }
  const topControls = h("div", { class: "jm-top" });
  const fromSel = h("select", { name: "explorer-from" }, ...Array.from({ length: 2026 - 2009 + 1 }, (_, i) => h("option", { value: 2009 + i }, String(2009 + i))));
  fromSel.value = state.from;
  fromSel.addEventListener("change", () => { state.from = fromSel.value; changed(); });
  const smooth = h("input", { type: "checkbox", name: "explorer-smooth", checked: state.smooth });
  smooth.addEventListener("change", () => { state.smooth = smooth.checked; changed(); });
  const index = h("input", { type: "checkbox", name: "explorer-index", checked: state.index });
  index.addEventListener("change", () => { state.index = index.checked; changed(); });
  const toolbar = h("div", { class: "jm-toolbar" },
    h("label", {}, "From", fromSel),
    h("label", {}, smooth, "12-month average"),
    h("label", {}, index, "Index, first month shown = 100"));
  const chartBox = h("div");

  const search = h("input", { type: "search", name: "explorer-search", autocomplete: "off" });
  search.addEventListener("input", () => { state.query = search.value; renderList(); });
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = visibleChoices().find(([c]) => !pickState(topics[state.topic]).list.includes(c));
    if (first) toggle(first[0]);
  });
  const sortSel = h("select", { name: "explorer-sort", "aria-label": "Sort the list" });
  sortSel.addEventListener("change", () => { state.sort = sortSel.value; renderList(); });
  const panelTools = h("div", { class: "jm-panel-tools" });
  const list = h("fieldset", { class: "jm-list" });
  const live = h("p", { class: "jm-live", id: "jm-limit", "aria-live": "polite" });
  const panel = h("div", { class: "jm-panel" }, h("div", { class: "jm-panel-in" }, panelTools, list, live));
  const foot = h("p", { class: "jm-foot" });
  container.className = "jm-explorer";
  container.dataset.explorer = "";
  container.append(seg, topControls, h("div", { class: "jm-main" }, h("div", {}, toolbar, chartBox), panel), foot);

  let chart = null, interacted = false;

  function buildControls() {
    const t = topics[state.topic];
    for (const r of seg.querySelectorAll("input")) r.checked = r.value === state.topic;
    const measure = h("select", { name: "explorer-measure" }, ...t.measures.map(([v, l]) => h("option", { value: v }, l)));
    measure.value = t.measure;
    measure.addEventListener("change", () => { t.measure = measure.value; changed({ controls: t === topics.survey }); });
    topControls.replaceChildren(h("label", { class: "jm-field" }, h("span", {}, "Measure"), measure));
    if (state.topic === "occupations") {
      const area = h("select", { name: "explorer-area" }, ...Object.entries(occupations.areas).map(([v, l]) => h("option", { value: v }, l)));
      area.value = t.area;
      area.addEventListener("change", () => { t.area = area.value; changed(); });
      topControls.append(h("label", { class: "jm-field" }, h("span", {}, "Area"), area));
    }
    search.value = state.query;
    search.placeholder = `Search ${t.choices().length} ${t.noun}`;
    const byCode = state.topic === "occupations";
    sortSel.replaceChildren(h("option", { value: "value" }, "Highest value first"), h("option", { value: "name" }, byCode ? "By occupation code" : "A to Z"));
    sortSel.value = state.sort;
    panelTools.replaceChildren(search, sortSel);
    if (byCode) {
      const counts = Object.fromEntries(FAMILIES.map(([f]) => [f, 0]));
      for (const [c] of t.choices()) if (c[0] in counts) counts[c[0]]++;
      const fam = h("select", { name: "explorer-family", "aria-label": "Occupation family" },
        h("option", { value: "" }, "All occupation families"),
        ...FAMILIES.map(([f, n]) => h("option", { value: f }, `${f} ${n} (${counts[f]})`)));
      fam.value = t.family;
      fam.addEventListener("change", () => { t.family = fam.value; renderList(); });
      panelTools.append(fam);
    }
  }

  // the options the list shows, after the family filter and the search
  function visibleChoices() {
    const t = topics[state.topic];
    const q = fold(state.query.trim());
    return t.choices().filter(([c, n]) => (!t.family || state.topic !== "occupations" || c[0] === t.family)
      && (!q || fold(n).includes(q) || c.toLowerCase().startsWith(q)));
  }

  function renderList(focusKey) {
    const t = topics[state.topic];
    const p = pickState(t);
    const fmt = formatter(t.percent());
    const latest = new Map(t.choices().map(([c]) => [c, lastValue(t.values(c) ?? [])]));
    const order = state.sort === "value"
      ? (a, b) => (latest.get(b[0]) ?? -Infinity) - (latest.get(a[0]) ?? -Infinity)
      : state.topic === "occupations" ? (a, b) => (a[0] === "SSS" ? -1 : b[0] === "SSS" ? 1 : a[0].localeCompare(b[0])) : (a, b) => a[1].localeCompare(b[1]);
    const shown = visibleChoices().sort(order);
    const full = p.list.length >= MAX;
    const row = ([code, name]) => {
      const on = p.list.includes(code);
      const box = h("input", { type: "checkbox", checked: on, "aria-describedby": full && !on ? "jm-limit" : null });
      if (on) box.style.accentColor = COLORS[p.slot.get(code)];
      box.addEventListener("change", () => toggle(code));
      const v = latest.get(code);
      const r = h("label", { class: `jm-row${full && !on ? " jm-full" : ""}`, "data-key": code },
        box,
        h("span", { class: "jm-name" }, state.topic === "occupations" && code !== "SSS" ? h("span", { class: "jm-code" }, code) : null, name),
        h("span", { class: "jm-val" }, v == null ? "no data" : fmt(v)));
      if (on) {
        r.addEventListener("pointerenter", () => chart?.highlight(name));
        r.addEventListener("pointerleave", () => chart?.highlight(null));
        r.addEventListener("focusin", () => chart?.highlight(name));
        r.addEventListener("focusout", () => chart?.highlight(null));
      }
      return r;
    };
    const pickedRows = shown.filter(([c]) => p.list.includes(c));
    const rest = shown.filter(([c]) => !p.list.includes(c));
    const clear = h("button", { type: "button", onclick: () => { for (const c of [...p.list]) remove(p, c); changed({ focus: search }); } }, "Clear");
    const family = state.topic === "occupations" && t.family ? FAMILIES.find(([f]) => f === t.family)[1] : null;
    list.replaceChildren(
      h("legend", { class: "jm-sr" }, `Lines to show, up to ${MAX}`),
      h("div", { class: "jm-head" }, h("span", {}, `Selected · ${p.list.length} of ${MAX}`), p.list.length ? clear : null),
      ...(pickedRows.length ? pickedRows : [h("div", { class: "jm-empty" }, p.list.length ? "None of the selected lines match." : `Tick ${t.noun} below to draw them.`)]).map((e) => (Array.isArray(e) ? row(e) : e)),
      h("div", { class: "jm-head" }, h("span", {}, state.query.trim() ? `Matches · ${rest.length}` : family ? `${family} · ${rest.length}` : `All ${t.noun} · ${rest.length}`)),
      ...(rest.length ? rest.map(row) : [h("div", { class: "jm-empty" }, state.query.trim() ? `No ${t.noun} match “${state.query.trim()}”.` : "All of them are selected.")]),
    );
    if (focusKey) list.querySelector(`.jm-row[data-key="${CSS.escape(focusKey)}"] input`)?.focus();
  }

  function toggle(code) {
    const p = pickState(topics[state.topic]);
    if (p.list.includes(code)) remove(p, code);
    else if (p.list.length >= MAX) {
      live.textContent = `${MAX} lines is the most this chart shows. Untick one to add another.`;
      renderList(code);
      return;
    } else add(p, code);
    live.textContent = "";
    changed({ focusKey: code });
  }

  function draw() {
    const t = topics[state.topic];
    const p = pickState(t);
    const names = new Map(t.choices());
    const from = `${state.from}-01`;
    const start = t.months.findIndex((m) => m >= from);
    let lines = p.list.map((c) => [names.get(c), state.smooth ? movingAverage(t.values(c) ?? [], 12) : t.values(c) ?? []]);
    if (state.index) {
      lines = lines.map(([n, v]) => {
        const first = v.slice(start).find((x) => x != null && x !== 0);
        return [n, v.map((x) => (x == null || first == null ? null : (100 * x) / first))];
      });
    }
    const current = rows(t.months, lines, from);
    chart = current.length
      ? lineChart(current, {
        height: (w) => (w >= 560 ? 420 : 340), percent: t.percent() && !state.index,
        yLabel: state.index ? "index, first month shown = 100" : t.unit(),
        domain: lines.map(([n]) => n), colors: p.list.map((c) => COLORS[p.slot.get(c)]), emphasizeFirst: false,
      })
      : null;
    chartBox.replaceChildren(chart ?? h("p", { class: "jm-empty" }, p.list.length ? "No data for this selection." : `Tick ${t.noun} in the list to draw them.`));

    const csv = ["month,series,value", ...current.map((r) => `${r.month},"${r.series}",${r.value}`)].join("\n");
    const lastMonth = current.reduce((m, r) => (r.month > m ? r.month : m), "");
    const copy = h("button", { type: "button" }, "Copy a link to this view");
    copy.addEventListener("click", async () => {
      interacted = true;
      writeAddress();
      try { await navigator.clipboard.writeText(location.href); copy.textContent = "Link copied"; } catch { copy.textContent = "Copy the address bar to share this view"; }
    });
    foot.replaceChildren(
      `${t.method} Source: ${t.source}${lastMonth ? `, data up to ${lastMonth}` : ""}. More in `, h("a", { href: "#about-the-data" }, "About the data"), ". ",
      h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `finland-job-market-${state.topic}.csv` }, "Download these lines as CSV"),
      " · ", copy);
  }

  function changed({ controls = false, focusKey, focus } = {}) {
    interacted = true;
    if (controls) buildControls();
    renderList(focusKey);
    draw();
    writeAddress();
    focus?.focus();
  }

  // the view in the address: ?data=eu&measure=TOTAL&lines=FI~SE&from=2015&avg=1&index=1
  function writeAddress() {
    if (!interacted) return;
    const t = topics[state.topic];
    const q = new URLSearchParams(location.search);
    q.set("data", state.topic);
    q.set("measure", t.measure);
    if (state.topic === "occupations") q.set("area", t.area); else q.delete("area");
    q.set("lines", pickState(t).list.join("~"));
    q.set("from", state.from);
    for (const [k, on] of [["avg", state.smooth], ["index", state.index]]) if (on) q.set(k, "1"); else q.delete(k);
    history.replaceState(history.state, "", `${location.pathname}?${q}${location.hash}`);
  }

  function readAddress() {
    const q = new URLSearchParams(location.search);
    const t = topics[q.get("data")];
    if (!t) return;
    state.topic = q.get("data");
    if (t.measures.some(([m]) => m === q.get("measure"))) t.measure = q.get("measure");
    if (state.topic === "occupations" && occupations.areas[q.get("area")]) t.area = q.get("area");
    const valid = new Set(t.choices().map(([c]) => c));
    const codes = (q.get("lines") ?? "").split("~").filter((c) => valid.has(c)).slice(0, MAX);
    if (q.has("lines")) {
      const k = t === topics.survey ? `survey:${t.measure}` : t.title;
      picks[k] = { list: [], slot: new Map() };
      for (const c of codes) add(picks[k], c);
    }
    if (/^\d{4}$/.test(q.get("from") ?? "")) state.from = q.get("from");
    state.smooth = q.get("avg") === "1";
    state.index = q.get("index") === "1";
  }

  buildControls();
  renderList();
  draw();
}
