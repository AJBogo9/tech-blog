// line-model.js
// A simulated cable insulation line and the maths to monitor it.
// Imported by the {js} cells in index.tmd via:
//   const m = await import("./line-model.js");

export const DEFAULTS = {
  seed: 11,
  hours: 720,
  faultStart: 480,
  fastRunStart: 690,
  rampHours: 4,
  wearEnd: 0.13,
  D0: 8.0, // cable diameter set point, mm
  d: 5.0, // conductor diameter, mm
  rho: 920, // polyethylene, kg/m^3
  q: 4.0, // output per screw turn of a new screw, kg/h per rpm
  nMax: 62, // screw top speed, rpm
  fastSpeed: 140, // the fastest product, m/min
  diameterSpec: [7.9, 8.1], // mm
};

// mulberry32
export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// plastic the line needs to keep the diameter at its set point, kg/h
export function plannedThroughput(speed, params) {
  const { rho, D0, d } = params;
  return rho * (Math.PI / 4) * (D0 * D0 - d * d) * 1e-6 * 60 * speed;
}

// line speed set points: runs at speeds that never repeat, ramps between them,
// slower products while the screw wears, then the fastest product at the end
function schedule(p, rand) {
  const v = [], runs = [];
  const rampStart = p.fastRunStart - p.rampHours;
  const pick = (t) =>
    t < p.faultStart - 30 ? (rand() < 0.12 ? p.fastSpeed : 60 + rand() * 70) : 70 + rand() * 50;
  let level = pick(0);
  runs.push({ start: 0, speed: level });
  while (v.length < rampStart) {
    const hold = 12 + Math.floor(rand() * 36);
    for (let k = 0; k < hold && v.length < rampStart; k++) v.push(level);
    if (v.length >= rampStart) break;
    const next = pick(v.length);
    runs.push({ start: v.length, speed: next });
    for (let r = 1; r <= p.rampHours && v.length < rampStart; r++) v.push(level + ((next - level) * r) / p.rampHours);
    level = next;
  }
  const from = v[v.length - 1];
  runs.push({ start: v.length, speed: p.fastSpeed });
  for (let r = 1; r <= p.rampHours; r++) v.push(from + ((p.fastSpeed - from) * r) / p.rampHours);
  while (v.length < p.hours) v.push(p.fastSpeed);
  return { v, runs };
}

export function simulateLine(opts = {}) {
  const params = { ...DEFAULTS, ...opts };
  const p = params, rand = rng(p.seed), g = () => gaussian(rand);
  const { v, runs } = schedule(p, rand);
  const samples = v.map((set, t) => {
    const speed = set + g() * 0.6;
    const wear = t < p.faultStart ? 0 : (p.wearEnd * (t - p.faultStart)) / (p.hours - p.faultStart);
    const needed = plannedThroughput(speed, p);
    const nReq = needed / (p.q * (1 - wear));
    const saturated = nReq > p.nMax;
    const n = Math.min(nReq, p.nMax);
    const actual = p.q * (1 - wear) * n;
    const temp = 200 + 3 * Math.sin(t / 37) + g() * 0.5;
    // the insulation's cross-section scales with the plastic actually delivered
    const diameter = Math.sqrt(p.d * p.d + (p.D0 * p.D0 - p.d * p.d) * (actual / needed)) + g() * 0.008;
    const screw = n + g() * 0.25;
    const pressure = 150 * Math.pow(actual / 170, 0.45) * Math.exp(-0.02 * (temp - 200)) + g() * 0.8;
    const phase = t >= p.fastRunStart - p.rampHours ? "fast" : t >= p.faultStart ? "wear" : "normal";
    return { t, speed, screw, pressure, diameter, wear, saturated, phase };
  });
  return { params, runs, samples };
}

// ---- monitoring ----

export const SIGNALS = ["speed", "screw", "pressure"];

const isNormal = (s) => s.phase === "normal";

function meanSd(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) };
}

