// every number the prose of index.tmd uses: node site/posts/cusum/_numbers.mjs
import { simulateLine, limitAlarms, featureAlarm, outputStats, residual, rng, plannedThroughput } from "./line-model.js";
import { shewhartLimit, shewhartArl, cusumThreshold, cusumDelay, siegmundArl, firstOrderDelay, cusumPath, firstCrossing } from "./detection.js";

const YEAR = 8760;
const data = simulateLine(), p = data.params, s = data.samples;
const normal = s.filter((x) => x.phase === "normal");
const out = outputStats(data), y = residual(data);
const outOfSpec = s.find((x) => x.diameter < p.diameterSpec[0]);
const yn = normal.map((x) => y[x.t]);
let r1 = 0; for (let i = 1; i < yn.length; i++) r1 += yn[i] * yn[i - 1];
const slope = (p.q * p.wearEnd) / (p.hours - p.faultStart) / out.sd; // sd per hour

// a Gaussian sampler for the Monte Carlo checks
const rand = rng(2026), g = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
function mcCusum(H, K, mu, runs) {
  let tot = 0;
  for (let r = 0; r < runs; r++) { let S = 0, n = 0; do { n++; S = Math.max(0, S + g() + mu - K); } while (S < H); tot += n; }
  return tot / runs;
}
// the same CUSUM on an AR(1) residual with marginal sd 1 and lag-one correlation beta
function mcCusumAr(beta, runs) {
  let tot = 0;
  const sdW = Math.sqrt(1 - beta * beta);
  for (let r = 0; r < runs; r++) {
    let S = 0, n = 0, x = g();
    do { n++; x = beta * x + sdW * g(); S = Math.max(0, S + x - 0.5); } while (S < H1);
    tot += n;
  }
  return tot / runs;
}
const H1 = cusumThreshold(YEAR, 0.5), kY = shewhartLimit(YEAR);

// the demo's ramp, over many seeds: hours from the wear starting to the first alarm
function rampDelays(seeds) {
  const res = { shew: [], cusum: [], cusumFalse: 0, normalHours: 0, spec: [] };
  for (const seed of seeds) {
    const d = simulateLine({ seed }), ys = residual(d), W = cusumPath(ys, 1);
    let falseN = 0, w = 0;
    ys.forEach((v, t) => { if (d.samples[t].phase === "normal") { w = Math.max(0, w + (v - 0.5)); if (w >= H1) { falseN++; w = 0; } } });
    res.cusumFalse += falseN; res.normalHours += d.samples.filter((x) => x.phase === "normal").length;
    res.cusum.push(firstCrossing(W, H1, d.params.faultStart) - d.params.faultStart);
    res.shew.push(ys.findIndex((v, t) => t >= d.params.faultStart && v > kY) - d.params.faultStart);
    const o = d.samples.find((x) => x.diameter < d.params.diameterSpec[0]);
    res.spec.push(o.t - d.params.faultStart);
  }
  const mean = (a) => (a.reduce((x, z) => x + z, 0) / a.length).toFixed(1);
  return { shewhart: mean(res.shew), cusum: mean(res.cusum), outOfSpec: mean(res.spec), cusumFalse: res.cusumFalse, expectedFalse: (res.normalHours / YEAR).toFixed(1) };
}
const seeds = Array.from({ length: 200 }, (_, i) => 1000 + i);
const W = cusumPath(y, 1);
// the reference sd off by one standard error (720 hours): the residual's true sd is 1 + e
const se = 1 / Math.sqrt(2 * normal.length);
const arlIfSd = (sd) => siegmundArl(H1 / sd, 0.5 / sd, 0);
function mcCusumSd(sd, runs) {
  let tot = 0;
  for (let r = 0; r < runs; r++) { let S = 0, n = 0; do { n++; S = Math.max(0, S + sd * g() - 0.5); } while (S < H1); tot += n; }
  return tot / runs;
}

