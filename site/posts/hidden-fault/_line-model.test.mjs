// tests for the simulated cable line: node --test site/posts/hidden-fault/_line-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { simulateLine, limitAlarms, featureAlarm, outputPerTurn, standardize, pca3, physicsNormal, spe } from "./line-model.js";

test("simulateLine is deterministic for a seed", () =>
  assert.deepEqual(simulateLine({ seed: 11 }), simulateLine({ seed: 11 })));

test("diameter stays within 8 ± 0.05 mm before the fast run", () => {
  const { samples } = simulateLine();
  for (const s of samples.filter((s) => s.phase !== "fast")) assert.ok(Math.abs(s.diameter - 8) < 0.05, `t=${s.t}`);
});

test("the worn screw saturates on the fast run and the diameter leaves spec", () => {
  const fast = simulateLine().samples.filter((s) => s.t >= 690);
  assert.ok(fast.filter((s) => s.saturated).length >= 20);
  assert.ok(Math.min(...fast.map((s) => s.diameter)) < 7.9);
});

test("a new screw manages the fast product", () => {
  const { samples } = simulateLine({ wearEnd: 0 });
  assert.equal(samples.filter((s) => s.saturated).length, 0);
  assert.ok(Math.min(...samples.map((s) => s.diameter)) > 7.95);
});

test("run speeds do not repeat, so there are no products to set limits for", () => {
  const speeds = simulateLine().runs.map((r) => r.speed).filter((v) => v !== 140).sort((a, b) => a - b);
  assert.ok(speeds.length >= 10);
  // a few fixed levels would repeat exactly; continuous set points never do
  assert.equal(new Set(speeds).size, speeds.length);
});

// monitoring
const data = simulateLine();
const ramp = data.params.fastRunStart - data.params.rampHours - data.params.faultStart;

test("no raw signal leaves its 3-sigma limit while the wear grows", () =>
  assert.deepEqual(limitAlarms(data, 3), { falseAlarms: 0, firstCatch: null }));

test("catching the wear with single-signal limits costs false alarms", () => {
  for (let k = 0.5; k <= 4.001; k += 0.1) {
    const r = limitAlarms(data, k);
    if (r.firstCatch !== null && r.firstCatch < ramp - 24) assert.ok(r.falseAlarms >= 40, `k=${k.toFixed(1)}`);
  }
});

test("the physics feature alarms within 72 h of the wear and never before", () => {
  const f = featureAlarm(data);
  assert.equal(f.falseAlarms, 0);
  assert.ok(f.firstAlarm !== null && f.firstAlarm <= 72);
});

test("PCA's smallest component is the physics normal", () => {
  const pts = standardize(data).filter((_, i) => data.samples[i].phase === "normal");
  const m = pca3(pts), n = physicsNormal(data), c = m.components[2];
  assert.ok(Math.abs(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]) > 0.99);
});

test("worn points leave the PCA plane", () => {
  const pts = standardize(data);
  const normalIdx = data.samples.filter((s) => s.phase === "normal").map((s) => s.t);
  const model = pca3(normalIdx.map((i) => pts[i])), e = spe(pts, model);
  const maxNormal = Math.max(...normalIdx.map((i) => e[i]));
  const late = data.samples.filter((s) => s.phase === "wear" && s.t > 560).map((s) => e[s.t]);
  assert.ok(late.every((x) => x > maxNormal));
});

test("output per screw turn keeps falling when the worn screw saturates", () => {
  const f = outputPerTurn(data), mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const lastWear = data.samples.filter((s) => s.phase === "wear").slice(-24).map((s) => f[s.t]);
  const fast = data.samples.filter((s) => s.t >= data.params.fastRunStart).map((s) => f[s.t]);
  assert.ok(mean(fast) <= mean(lastWear) + 0.02, `fast ${mean(fast).toFixed(3)} vs last wear ${mean(lastWear).toFixed(3)}`);
});

test("a healthy twin run shares every noise draw before the fast run", () => {
  const twin = simulateLine({ wearEnd: 0 });
  for (const s of data.samples.filter((s) => s.phase !== "fast")) {
    const h = twin.samples[s.t];
    assert.ok(Math.abs(s.speed - h.speed) < 1e-9 && Math.abs(s.pressure - h.pressure) < 1e-9, `t=${s.t}`);
  }
});

test("an alarm that also rings on a healthy screw is not a catch", () => {
  for (const k of [1.5, 2]) assert.equal(limitAlarms(data, k).firstCatch, null, `k=${k}`);
});