// mean and spread of each signal over normal running
export function normalStats(data) {
  const normal = data.samples.filter(isNormal);
  return Object.fromEntries(SIGNALS.map((k) => [k, meanSd(normal.map((s) => s[k]))]));
}

// the same line with a screw that never wears: same seed, so the same noise draws
const twins = new WeakMap();
function healthyTwin(data) {
  if (!twins.has(data)) twins.set(data, simulateLine({ ...data.params, wearEnd: 0 }));
  return twins.get(data);
}

// single-signal limits at mean ± k sd: false alarms in normal running, and the
// first worn-screw hour (after the wear started) that a limit catches because of
// the wear, meaning the healthy twin's hour stays inside every limit
export function limitAlarms(data, k) {
  const st = normalStats(data), twin = healthyTwin(data);
  const outside = (s) => SIGNALS.some((key) => Math.abs(s[key] - st[key].mean) > k * st[key].sd);
  const falseAlarms = data.samples.filter((s) => isNormal(s) && outside(s)).length;
  const caught = data.samples.find((s) => s.phase === "wear" && outside(s) && !outside(twin.samples[s.t]));
  return { falseAlarms, firstCatch: caught ? caught.t - data.params.faultStart : null };
}

// plastic that left the extruder, from the measured diameter and line speed, kg/h
export function deliveredThroughput(s, params) {
  const { rho, d } = params;
  return rho * (Math.PI / 4) * (s.diameter * s.diameter - d * d) * 1e-6 * 60 * s.speed;
}

// the physics feature: plastic out per screw turn, kg/h per rpm
export function outputPerTurn(data) {
  return data.samples.map((s) => deliveredThroughput(s, data.params) / s.screw);
}

// lower alarm line on the output per screw turn, from normal running
export function featureAlarm(data, kSigma = 4) {
  const f = outputPerTurn(data);
  const { mean, sd } = meanSd(f.filter((_, i) => isNormal(data.samples[i])));
  const limit = mean - kSigma * sd;
  const falseAlarms = f.filter((x, i) => isNormal(data.samples[i]) && x < limit).length;
  const first = data.samples.find((s) => !isNormal(s) && f[s.t] < limit);
  return { limit, falseAlarms, firstAlarm: first ? first.t - data.params.faultStart : null };
}

// [speed, screw, pressure] as z-scores over normal running, divided by 3,
// so the 3-sigma limits are the box ±1
export function standardize(data) {
  const st = normalStats(data);
  return data.samples.map((s) => SIGNALS.map((k) => (s[k] - st[k].mean) / (3 * st[k].sd)));
}

// symmetric 3x3 eigen-decomposition by Jacobi rotations; eigenvectors are columns of V
function jacobi3(M) {
  const a = M.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-15) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], V };
}

// principal components of 3D points, sorted by descending variance
export function pca3(points) {
  const n = points.length;
  const mean = [0, 1, 2].map((j) => points.reduce((a, p) => a + p[j], 0) / n);
  const cov = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => points.reduce((a, p) => a + (p[i] - mean[i]) * (p[j] - mean[j]), 0) / n));
  const { values, V } = jacobi3(cov);
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  return { mean, values: order.map((i) => values[i]), components: order.map((i) => [V[0][i], V[1][i], V[2][i]]) };
}

// unit normal of the sheet "screw speed proportional to line speed" in
// standardize() coordinates, pointing the way wear moves the points
export function physicsNormal(data) {
  const st = normalStats(data);
  const c = plannedThroughput(1, data.params) / data.params.q; // rpm per m/min for a new screw
  const n = [-c * st.speed.sd, st.screw.sd, 0];
  const len = Math.hypot(...n);
  return n.map((x) => x / len);
}

// squared distance of each point from the plane of the first `keep` components
export function spe(points, model, keep = 2) {
  return points.map((p) => {
    const r = p.map((x, j) => x - model.mean[j]);
    for (const c of model.components.slice(0, keep)) {
      const dot = r[0] * c[0] + r[1] * c[1] + r[2] * c[2];
      for (let j = 0; j < 3; j++) r[j] -= dot * c[j];
    }
    return r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  });
}
