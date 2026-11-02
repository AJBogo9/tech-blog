// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the results dock's maths: the signals of each plot, pixels to times and back, a trace's value
// at a time, the zoom window, and how verdicts read (viewing design 5.5)

// a click adds a signal to the last plot, Shift-click puts it in a new plot below; a signal is
// never twice in one plot
export function addSignal(layout, ref, newPlot) {
  if (newPlot || layout.length === 0) return [...layout, [ref]];
  const last = layout.length - 1;
  if (layout[last].includes(ref)) return layout;
  return layout.map((plot, i) => (i === last ? [...plot, ref] : plot));
}

// the output ports of block `sid` among the sources of the lines drawn ("4.y2"), each once, by port
// number
export function outputsOf(sources, sid) {
  const port = (ref) => Number(ref.slice(ref.lastIndexOf('.') + 2));
  const mine = sources.filter((ref) => typeof ref === 'string' && ref.slice(0, ref.lastIndexOf('.')) === sid);
  return [...new Set(mine)].sort((a, b) => port(a) - port(b));
}

// the newest run that finished well, of runs listed newest first
export const latestOk = (runs) => runs.find((r) => r.status === 'ok') ?? null;

// a signal taken out of a plot; a plot left empty goes
export function removeSignal(layout, plot, ref) {
  return layout.map((p, i) => (i === plot ? p.filter((r) => r !== ref) : p)).filter((p) => p.length > 0);
}

export const timeAt = (x, m) => m.t0 + ((x - m.x0) / (m.x1 - m.x0)) * (m.t1 - m.t0);
export const xAt = (t, m) => m.x0 + ((t - m.t0) / (m.t1 - m.t0)) * (m.x1 - m.x0);

// a trace's value at time t, linear between its points; null outside them
export function valueAt(trace, t) {
  const { t: ts, v } = trace;
  if (ts.length === 0 || t < ts[0] || t > ts[ts.length - 1]) return null;
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  if (ts[hi] === ts[lo]) return v[hi];
  if (t >= ts[hi]) return v[hi];
  return v[lo] + ((v[hi] - v[lo]) * (t - ts[lo])) / (ts[hi] - ts[lo]);
}

// a readout's value of a trace at t: at the fixed cursor the run's own samples (`exact`, as
// /api/values gives them for the values on the lines), else between the plot's points
export function readoutValue(trace, t, exact) {
  const sample = exact && exact.t === t ? exact.values?.[trace.ref]?.[trace.column ?? 0] : undefined;
  return sample ?? valueAt(trace, t);
}

// the window between two times, ordered and inside the run; null when it would be empty
export function zoomWindow(a, b, full) {
  const lo = Math.max(Math.min(a, b), full[0]);
  const hi = Math.min(Math.max(a, b), full[1]);
  return hi - lo > 1e-9 ? [lo, hi] : null;
}

// the script values a run changed from the run before it: "kp 2 → 5, kd = 1, ki gone", at most
// three named; empty when either run kept no values (records older than that) or nothing changed
export function valueChanges(before, run) {
  const a = before?.values;
  const b = run?.values;
  if (!a || !b || Object.keys(a).length === 0) return '';
  const shown = (v) => (typeof v === 'number' ? number(v) : String(v));
  const changes = [];
  for (const [name, value] of Object.entries(b)) {
    if (!(name in a)) changes.push(`${name} = ${shown(value)}`);
    else if (JSON.stringify(a[name]) !== JSON.stringify(value)) changes.push(`${name} ${shown(a[name])} → ${shown(value)}`);
  }
  for (const name of Object.keys(a)) if (!(name in b)) changes.push(`${name} gone`);
  const more = changes.length > 3 ? ` and ${changes.length - 3} more` : '';
  return changes.slice(0, 3).join(', ') + more;
}

