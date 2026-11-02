// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the linear model under a plot (viewing design section 8, run 7): from an input added to a line
// the person picks to the plot's first signal, at the initial state or at the fixed time cursor;
// the poles, a pole map, a Bode pair, and the linear step beside the model's own

import { html, useState, useEffect, useLayoutEffect, useRef } from './vendor/htm-preact.js';
import { number } from './plots.js';
import { useApi } from './api.js';

// the rule slxkit_sim::lti::on_axis uses: Schur leaves rounding noise on poles on the imaginary axis
const onAxis = (p) => Math.abs(p.re) <= 1e-9 * Math.max(Math.hypot(p.re, p.im), 1);

// one line per pole, a conjugate pair once: "−0.25 ± 3.051i: damping 0.08166, 3.061 rad/s, τ 4 s"
export function poleLines(poles, most = 6) {
  const lines = [];
  for (const p of poles) {
    if (p.im > 0 && poles.some((q) => q.re === p.re && q.im === -p.im)) continue;
    const re = onAxis(p) ? 0 : p.re;
    const at = p.im === 0 ? number(re) : `${number(re)} ± ${number(Math.abs(p.im))}i`;
    let what;
    if (onAxis(p) && p.im === 0) what = 'an integrator, never settles';
    else if (onAxis(p)) what = `undamped, ${number(p.natural)} rad/s`;
    else if (p.re > 0) what = `unstable, grows as e^(${number(p.re)} t)`;
    else if (p.im === 0) what = `τ ${number(p.time_constant)} s`;
    else what = `damping ${number(p.damping)}, ${number(p.natural)} rad/s, τ ${number(p.time_constant)} s`;
    lines.push(`${at}: ${what}`);
  }
  return lines.length > most ? [...lines.slice(0, most), `and ${lines.length - most} more`] : lines;
}

// three charts side by side from 660 px, else one per row, never narrower than 220 px
export const chartWidth = (width) => (width >= 660 ? Math.floor((width - 16) / 3) : Math.max(220, width - 8));

export function linearBody(input, output, mode, cursor, w, h, theme) {
  return { input, output, at: mode === 'cursor' && Number.isFinite(cursor) ? { t: cursor } : 'initial', w, h, theme };
}

// the operating point asked for: the cursor only while one is fixed
export const pointMode = (mode, cursor) => (mode === 'cursor' && Number.isFinite(cursor) ? 'cursor' : 'initial');

// the section's warning lines: the equilibrium first, then the reply's own (the model's own step
// against the linear one, linearize's)
export function warnLines(data) {
  if (!data) return [];
  const off = data.equilibrium;
  const lines = off
    ? [`Not an equilibrium: ${off.state} moves at ${number(off.dx)} per second. The linear model holds near this point only; at an equilibrium it holds around it.`]
    : [];
  // the server's sentences start lowercase; a line of the section starts with a capital
  return [...lines, ...(data.warnings ?? [])].map((line) => line.charAt(0).toUpperCase() + line.slice(1));
}

// the input line of each plot, by the plot's key in the dock: `by` holds the ones picked, `all` an input
// kept as one line before (a views file of an older version), which every plot takes until it picks
export const NO_INPUTS = { all: null, by: {} };

// the views file's `linear`: a map from plot key to input line, or one line for every plot
export function readInputs(kept) {
  if (typeof kept === 'string') return { all: kept, by: {} };
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return NO_INPUTS;
  return { all: null, by: Object.fromEntries(Object.entries(kept).filter(([, v]) => typeof v === 'string')) };
}

export const inputOf = (inputs, key) => inputs.by[key] ?? inputs.all ?? null;

// one plot picked a line: the plots that took the old single line keep it, the others are not touched
export function pickInput(inputs, keys, key, ref) {
  const by = { ...inputs.by };
  if (inputs.all) for (const k of keys) by[k] ??= inputs.all;
  by[key] = ref;
  return { all: null, by };
}

// the head's note: the time linearized at when at the cursor, the states, the time the answer took
export function headText(data) {
  const n = data.states.length;
  return `${data.at === 'cursor' ? `at t = ${number(data.t)} s, ` : ''}${n} state${n === 1 ? '' : 's'}, ${number(data.ms)} ms`;
}

