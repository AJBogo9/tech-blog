// flood.js
// pure functions behind the flood demo: no DOM, so node can test them

export const N = 640;             // pixels per side
export const PIXEL_M = 10;        // metres per pixel
export const DB_LO = -30, DB_HI = 10;   // dB range stored in the 8-bit radar PNGs

// 8-bit PNG value -> backscatter in dB
export function decodeDb(bytes, stride = 4) {
  const out = new Float32Array(bytes.length / stride);
  for (let i = 0; i < out.length; i++) out[i] = DB_LO + (bytes[i * stride] / 255) * (DB_HI - DB_LO);
  return out;
}

export function dbToPower(db) {
  const out = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) out[i] = Math.pow(10, db[i] / 10);
  return out;
}

// mean over a k x k window (k odd), windows clipped at the edges
export function boxMean(img, n, k) {
  if (k <= 1) return img;
  const S = new Float64Array((n + 1) * (n + 1));
  for (let y = 0; y < n; y++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      row += img[y * n + x];
      S[(y + 1) * (n + 1) + x + 1] = S[y * (n + 1) + x + 1] + row;
    }
  }
  const r = (k - 1) / 2, out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(n, y + r + 1);
    for (let x = 0; x < n; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(n, x + r + 1);
      const sum = S[y1 * (n + 1) + x1] - S[y0 * (n + 1) + x1] - S[y1 * (n + 1) + x0] + S[y0 * (n + 1) + x0];
      out[y * n + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

// the two change measures: after minus before in power, or after over before in dB
export function changeMeasure(before, after, method) {
  const out = new Float32Array(before.length);
  if (method === "difference") for (let i = 0; i < out.length; i++) out[i] = after[i] - before[i];
  else for (let i = 0; i < out.length; i++) out[i] = 10 * Math.log10(after[i] / before[i]);
  return out;
}

// flag pixels whose measure falls below the threshold; count them on dry and on wet land
export function flagCounts(measure, threshold, dry) {
  let flagged = 0, onDry = 0, dryTotal = 0;
  for (let i = 0; i < measure.length; i++) {
    if (dry[i]) dryTotal++;
    if (measure[i] < threshold) {
      flagged++;
      if (dry[i]) onDry++;
    }
  }
  const km2 = (PIXEL_M * PIXEL_M) / 1e6;
  return {
    flaggedKm2: flagged * km2,
    falseKm2: onDry * km2,
    falseShare: dryTotal ? onDry / dryTotal : 0,
    floodKm2: (flagged - onDry) * km2,
  };
}
