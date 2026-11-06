// detection.js
// Detectors for a rise in the mean of a sequence that is N(0, 1) before the change,
// and the run-length formulas the theory section quotes. Everything is in sd units.
// Imported by figures.js, demo.js and the tests.

// complementary error function, fractional error below 1.2e-7 (Numerical Recipes, erfcc)
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

// P(Z > x) for a standard normal Z
export const tail = (x) => 0.5 * erfc(x / Math.SQRT2);

// root of an increasing function f on [lo, hi]
function solveIncreasing(f, lo, hi) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- one sample at a time: alarm when y_n > k ----

// mean run length of the limit when y has mean mu
export const shewhartArl = (k, mu = 0) => 1 / tail(k - mu);

// the limit whose mean run length in normal running is gamma
export const shewhartLimit = (gamma) => solveIncreasing((k) => shewhartArl(k) - gamma, 0, 12);

// ---- CUSUM: S_n = max(0, S_{n-1} + y_n - K), alarm when S_n >= H ----

// Siegmund's approximation to the mean run length when y has mean mu, starting from S_0 = 0
export function siegmundArl(H, K, mu) {
  const D = mu - K, b = H + 1.166;
  if (Math.abs(D) < 1e-9) return b * b;
  return (Math.exp(-2 * D * b) + 2 * D * b - 1) / (2 * D * D);
}

// the threshold H whose mean run length in normal running is gamma
export const cusumThreshold = (gamma, K) => solveIncreasing((H) => siegmundArl(H, K, 0) - gamma, 0, 200);

// delay of a CUSUM designed for a change of delta, at a mean run length gamma in normal running
export function cusumDelay(gamma, delta) {
  const K = delta / 2;
  return siegmundArl(cusumThreshold(gamma, K), K, delta);
}

// first-order delay of the best detector: log(gamma) over the KL divergence delta^2 / 2
export const firstOrderDelay = (gamma, delta) => Math.log(gamma) / (delta * delta / 2);

// ---- statistics on a sequence ----

// log-likelihood ratio of one sample, N(delta, 1) against N(0, 1)
export const llr = (y, delta) => delta * (y - delta / 2);

// Page's CUSUM on the log-likelihood ratio: W_n = max(0, W_{n-1} + s_n)
export function cusumPath(ys, delta) {
  let w = 0;
  return ys.map((y) => (w = Math.max(0, w + llr(y, delta))));
}

// first index from `from` on where the path reaches h, or null
export function firstCrossing(path, h, from = 0) {
  for (let i = from; i < path.length; i++) if (path[i] >= h) return i;
  return null;
}

// ---- Ville's inequality ----

// summed evidence S_n = s_1 + ... + s_n of `runs` simulated runs of normal running, `hours` hours each;
// gauss draws one N(0, 1) sample
export function normalRunningEvidence(runs, hours, delta, gauss) {
  return Array.from({ length: runs }, () => {
    let S = 0;
    return Array.from({ length: hours }, () => (S += llr(gauss(), delta)));
  });
}

// the highest point each path reaches
export const evidenceMaxima = (paths) => paths.map((p) => p.reduce((m, v) => Math.max(m, v), -Infinity));
