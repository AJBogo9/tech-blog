// gp-helpers.js
// Helper functions for the Gaussian Process interactive visualiser.
// Imported by the OJS cells in index.qmd via:
//   import { linspace, rbfKernel, gpPosterior } from "./gp-helpers.js"

/**
 * Generate n evenly-spaced values from lo to hi (inclusive).
 */
export function linspace(lo, hi, n) {
  return Array.from({ length: n }, (_, i) => lo + (i / (n - 1)) * (hi - lo));
}

/**
 * Squared exponential (RBF / Gaussian) kernel.
 * k(x1, x2) = sf^2 * exp(-0.5 * (x1 - x2)^2 / l^2)
 */
export function rbfKernel(x1, x2, l, sf) {
  return sf * sf * Math.exp(-0.5 * ((x1 - x2) / l) ** 2);
}

/**
 * Build the covariance matrix K(X1, X2).
 * X1 has shape (n,), X2 has shape (m,) -> returns (n x m) matrix.
 */
export function buildCovMatrix(X1, X2, l, sf) {
  return X1.map(xi => X2.map(xj => rbfKernel(xi, xj, l, sf)));
}

/** Dot product of two equal-length arrays. */
function dot(a, b) {
  return a.reduce((s, ai, i) => s + ai * b[i], 0);
}

/**
 * Cholesky decomposition: A = L L^T, returns lower-triangular L.
 * A must be symmetric positive definite.
 */
function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    let s = A[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] ** 2;
    L[j][j] = Math.sqrt(Math.max(s, 1e-14));
    for (let i = j + 1; i < n; i++) {
      let t = A[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / L[j][j];
    }
  }
  return L;
}

/** Forward substitution: solve L x = b (L lower-triangular). */
function fwdSolve(L, b) {
  const n = b.length;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = b[i];
    for (let j = 0; j < i; j++) x[i] -= L[i][j] * x[j];
    x[i] /= L[i][i];
  }
  return x;
}

/** Backward substitution: solve L^T x = b. */
function bwdSolve(L, b) {
  const n = b.length;
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i];
    for (let j = i + 1; j < n; j++) x[i] -= L[j][i] * x[j];
    x[i] /= L[i][i];
  }
  return x;
}

/**
 * Compute the GP posterior mean and standard deviation at each point in Xtest.
 *
 * Uses a single Cholesky factorisation of K(X,X) + σ²I, so the cost is
 * O(n³) once plus O(n²·m) for m test points — much faster during dragging
 * than re-solving n×n systems m times.
 *
 * @param {number[]} Xtrain  - training input locations
 * @param {number[]} ytrain  - noisy training outputs
 * @param {number[]} Xtest   - test input locations
 * @param {object}   opts    - { l, sf, noise }
 * @returns {{ mean: number[], std: number[] }}
 */
export function gpPosterior(Xtrain, ytrain, Xtest, { l = 1.0, sf = 1.0, noise = 0.2 } = {}) {
  if (Xtrain.length === 0) {
    return {
      mean: Xtest.map(() => 0),
      std:  Xtest.map(() => sf),
    };
  }

  const n = Xtrain.length;

  // K(X, X) + σ²_n I
  const K = buildCovMatrix(Xtrain, Xtrain, l, sf);
  for (let i = 0; i < n; i++) K[i][i] += noise * noise;

  // K = L L^T
  const L = cholesky(K);

  // alpha = K^{-1} y = L^{-T} (L^{-1} y)
  const alpha = bwdSolve(L, fwdSolve(L, ytrain));

  const mean = [];
  const std  = [];

  for (const xstar of Xtest) {
    const k_s = Xtrain.map(xi => rbfKernel(xstar, xi, l, sf));

    // Posterior mean: k_s · alpha
    mean.push(dot(k_s, alpha));

    // Posterior variance: k(x*,x*) - ||L^{-1} k_s||²
    // because k_s^T K^{-1} k_s = (L^{-1} k_s)^T (L^{-1} k_s)
    const v        = fwdSolve(L, k_s);
    const k_ss     = rbfKernel(xstar, xstar, l, sf);
    const variance = Math.max(0, k_ss - dot(v, v));
    std.push(Math.sqrt(variance));
  }

  return { mean, std };
}
