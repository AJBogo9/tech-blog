// run with: node --test site/posts/satellite-radar/_flood.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { boxMean, changeMeasure, decodeDb, flagCounts, DB_LO, DB_HI } from "./flood.js";

test("decodeDb maps 0 and 255 to the ends of the stored range", () => {
  const db = decodeDb(new Uint8Array([0, 0, 0, 255, 255, 0, 0, 255]));
  assert.deepEqual(Array.from(db), [DB_LO, DB_HI]);
});

test("boxMean matches a brute-force mean with windows clipped at the edges", () => {
  const n = 7, k = 3, img = new Float32Array(n * n).map((_, i) => (i * 37) % 11);
  const fast = boxMean(img, n, k);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < n && xx >= 0 && xx < n) { s += img[yy * n + xx]; c++; }
    }
    assert.ok(Math.abs(fast[y * n + x] - s / c) < 1e-5);
  }
});

test("a pixel that drops from 0.1 to 0.01 is -0.09 in power and -10 dB in the ratio", () => {
  const before = new Float32Array([0.1]), after = new Float32Array([0.01]);
  assert.ok(Math.abs(changeMeasure(before, after, "difference")[0] + 0.09) < 1e-7);
  assert.ok(Math.abs(changeMeasure(before, after, "ratio")[0] + 10) < 1e-5);
});

test("flagCounts splits flagged pixels into dry land and the rest", () => {
  const m = new Float32Array([-5, -5, 0, -5]), dry = new Uint8Array([1, 0, 1, 0]);
  const c = flagCounts(m, -3, dry);
  assert.equal(c.falseShare, 0.5);
  assert.ok(Math.abs(c.flaggedKm2 - 3e-4) < 1e-12);
  assert.ok(Math.abs(c.falseKm2 - 1e-4) < 1e-12);
});
