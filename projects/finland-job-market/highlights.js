// highlights.js
// the fixed charts above the explorer

import { COLORS, FAINT, lineChart, movingAverage, ratio, rows } from "./jobdata.js";

// Finland, Spain, Sweden and the EU, unemployment rate, seasonally adjusted
export function euRanking(el, { eu }) {
  const T = eu.series.TOTAL;
  const named = [["Finland", T.FI], ["Spain", T.ES], ["Sweden", T.SE], ["EU", T.EU27_2020]];
  return lineChart(rows(eu.months, named, "2015-01"), { percent: true, yLabel: "% of labour force" });
}

// the labour force as the employed plus the unemployed, thousands, trend:
// two lines, and the unemployed as the band between them
export function laborForce(el, { lfs }) {
  const emp = lfs.series.tyolliset_trendi.values, une = lfs.series.tyottomat_trendi.values;
  const force = emp.map((v, i) => (v == null || une[i] == null ? null : v + une[i]));
  const named = [["Labour force", force], ["Unemployed", une], ["Employed", emp]];
  const Plot = globalThis.Plot;
  return lineChart(rows(lfs.months, named, "2021-01"), {
    yLabel: "thousands of people",
    colors: ["currentColor", COLORS[0], COLORS[1]],
    band: { name: "Unemployed", lower: "Employed", upper: "Labour force" },
    zero: false,
    emphasizeFirst: false,
    marks: [Plot.ruleX([new Date(Date.UTC(2022, 8, 1))], { stroke: "currentColor", strokeDasharray: "3,3", strokeOpacity: 0.5 })],
  });
}

// unemployed jobseekers per open vacancy at the employment services, whole country
export function perVacancy(el, { regions }) {
  const v = regions.values.SSS;
  const r = ratio(v.TYOTTOMATLOPUSSA, v.AVPAIKATLOPUSSA);
  const named = [["12-month average", movingAverage(r, 12)], ["Monthly", r]];
  return lineChart(rows(regions.months, named), { yLabel: "unemployed jobseekers per vacancy", colors: [COLORS[0], FAINT] });
}

// occupation codes where ESCO places machine learning, data and software job titles
export const ML_CODES = ["2511", "2512", "2120", "2413"];

// one measure for some of those occupations, whole country, 12-month average
export function occupationLines(el, { occupations }, measure, codes = ML_CODES) {
  const v = occupations.values.SSS[measure];
  const named = codes.map((c) => [`${occupations.occupations[c]} (${c})`, movingAverage(v[c], 12)]);
  const yLabel = measure === "AVPAIKATLOPUSSA" ? "open vacancies, 12-month average" : "unemployed jobseekers, 12-month average";
  return lineChart(rows(occupations.months, named, "2015-01"), { yLabel, emphasizeFirst: false });
}
