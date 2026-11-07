// highlights.js
// the four fixed charts at the top of the page

import { COLORS, FAINT, lineChart, movingAverage, ratio, rows } from "./jobdata.js";

// Finland, Spain, Sweden and the EU, unemployment rate, seasonally adjusted
export function euRanking(el, { eu }) {
  const T = eu.series.TOTAL;
  const named = [["Finland", T.FI], ["Spain", T.ES], ["Sweden", T.SE], ["EU", T.EU27_2020]];
  return lineChart(rows(eu.months, named, "2015-01"), { percent: true, yLabel: "% of labour force" });
}

// change since September 2022 in the employed, the unemployed and the labour force, thousands, trend
export function laborForce(el, { lfs }) {
  const emp = lfs.series.tyolliset_trendi.values, une = lfs.series.tyottomat_trendi.values;
  const force = emp.map((v, i) => (v == null || une[i] == null ? null : v + une[i]));
  const base = lfs.months.indexOf("2022-09");
  const change = (s) => s.map((v) => (v == null ? null : v - s[base]));
  const named = [["Unemployed", change(une)], ["Labour force", change(force)], ["Employed", change(emp)]];
  const Plot = globalThis.Plot;
  return lineChart(rows(lfs.months, named, "2021-01"), {
    yLabel: "change since Sep 2022, thousands",
    marks: [Plot.ruleY([0], { stroke: "currentColor", strokeOpacity: 0.4 }), Plot.ruleX([new Date(Date.UTC(2022, 8, 1))], { stroke: "currentColor", strokeDasharray: "3,3", strokeOpacity: 0.5 })],
  });
}

// unemployed jobseekers per open vacancy at the employment services, whole country
export function perVacancy(el, { regions }) {
  const v = regions.values.SSS;
  const r = ratio(v.TYOTTOMATLOPUSSA, v.AVPAIKATLOPUSSA);
  const named = [["12-month average", movingAverage(r, 12)], ["Monthly", r]];
  return lineChart(rows(regions.months, named), { yLabel: "unemployed jobseekers per vacancy", colors: [COLORS[0], FAINT] });
}

// unemployed jobseekers registered as software developers
export function softwareDevelopers(el, { occupations }) {
  const o = occupations.values;
  const named = [["Whole country", o.SSS.TYOTTOMATLOPUSSA["2512"]], ["Uusimaa", o.MK01.TYOTTOMATLOPUSSA["2512"]]];
  return lineChart(rows(occupations.months, named), { yLabel: "unemployed jobseekers" });
}
