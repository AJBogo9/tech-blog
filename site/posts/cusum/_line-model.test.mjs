// tests for the simulated cable line: node --test site/posts/cusum/_line-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { simulateLine, limitAlarms, featureAlarm, outputPerTurn, residual } from "./line-model.js";

test("simulateLine is deterministic for a seed", () =>
  assert.deepEqual(simulateLine({ seed: 11 }), simulateLine({ seed: 11 })));

test("diameter stays within 8 ± 0.05 mm before the fast run", () => {
  const { samples } = simulateLine();
  for (const s of samples.filter((s) => s.phase !== "fast")) assert.ok(Math.abs(s.diameter - 8) < 0.05, `t=${s.t}`);
});

test("the worn screw saturates on the fast run and the diameter leaves spec", () => {
  const fast = simulateLine().samples.filter((s) => s.t >= 1410);
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

test("the output per turn alarms within 100 h of the wear at a 4 sd limit and never before", () => {
  const f = featureAlarm(data);
  assert.equal(f.falseAlarms, 0);
  assert.ok(f.firstAlarm !== null && f.firstAlarm <= 100);
});

test("the residual is close to white noise in normal running", () => {
  const y = residual(data), n = data.samples.filter((s) => s.phase === "normal").map((s) => y[s.t]);
  const mean = n.reduce((a, b) => a + b, 0) / n.length;
  const sd = Math.sqrt(n.reduce((a, b) => a + (b - mean) ** 2, 0) / n.length);
  let r1 = 0; for (let i = 1; i < n.length; i++) r1 += n[i] * n[i - 1];
  assert.ok(Math.abs(mean) < 1e-9 && Math.abs(sd - 1) < 1e-9);
  assert.ok(Math.abs(r1 / (n.length - 1)) < 0.1, `lag-1 ${r1 / (n.length - 1)}`);
});

test("the residual's spread does not depend on the product", () => {
  const y = residual(data), n = data.samples.filter((s) => s.phase === "normal");
  const sdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  const slow = sdOf(n.filter((s) => s.speed < 95).map((s) => y[s.t])), fast = sdOf(n.filter((s) => s.speed >= 95).map((s) => y[s.t]));
  assert.ok(Math.abs(slow / fast - 1) < 0.15, `slow ${slow.toFixed(3)} fast ${fast.toFixed(3)}`);
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
  const twin = simulateLine({ wearEnd: 0 });
  assert.equal(featureAlarm(twin, 1).firstAlarm, null);
});