// a run's start, ms since 1970, as the local clock reads it: 09:18:14
export function localClock(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

// minutes east of UTC at that time, for the server to name a run by local time
export const utcOffset = (ms) => -new Date(Number.isFinite(ms) ? ms : Date.now()).getTimezoneOffset();

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// a number to show, in four significant digits: U+2212 for minus and ×10⁻⁴ for a power of ten
// (page spec 3.3); `readout` keeps the trailing zeros, so a value under a moving cursor keeps its
// width. For display only: what is sent, copied or exported keeps String(x) (ruling A2)
export function number(x, readout = false) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'none';
  const abs = Math.abs(x);
  let text;
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    const [mantissa, power] = x.toExponential(3).split('e');
    const digits = [...String(Number(power))].map((c) => SUPERSCRIPT[c]).join('');
    text = `${readout ? mantissa : Number(mantissa)}×10${digits}`;
  } else {
    // toPrecision writes 12345 as 1.235e+4: the number it means, without the zeros it keeps
    const kept = x.toPrecision(4);
    text = readout && !kept.includes('e') ? kept : String(Number(kept));
  }
  return text.replace('-', '−');
}

// the readout form of `number`: four significant digits with their trailing zeros
export const readout = (x) => number(x, true);

const PLAIN = Object.fromEntries(Object.entries(SUPERSCRIPT).map(([k, v]) => [v, k]));

// shown text back to what a copy keeps (ruling A2): the ASCII minus and e notation
export function plainNumbers(text) {
  return text
    .replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, p) => `e${[...p].map((c) => PLAIN[c]).join('')}`)
    .replaceAll('−', '-');
}

const VERDICTS = {
  settled: ['not settled by the end of the run', ''],
  overshoot: ['overshoot', ' %'],
  settling_time: ['settling', ' s'],
  rise_time: ['rise', ' s'],
  steady_state_error: ['error', ''],
  deviation: ['deviation', ' %'],
  recovery_time: ['recovery', ' s'],
};

const known = (x) => x !== null && x !== undefined;

// "overshoot 12.35 % > 10 %"; a limit of the other kind of response is not judged (pass null)
// and says why, and one on a run still moving says so beside its value
export function verdictText(v) {
  const [name, unit] = VERDICTS[v.what] ?? [v.what, ''];
  if (v.what === 'settled') return name;
  if (v.pass === null) return `${name}: ${v.note}`;
  const limit = `${number(v.limit)}${unit}`;
  if (v.note) return known(v.value) ? `${name} ${number(v.value)}${unit}, ${v.note}, limit ${limit}` : `${name}: ${v.note}, limit ${limit}`;
  if (!known(v.value)) return `${name} none, limit ${limit}`;
  return `${name} ${number(v.value)}${unit} ${v.pass ? '≤' : '>'} ${limit}`;
}

// a verdict's chip: pass, fail, or not judged
export const verdictState = (v) => (v.pass === null ? 'skip' : v.pass ? 'pass' : 'fail');

// the Step marks of one signal in words: a step response's overshoot, settling and rise, or a
// regulation response's deviation and recovery; what it does not have is left out
export function marksText(m) {
  const unsettled = 'not settled by the end of the run';
  if (m.regulation) {
    const percent = known(m.deviation_percent) ? ` (${number(m.deviation_percent)} %)` : '';
    const recovery = known(m.recovery_time) ? `recovery ${number(m.recovery_time)} s` : unsettled;
    return `deviation ${number(m.deviation)}${percent} at ${number(m.peak_time)} s, ${recovery}`;
  }
  if (!m.settled) return unsettled;
  return [
    known(m.overshoot) && `overshoot ${number(m.overshoot)} %`,
    known(m.settling_time) && `settling ${number(m.settling_time)} s`,
    known(m.rise_time) && `rise ${number(m.rise_time)} s`,
  ]
    .filter(Boolean)
    .join(', ');
}

// each spec signal's mark on the canvas: false when any judged verdict of any spec on it fails,
// true when some pass and none fails; a signal whose limits were all not judged has none
export function signalBadges(metrics) {
  const badges = {};
  for (const m of metrics ?? []) {
    for (const v of m.verdicts ?? []) {
      if (v.pass === null) continue;
      badges[m.signal] = (badges[m.signal] ?? true) && v.pass === true;
    }
  }
  return badges;
}
