// line-model.js
// A simulated cable insulation line and the residual the detectors watch.
// Imported by the {js} cells in index.tmd via:
//   const m = await import("./line-model.js");

export const DEFAULTS = {
  seed: 11,
  hours: 1440,
  faultStart: 720,
  fastRunStart: 1410,
  rampHours: 4,
  wearEnd: 0.13,
  D0: 8.0, // cable diameter set point, mm
  d: 5.0, // conductor diameter, mm
  rho: 920, // polyethylene, kg/m^3
  q: 4.0, // output per screw turn of a new screw, kg/h per rpm
  nMax: 62, // screw top speed, rpm
  fastSpeed: 140, // the fastest product, m/min
  diameterSpec: [7.9, 8.1], // mm
  screwNoise: 0.006, // screw speed reading error, share of the reading
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
    const screw = n * (1 + g() * p.screwNoise);
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

// mean and spread of the output per screw turn over normal running
export function outputStats(data) {
  const f = outputPerTurn(data);
  return meanSd(f.filter((_, i) => isNormal(data.samples[i])));
}

// the residual the detectors watch: output per screw turn, scaled so normal
// running has mean 0 and sd 1, and signed so that wear pushes it up
export function residual(data) {
  const { mean, sd } = outputStats(data);
  return outputPerTurn(data).map((x) => (mean - x) / sd);
}

// lower alarm line at k sd on the output per screw turn: false alarms in normal
// running, and the first hour after the wear starts that rings because of the
// wear, meaning the healthy twin's hour stays above the line
export function featureAlarm(data, k = 4) {
  const { mean, sd } = outputStats(data);
  const limit = mean - k * sd;
  const f = outputPerTurn(data), fTwin = outputPerTurn(healthyTwin(data));
  const falseAlarms = f.filter((x, i) => isNormal(data.samples[i]) && x < limit).length;
  const caught = data.samples.find((s) => !isNormal(s) && f[s.t] < limit && fTwin[s.t] >= limit);
  return { limit, falseAlarms, firstAlarm: caught ? caught.t - data.params.faultStart : null };
}