const rows = {
  "hours simulated (days)": `${s.length} (${s.length / 24})`,
  "wear starts at hour (day)": `${p.faultStart} (day ${p.faultStart / 24 + 1})`,
  "fast run ramp starts at hour (day)": `${p.fastRunStart - p.rampHours} (day ${((p.fastRunStart - p.rampHours) / 24 + 1).toFixed(1)})`,
  "wear at the end": `${(p.wearEnd * 100).toFixed(0)} %`,
  "diameter first below 7.9 mm at hour (hours after wear starts)": `${outOfSpec.t} (${outOfSpec.t - p.faultStart})`,
  "lowest diameter on the fast run, mm": Math.min(...s.filter((x) => x.phase === "fast").map((x) => x.diameter)).toFixed(2),
  "throughput at 100 m/min, kg/h": plannedThroughput(100, p).toFixed(0),
  "output per turn in normal running: mean, sd (kg/h per rpm)": `${out.mean.toFixed(3)}, ${out.sd.toFixed(4)}`,
  "1 sd of output per turn as wear": `${((out.sd / p.q) * 100).toFixed(2)} %`,
  "residual lag-1 autocorrelation in normal running": (r1 / (yn.length - 1)).toFixed(3),
  "ramp slope of the residual, sd per hour": slope.toFixed(4),
  "residual mean at the end of the wear, sd": (slope * (p.hours - p.faultStart)).toFixed(1),
  "residual rise when the limit catches seed 11 (86 h after the wear starts), sd": (slope * (y.findIndex((v, t) => t >= p.faultStart && v > kY) - p.faultStart)).toFixed(2),
  "step 2, k = 3: false alarms in normal running, first catch": JSON.stringify(featureAlarm(data, 3)),
  "step 2, k = 3.7: false alarms in normal running, first catch": JSON.stringify(featureAlarm(data, 3.7)),
  "step 2, k = 4: false alarms in normal running, first catch": JSON.stringify(featureAlarm(data, 4)),
  "one-sided limit for one false alarm a year, k": kY.toFixed(2),
  "mean hours between false alarms at k = 3, 3.7 (one-sided)": `${shewhartArl(3).toFixed(0)}, ${shewhartArl(3.7).toFixed(0)}`,
  "limit at one a year, step of 1 sd: delay, h": shewhartArl(kY, 1).toFixed(0),
  "limit at one a year, step of 1 sd, P(ring per hour)": (1 / shewhartArl(kY, 1)).toFixed(4),
  "KL of a 1 sd step, nats per hour": 0.5,
  "log(one year)": Math.log(YEAR).toFixed(2),
  "first-order delay log(gamma)/KL, 1 sd step, h": firstOrderDelay(YEAR, 1).toFixed(1),
  "CUSUM, 1 sd design: threshold for one false alarm a year (Siegmund), nats": H1.toFixed(2),
  "CUSUM, 1 sd step: delay (Siegmund), h": cusumDelay(YEAR, 1).toFixed(1),
  "CUSUM at threshold log(year): mean run length in normal running (Siegmund), h": siegmundArl(Math.log(YEAR), 0.5, 0).toFixed(0),
  "Monte Carlo: CUSUM 1 sd, threshold 7.22, mean run length in normal running (2000 runs)": mcCusum(H1, 0.5, 0, 2000).toFixed(0),
  "Monte Carlo: CUSUM 1 sd, threshold 7.22, delay for a 1 sd step (20000 runs)": mcCusum(H1, 0.5, 1, 20000).toFixed(2),
  "limit vs CUSUM at one a year, step of 1 sd: ratio": (shewhartArl(kY, 1) / cusumDelay(YEAR, 1)).toFixed(1),
  "limit at one a year, step of 2 sd: delay; CUSUM; ratio": `${shewhartArl(kY, 2).toFixed(1)}; ${cusumDelay(YEAR, 2).toFixed(2)}; ${(shewhartArl(kY, 2) / cusumDelay(YEAR, 2)).toFixed(1)}`,
  "seed 11 ramp: CUSUM (threshold 7.22) alarm, hours after wear": firstCrossing(W, H1, p.faultStart) - p.faultStart,
  "seed 11 ramp: limit at one a year, hours after wear": y.findIndex((v, t) => t >= p.faultStart && v > kY) - p.faultStart,
  "200 seeds, ramp: mean delays and CUSUM false alarms in normal running": JSON.stringify(rampDelays(seeds)),
  "standard error of the reference sd, 720 hours": `${(se * 100).toFixed(1)} %`,
  "CUSUM 7.22: mean hours between false alarms if the true sd is 1 + se, 1 - se (Siegmund)": `${arlIfSd(1 + se).toFixed(0)}, ${arlIfSd(1 - se).toFixed(0)}`,
  "Monte Carlo of the same, true sd 1 + se (2000 runs)": mcCusumSd(1 + se, 2000).toFixed(0),
  "Monte Carlo: CUSUM 7.22 on AR(1) residual, lag-one 0.3: mean hours between false alarms (1000 runs)": mcCusumAr(0.3, 1000).toFixed(0),
};
for (const k of [1, 1.5, 2, 2.5, 3, 3.5, 4]) rows[`step 1, single-signal limits at ${k} sigma`] = JSON.stringify(limitAlarms(data, k));
for (const [k, v] of Object.entries(rows)) console.log(`${k}: ${v}`);