function Svg({ svg }) {
  const box = useRef(null);
  // the SVG comes from the server, which escapes every name in it
  useLayoutEffect(() => {
    box.current.innerHTML = svg ?? '';
  }, [svg]);
  return html`<div class="chart" ref=${box}></div>`;
}

export function Linear({ output, input, cursor, theme, version, runId, picking, onPick, onDrawn }) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState('initial');
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  // a request is out: the charts shown answer the question before
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const point = pointMode(mode, cursor);
  // a cleared cursor leaves the initial state chosen, so the next cursor does not take it over
  useEffect(() => {
    if (point !== mode) setMode('initial');
  }, [point, mode]);
  const at = point === 'cursor' ? cursor : null;
  // asked 120 ms after the last change, so a cursor dragged along asks once it rests
  const asking = !!input && width >= 100;
  useApi(asking ? '/api/linear' : null, [input, output, point, at, chartWidth(width), theme, version, runId], {
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(linearBody(input, output, point, at, chartWidth(width), 180, theme)) },
    delay: 120,
    hold: false,
    onSend: () => setPending(true),
    onData: (d, ms) => {
      setData(d);
      setFailure(null);
      setPending(false);
      onDrawn?.(ms);
    },
    onError: (e) => {
      // the charts shown answer another question: they go, the error says why
      setData(null);
      setFailure(e.message);
      setPending(false);
    },
  });
  useEffect(() => {
    if (!asking) setPending(false);
  }, [asking]);
  const dim = (name) => (pending ? `${name} pending` : name);
  // opening the section shows its head at the top of the dock, once its first answer has made it tall
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current) return;
    scrolled.current = true;
    const body = box.current.closest('.dock-body');
    if (!body) return;
    const top = box.current.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 4;
    body.scrollTo({ top: Math.max(0, top) });
  }, [data]);
  const stepCaption = `Step: linear${data?.step?.amp != null ? ` and the model's own (a step of ${number(data.step.amp)})` : ''}`;
  return html`<section class="linear" ref=${box}>
    <div class="linear-head">
      <span>Linear model from</span>
      <button class="link pick" data-tip="Click, then click the line the input adds to" aria-pressed=${picking} onClick=${onPick}>
        ${picking ? 'click a line…' : input ? `${input} (input added)` : 'pick the input line'}
      </button>
      <span>to ${output}, at</span>
      <button class="quiet" aria-pressed=${point === 'initial'} onClick=${() => setMode('initial')}>initial state</button>
      <button class="quiet" aria-pressed=${point === 'cursor'} aria-disabled=${!Number.isFinite(cursor)}
        data-tip=${Number.isFinite(cursor) ? 'The state at the fixed cursor; it follows the cursor' : 'Click a plot to fix the time cursor first'}
        onClick=${() => Number.isFinite(cursor) && setMode('cursor')}>${Number.isFinite(cursor) ? `cursor t = ${number(cursor)} s` : 'cursor'}</button>
      ${data && html`<span class="muted">${headText(data)}</span>`}
    </div>
    ${!input && !picking && html`<div class="muted">Pick the line the input adds to.</div>`}
    ${failure && html`<div class="message">${failure}</div>`}
    ${warnLines(data).map((line) => html`<div class=${dim('warn')}>${line}</div>`)}
    ${data?.states.length === 0 && html`<div class="muted">No continuous states: the linear model is its direct gain${data.d?.[0]?.[0] != null ? ` ${number(data.d[0][0])}` : ''}.</div>`}
    ${data &&
    html`<div class=${dim('charts')} style=${`--cw:${chartWidth(width)}px`}>
      <figure><figcaption>Poles</figcaption><${Svg} svg=${data.pole_map.svg} /></figure>
      <figure><figcaption>Bode</figcaption><${Svg} svg=${data.bode[0].svg} /><${Svg} svg=${data.bode[1].svg} /></figure>
      <figure>
        <figcaption title=${stepCaption}>${stepCaption}</figcaption>
        <${Svg} svg=${data.step.svg} />
        ${data.note && html`<small class="muted">${data.note}</small>`}
      </figure>
    </div>`}
    ${data && html`<ul class=${dim('poles')}>${poleLines(data.poles).map((l) => html`<li>${l}</li>`)}</ul>`}
  </section>`;
}
