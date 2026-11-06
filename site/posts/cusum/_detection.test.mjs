// tests for the detectors and run-length formulas: node --test site/posts/cusum/_detection.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { rng, simulateLine, residual } from "./line-model.js";
import { tail, shewhartLimit, shewhartArl, siegmundArl, cusumThreshold, cusumDelay, llr, cusumPath, firstCrossing, normalRunningEvidence, evidenceMaxima } from "./detection.js";

const rand = rng(99);
const g = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
const noise = (n, mu = 0) => Array.from({ length: n }, () => g() + mu);
const close = (a, b, rel, msg) => assert.ok(Math.abs(a / b - 1) < rel, `${msg}: ${a} vs ${b}`);

test("normal tail probabilities", () => {
  close(tail(0), 0.5, 1e-6, "tail(0)");
  close(tail(3), 1.3498980316e-3, 1e-5, "tail(3)");
  close(tail(5), 2.8665157187e-7, 1e-5, "tail(5)");
  close(tail(-2), 0.9772498681, 1e-6, "tail(-2)");
});

test("a one-sided limit for one false alarm a year sits at 3.69 sd", () => {
  close(shewhartLimit(8760), 3.685, 1e-3, "k");
  close(shewhartArl(shewhartLimit(8760)), 8760, 1e-9, "round trip");
});

test("the CUSUM recursion is the largest sum of log-likelihood ratios over change times", () => {
  const ys = noise(300, 0.3), W = cusumPath(ys, 1);
  ys.forEach((_, n) => {
    let best = 0;
    for (let k = 0; k <= n; k++) { let sum = 0; for (let i = k; i <= n; i++) sum += llr(ys[i], 1); best = Math.max(best, sum); }
    assert.ok(Math.abs(W[n] - best) < 1e-9, `n=${n}`);
  });
});

test("the CUSUM is the summed evidence above its running minimum", () => {
  const ys = noise(500), W = cusumPath(ys, 0.8);
  let S = 0, m = 0;
  ys.forEach((y, n) => { S += llr(y, 0.8); m = Math.min(m, S); assert.ok(Math.abs(W[n] - (S - m)) < 1e-9); });
});

// run length of the CUSUM S_n = max(0, S_{n-1} + y_n - K) with threshold H
function runLength(H, K, mu) { let S = 0, n = 0; do { n++; S = Math.max(0, S + g() + mu - K); } while (S < H); return n; }
const meanRun = (H, K, mu, runs) => { let t = 0; for (let r = 0; r < runs; r++) t += runLength(H, K, mu); return t / runs; };

test("Siegmund's approximation matches simulation for a 1 sd design", () => {
  const H = cusumThreshold(8760, 0.5);
  close(H, 7.22, 2e-3, "threshold");
  close(meanRun(H, 0.5, 0, 1500), 8760, 0.1, "mean run length in normal running");
  close(meanRun(H, 0.5, 1, 10000), cusumDelay(8760, 1), 0.03, "delay");
  close(siegmundArl(H, 0.5, 0), 8760, 1e-6, "round trip");
});

test("Lorden's bound: a CUSUM with threshold h in nats runs at least e^h hours between false alarms", () => {
  for (const [delta, h] of [[1, 3], [1, 4], [2, 3]]) {
    const H = h / delta; // nats to sd units: W = delta * S
    assert.ok(meanRun(H, delta / 2, 0, 4000) >= Math.exp(h), `delta=${delta} h=${h}`);
  }
});

test("on the demo's wear the CUSUM alarms before a limit with the same false-alarm rate", () => {
  const data = simulateLine(), y = residual(data), start = data.params.faultStart;
  const cusum = firstCrossing(cusumPath(y, 1), cusumThreshold(8760, 0.5), start) - start;
  const limit = y.findIndex((v, t) => t >= start && v > shewhartLimit(8760)) - start;
  assert.ok(cusum < limit / 2, `cusum ${cusum} limit ${limit}`);
});

test("Ville's inequality: few runs of normal running ever collect log A nats of evidence", () => {
  const maxima = evidenceMaxima(normalRunningEvidence(4000, 200, 1, g));
  for (const a of [1, 2, 3, 4]) {
    const share = maxima.filter((m) => m >= a).length / maxima.length;
    assert.ok(share > 0 && share <= Math.exp(-a), `a=${a}: ${share} vs ${Math.exp(-a)}`);
  }
});

test("in normal running the summed evidence drifts down by delta^2 / 2 per hour", () => {
  const paths = normalRunningEvidence(2000, 100, 1, g);
  const meanEnd = paths.reduce((t, p) => t + p[99], 0) / paths.length;
  assert.ok(Math.abs(meanEnd + 50) < 1, `mean after 100 hours ${meanEnd}`);
});
