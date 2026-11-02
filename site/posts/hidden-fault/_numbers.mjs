// every number the prose of index.tmd uses: node site/posts/hidden-fault/_numbers.mjs
import { simulateLine, limitAlarms, featureAlarm, normalStats, plannedThroughput, standardize, pca3, spe } from "./line-model.js";

const data = simulateLine(), p = data.params, s = data.samples;
const f = featureAlarm(data);
const outOfSpec = s.find((x) => x.diameter < p.diameterSpec[0]);
const st = normalStats(data);
const pts = standardize(data), normal = s.filter((x) => x.phase === "normal");
const model = pca3(normal.map((x) => pts[x.t])), e = spe(pts, model);
const speLimit = 1.2 * Math.max(...normal.map((x) => e[x.t]));
const speFirst = s.find((x) => x.phase !== "normal" && e[x.t] > speLimit);
const rows = {
  "hours simulated": s.length,
  "wear starts at hour (day)": `${p.faultStart} (day ${p.faultStart / 24 + 1})`,
  "fast run ramp starts at hour": p.fastRunStart - p.rampHours,
  "physics feature: first alarm, hours after the wear starts": f.firstAlarm,
  "physics feature: false alarms in normal running": f.falseAlarms,
  "diameter first below 7.9 mm at hour (hours after wear starts)": `${outOfSpec.t} (${outOfSpec.t - p.faultStart})`,
  "warning time, hours (days)": `${outOfSpec.t - p.faultStart - f.firstAlarm} (${((outOfSpec.t - p.faultStart - f.firstAlarm) / 24).toFixed(1)})`,
  "lowest diameter on the fast run, mm": Math.min(...s.filter((x) => x.phase === "fast").map((x) => x.diameter)).toFixed(2),
  "wear at the end": `${(p.wearEnd * 100).toFixed(0)} %`,
  "SPE: first alarm, hours after the wear starts": speFirst ? speFirst.t - p.faultStart : "none",
  "SPE: false alarms in normal running": normal.filter((x) => e[x.t] > speLimit).length,
  "PCA variances (standardised/3 units)": model.values.map((v) => v.toExponential(2)).join(", "),
  "screw speed range in normal running, rpm": `${Math.min(...normal.map((x) => x.screw)).toFixed(0)} to ${Math.max(...normal.map((x) => x.screw)).toFixed(0)}`,
  "line speed range in normal running, m/min": `${Math.min(...normal.map((x) => x.speed)).toFixed(0)} to ${Math.max(...normal.map((x) => x.speed)).toFixed(0)}`,
  "melt pressure range in normal running, bar": `${Math.min(...normal.map((x) => x.pressure)).toFixed(0)} to ${Math.max(...normal.map((x) => x.pressure)).toFixed(0)}`,
  "throughput at 100 m/min, kg/h": plannedThroughput(100, p).toFixed(0),
  "rpm a new screw needs at 140 m/min": (plannedThroughput(140, p) / p.q).toFixed(1),
  "rpm the worn screw needs at 140 m/min (wear at the fast run)": (plannedThroughput(140, p) / (p.q * (1 - s[p.fastRunStart].wear))).toFixed(1),
  "screw top speed, rpm": p.nMax,
  "screw speed sd in normal running, rpm": st.screw.sd.toFixed(1),
  "3-sigma false-alarm share on Gaussian data": "0.27 %, one sample in about 370",
};
for (const k of [1, 1.5, 2, 2.5, 3]) rows[`single-signal limits at ${k} sigma`] = JSON.stringify(limitAlarms(data, k));
for (const [k, v] of Object.entries(rows)) console.log(`${k}: ${v}`);
