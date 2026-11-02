// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// what-if values (viewing design V9): the slider's scale, the banner's words, the scrub's one
// request in flight, and the row under a parameter in the inspector

import { html, useState, useEffect, useLayoutEffect, useRef } from './vendor/htm-preact.js';
import { number } from './plots.js';

// a scrub reruns live when the median of the last three runs took at most this long on the server
// (the scrub budget is a 50 ms median and a 100 ms 95th percentile)
export const SCRUB_LIVE_MS = 100;

// whether a scrub may rerun the model: the median of the wall times of the last three runs that ended
// well (newest first in `runs`), none for a model that has not run
export function scrubsLiveFor(runs) {
  const times = runs
    .filter((r) => r.status === 'ok')
    .slice(0, 3)
    .map((r) => r.wall_ms)
    .sort((a, b) => a - b);
  if (times.length === 0) return false;
  const mid = times.length >> 1;
  const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return median <= SCRUB_LIVE_MS;
}
// a scrub that takes longer than this twice in a row leaves the rest of the gesture to the release
export const SCRUB_GIVE_UP_MS = 100;
// the slider's steps
export const STEPS = 1000;

export const keyOf = (t) => (t.kind === 'param' ? `${t.block}:${t.name}` : t.name);
export const sameTarget = (a, b) => a.kind === b.kind && keyOf(a) === keyOf(b);

// the slider's bounds by default: a tenth to ten times the model's value; [-1, 1] around 0
export function defaultBounds(model) {
  if (!Number.isFinite(model) || model === 0) return [-1, 1];
  return model > 0 ? [model / 10, model * 10] : [model * 10, model / 10];
}

// logarithmic between bounds of one sign, linear otherwise
export const isLog = (lo, hi) => lo < hi && lo !== 0 && hi !== 0 && Math.sign(lo) === Math.sign(hi);

// three significant digits, so tried values read cleanly in the banner and the records
export function round3(x) {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(3));
}

// a value's slider position, clamped to the bounds; the middle when there is no position
export function toSlider(value, lo, hi) {
  if (!(hi > lo) || !Number.isFinite(value)) return STEPS / 2;
  let f = isLog(lo, hi) ? Math.log(value / lo) / Math.log(hi / lo) : (value - lo) / (hi - lo);
  if (Number.isNaN(f)) f = 0;
  return Math.round(Math.min(1, Math.max(0, f)) * STEPS);
}

// a slider position's value: the bounds at the ends, the model's own value at its position (so the slider
// can return to it whatever its digits), else three significant digits kept inside the bounds
export function fromSlider(pos, lo, hi, model) {
  if (Number.isFinite(model) && model >= lo && model <= hi && pos === toSlider(model, lo, hi)) return model;
  const f = Math.min(1, Math.max(0, pos / STEPS));
  if (f === 0) return lo;
  if (f === 1) return hi;
  return Math.min(hi, Math.max(lo, round3(isLog(lo, hi) ? lo * Math.pow(hi / lo, f) : lo + f * (hi - lo))));
}

export function upsert(list, w) {
  const i = list.findIndex((x) => sameTarget(x, w));
  return i < 0 ? [...list, w] : list.map((x, k) => (k === i ? w : x));
}
export const remove = (list, t) => list.filter((x) => !sameTarget(x, t));
// what the page sends: the server's entry without its descriptions
export const wireForm = (w) => ({
  kind: w.kind,
  name: w.name,
  ...(w.block != null ? { block: w.block } : {}),
  value: w.value,
  ...(w.lo != null ? { lo: w.lo } : {}),
  ...(w.hi != null ? { hi: w.hi } : {}),
});

// "PID P 8 (model 2)"
export const itemText = (w) => `${w.label ?? keyOf(w)} ${number(w.value)}${w.model != null ? ` (model ${number(w.model)})` : ''}`;

// a record's what-ifs in a few words: "PID P 8, Kp 3.2 and 1 more"
export function whatifText(map) {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return '';
  const named = entries.slice(0, 2).map(([k, v]) => `${v.label ?? k} ${number(v.value)}`);
  return named.join(', ') + (entries.length > 2 ? ` and ${entries.length - 2} more` : '');
}

// a record's what-ifs that differ from the run before's (spec 5.5: the history shows differences): changed or
// new ones as they are, ones the run before had and this one lacks as back at the model's value
export function whatifChanges(map, previous) {
  const out = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    if (previous?.[k]?.value !== v.value) out[k] = v;
  }
  for (const [k, v] of Object.entries(previous ?? {})) {
    if (!(map ?? {})[k] && v.model != null) out[k] = { value: v.model, label: v.label };
  }
  return out;
}

const hasWhatifs = (run) => Object.keys(run?.whatif ?? {}).length > 0;

// a run with no what-ifs after one that had some: the history says "plain run"
export const isPlainRunAfter = (run, before) => !hasWhatifs(run) && hasWhatifs(before);

// the history's what-if words for a run: what differs from the run before it. A what-if the run before
// had and this one lacks went back to the model's value as the run before knew it, which holds only
// while the model and its script values are the same: after Claude applied the value it is the
// tried one, so then only changed or new what-ifs are named (the version or values say the rest)
export function historyText(run, before) {
  // a run with no what-ifs is a plain run, not a list of values going back
  if (!hasWhatifs(run)) return '';
  const same =
    !!before &&
    JSON.stringify(before.version ?? null) === JSON.stringify(run.version ?? null) &&
    JSON.stringify(before.values ?? {}) === JSON.stringify(run.values ?? {});
  const kept = same ? before.whatif : Object.fromEntries(Object.entries(before?.whatif ?? {}).filter(([k]) => k in (run.whatif ?? {})));
  return whatifText(whatifChanges(run.whatif, kept));
}

// the words for what-ifs dropped since the list was last read: the ones the model holds now and the ones
// whose target went (a `whatif` event, or the `notice` of a read after what-ifs went while no page listened)
export function whatifNotice(dropped) {
  const said = [
    ...(dropped?.applied ?? []).map((l) => `${l}: the model holds the tried value now`),
    ...(dropped?.gone ?? []).map((l) => `${l} is gone from the model; its what-if went with it`),
  ];
  return said.length > 0 ? said.join('; ') : null;
}

// a value the row sets: `on.set` answers whether the server took it; a refused one puts the row back
// (`back`), so the field and the slider never keep a value the list does not hold
export function setOrBack(on, target, value, lo, hi, back) {
  return Promise.resolve(on.set(target, value, lo, hi)).then((took) => {
    if (took === false) back();
    return took;
  });
}

// the line "Ask Claude to apply" copies for the chat
export const APPLY_REQUEST = 'Apply my what-if values from the slxkit page to the model; MCP view_state lists them with their edits.';

// "Copy as edit": the parameter what-ifs as `slxkit apply` reads them; null without any
export function editBatch(list) {
  const ops = list
    .filter((w) => w.kind === 'param')
    .map((w) => w.op ?? { op: 'set_param', block: w.block, name: w.name, value: String(w.value) });
  return ops.length === 0 ? null : JSON.stringify({ ops }, null, 2);
}

// a slider's scrub: one request in flight; the newest value waits and replaces any value waiting
// before it; two answers slower than SCRUB_GIVE_UP_MS in a row end the live mode for the gesture
export class Scrubber {
  constructor(send, draw, now = () => performance.now()) {
    this.send = send;
    this.draw = draw;
    this.now = now;
    this.seq = 0;
    // the last seq issued before the current gesture: answers up to it belong to an older gesture
    this.floor = 0;
    this.flying = null;
    this.queued = null;
    this.slow = 0;
    this.mode = 'idle';
  }
  start(live) {
    this.mode = live ? 'live' : 'release';
    this.slow = 0;
    this.queued = null;
    this.floor = this.seq;
  }
  input(value, at) {
    if (this.mode !== 'live') return;
    const job = { seq: ++this.seq, value, at };
    if (this.flying) this.queued = job;
    else this.fly(job);
  }
  async fly(job) {
    this.flying = job;
    let result;
    try {
      result = await this.send(job.value, job.seq);
    } catch (e) {
      // a refusal keeps its status: 409 is a scrub a newer one replaced
      result = { error: e.message ?? String(e), status: e.status ?? 0 };
    }
    this.flying = null;
    // an answer that belongs to an older gesture is neither timed nor drawn
    if (job.seq > this.floor) {
      this.slow = this.now() - job.at > SCRUB_GIVE_UP_MS ? this.slow + 1 : 0;
      if (this.slow >= 2 && this.mode === 'live') this.mode = 'release';
      this.draw(result, job);
    }
    const next = this.queued;
    this.queued = null;
    if (next && this.mode === 'live') this.fly(next);
  }
  // the gesture is over: what it was, live or release
  end() {
    const was = this.mode;
    this.queued = null;
    this.mode = 'idle';
    return was;
  }
}

// how long a refused bound's line stays
const REFUSAL_MS = 4000;
// what a row says while its slider waits for the release
const RELEASE_HINT = 'updates on release';

// the page's slider gestures: one target scrubs at a time, and its drawing in the dock stays until the run
// of the value set replaces it (no flicker back); it goes at once when the gesture ends with no value (a
// drag back to where it started gives no change event), on Escape or Clear, when the value is refused, or
// when that run does not end well. Callbacks: `send(target, value, seq)` the scrub request, `show(seq,
// plots, at)` its drawing, `forget()` the drawing left for the run's plots, `drop()` the run's plots back
// now, `hint({ key, text } | null)` the words beside the row; `later(f)` runs f after the pointer's task
export class Gestures {
  constructor({ send, show, forget, drop, hint, now = () => performance.now(), later = (f) => setTimeout(f, 0) }) {
    this.show = show;
    this.forget = forget;
    this.drop = drop;
    this.hint = hint;
    this.later = later;
    this.target = null;
    // a scrub's drawing is in the dock
    this.drawn = false;
    this.scrubber = new Scrubber((value, seq) => send(this.target, value, seq), (result, job) => this.answer(result, job), now);
  }
  answer(result, job) {
    // after the gesture: the release's run, or the run of before, draws the plots now
    if (!this.target) return;
    const key = keyOf(this.target);
    if (result?.plots) {
      this.drawn = true;
      this.show(job.seq, result.plots, job.at);
    } else if (result?.error && result.status !== 409) {
      this.hint({ key, text: result.error });
    }
    if (this.scrubber.mode === 'release') this.hint({ key, text: RELEASE_HINT });
  }
  // a slider's input; `live()` says, when a gesture starts, whether a scrub may rerun the model
  scrub(target, value, at, live) {
    if (!this.target || !sameTarget(this.target, target)) {
      this.end();
      this.target = target;
      const on = live();
      this.scrubber.start(on);
      this.hint(on ? null : { key: keyOf(target), text: RELEASE_HINT });
    }
    this.scrubber.input(value, at);
  }
  end() {
    this.scrubber.end();
    this.target = null;
    this.hint(null);
  }
  takeAway() {
    if (!this.drawn) return;
    this.drawn = false;
    this.drop();
  }
  // the slider's change set a value: its run replaces the drawing
  set() {
    this.end();
  }
  // the pointer let go or the slider lost the focus; a moved value's change comes after the pointer's
  // release in the same task, so a gesture still going after it ended with no value
  release(target) {
    const going = this.target;
    if (!going || !sameTarget(going, target)) return;
    this.later(() => {
      if (this.target !== going) return;
      this.end();
      this.takeAway();
    });
  }
  // Escape, × or Clear
  clear() {
    this.end();
    this.takeAway();
  }
  // the value the release set was refused
  refused() {
    this.takeAway();
  }
  // the newest run ended: one that ended well draws its own plots as they come, any other leaves the
  // run of before to draw; a gesture going keeps its drawing
  ran(ok) {
    if (this.target || !this.drawn) return;
    if (!ok) return this.takeAway();
    this.drawn = false;
    this.forget();
  }
}

// the row under a parameter for one target: the value's field, the model's value, ×, the slider
// and its bounds; Escape in any of them takes the what-if away (V9)
export function WhatIfRow({ target, whatif, on, hint }) {
  const model = target.model;
  const [lo0, hi0] = defaultBounds(model);
  const [lo, setLo] = useState(whatif?.lo ?? lo0);
  const [hi, setHi] = useState(whatif?.hi ?? hi0);
  const value = whatif?.value ?? model;
  const [text, setText] = useState(String(value));
  const [pos, setPos] = useState(toSlider(value, lo, hi));
  // a value set or dropped elsewhere moves the field and the slider
  useEffect(() => {
    setText(String(value));
    setPos(toSlider(value, lo, hi));
  }, [value]);
  // the value held when an answer comes: a refused value puts the field and the slider back on it
  const held = useRef(value);
  held.current = value;
  const tryValue = (v) =>
    setOrBack(on, target, v, lo, hi, () => {
      setText(String(held.current));
      setPos(toSlider(held.current, lo, hi));
    });
  const key = keyOf(target);
  // a refused bound: one short line under the row for a few seconds
  const [refusal, setRefusal] = useState(null);
  const refusalTimer = useRef(null);
  useEffect(() => () => clearTimeout(refusalTimer.current), []);
  const refuse = (text) => {
    setRefusal(text);
    clearTimeout(refusalTimer.current);
    refusalTimer.current = setTimeout(() => setRefusal(null), REFUSAL_MS);
  };
  // Escape while the slider is held: the rest of that drag tries nothing
  const escaped = useRef(false);
  const atModel = toSlider(model, lo, hi);
  const escape = (e) => {
    if (e.key !== 'Escape') {
      escaped.current = false;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    escaped.current = true;
    setText(String(model));
    setPos(atModel);
    on.clear(target);
  };
  const typed = () => {
    const v = Number(text);
    if (text.trim() !== '' && Number.isFinite(v) && v !== value) tryValue(v);
  };
  const bound = (which) => (e) => {
    const field = e.currentTarget;
    const v = Number(field.value);
    const [a, b] = which === 'lo' ? [v, hi] : [lo, v];
    const notNumber = field.value.trim() === '' || !Number.isFinite(v);
    if (notNumber || !(b > a)) {
      field.value = String(which === 'lo' ? lo : hi);
      refuse(
        notNumber
          ? 'Not a number: the bound stays.'
          : which === 'lo'
            ? 'The lowest value must stay below the highest.'
            : 'The highest value must stay above the lowest.',
      );
      return;
    }
    setRefusal(null);
    setLo(a);
    setHi(b);
    setPos(toSlider(value, a, b));
    // a tried value keeps its bounds for the next time; the value is the same, so nothing runs
    if (whatif) on.bounds(target, a, b);
  };
  return html`<tr class="whatif"><td colspan="2">
    <div class="whatif-line">
      <span class="what">${target.kind === 'var' ? target.name : 'value'}</span>
      <input class="whatif-field" data-key=${key} name=${`whatif-${key}`} type="number" step="any" aria-label=${`What-if value of ${key}`}
        value=${text} onInput=${(e) => setText(e.currentTarget.value)} onChange=${typed} onKeyDown=${escape} />
      <span class="muted">model ${number(model)}</span>
      ${whatif && html`<button class="quiet icon close" data-tip="Back to the model's value" data-keys="Escape" aria-label="Back to the model's value"
        onClick=${() => on.clear(target)}>×</button>`}
    </div>
    <input class="whatif-slider" data-key=${key} name=${`whatif-slider-${key}`} type="range" min="0" max=${STEPS} step="1" value=${pos}
      aria-label=${`Drag to try values of ${key}`}
      onPointerDown=${() => (escaped.current = false)}
      onInput=${(e) => {
        if (escaped.current) {
          e.currentTarget.value = String(atModel);
          return;
        }
        const p = Number(e.currentTarget.value);
        const v = fromSlider(p, lo, hi, model);
        setPos(p);
        setText(String(v));
        on.scrub(target, v, e.timeStamp);
      }}
      onChange=${(e) => {
        if (escaped.current) {
          e.currentTarget.value = String(atModel);
          return;
        }
        tryValue(fromSlider(Number(e.currentTarget.value), lo, hi, model));
      }}
      onPointerUp=${() => on.release(target)}
      onLostPointerCapture=${() => on.release(target)}
      onBlur=${() => on.release(target)}
      onKeyDown=${escape} />
    <div class="whatif-bounds">
      <input class="bound" name=${`whatif-lo-${key}`} type="number" step="any" aria-label="Lowest value" value=${lo} onChange=${bound('lo')} onKeyDown=${escape} />
      <span class="muted">${isLog(lo, hi) ? 'log' : 'linear'}</span>
      ${on.sweep && html`<button class="link" data-tip="Run the model for several values between the bounds" onClick=${() => on.sweep(target, lo, hi)}>Sweep…</button>`}
      <input class="bound" name=${`whatif-hi-${key}`} type="number" step="any" aria-label="Highest value" value=${hi} onChange=${bound('hi')} onKeyDown=${escape} />
    </div>
    <div class="whatif-note muted" role="status">${refusal ?? hint ?? ''}</div>
  </td></tr>`;
}

// the banners over the canvas's top edge (design 4.1): Following Claude while it is on, with Stop
// following, then the what-if values while there are any. They lie over the canvas so that nothing moves
// when one comes or goes; their height goes to their parent as --banners, so the canvas's notice comes
// below both
export function Banners({ follow, whatifs, asked, on, run }) {
  const box = useRef(null);
  const shown = follow || whatifs.length > 0;
  useLayoutEffect(() => {
    const element = box.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const fit = () => parent.style.setProperty('--banners', `${element.offsetHeight}px`);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(element);
    return () => {
      watch.disconnect();
      parent.style.removeProperty('--banners');
    };
  }, [shown]);
  if (!shown) return null;
  return html`<div class="banners" ref=${box}>
    ${follow &&
    html`<div class="follow-bar" role="status">
      <span class="dot" aria-hidden="true"></span><strong>Following Claude</strong>
      <span class="grow"></span>
      <button class="quiet" data-tip="Claude's show requests stop moving the view" onClick=${() => run('follow')}>Stop following</button>
    </div>`}
    <${WhatIfBar} whatifs=${whatifs} asked=${asked} on=${on} run=${run} />
  </div>`;
}

// the what-if values: each with ×, then Ask Claude to apply (the command askClaude), Copy as edit (block
// parameters only) and Clear
function WhatIfBar({ whatifs, asked, on, run }) {
  if (whatifs.length === 0) return null;
  const asking = asked != null;
  return html`<div class="whatif-bar" role="status">
    <strong>What-if</strong>
    ${whatifs.map(
      (w) => html`<span class="item" key=${keyOf(w)} data-tip=${w.file ? `${w.file}:${w.line}` : w.op ? JSON.stringify(w.op) : undefined}>
        ${itemText(w)} <button class="quiet icon close" data-tip="Back to the model's value" aria-label=${`${itemText(w)}: back to the model's value`}
          onClick=${() => on.clear(w)}>×</button>
      </span>`,
    )}
    <span class="grow"></span>
    <button class="quiet ask" data-command="askClaude" aria-disabled=${asking}
      data-tip=${asking ? 'Claude sees the request in its view; this banner goes once the model holds these values' : 'Mark these values for Claude and copy a request for the chat'}
      onClick=${() => run('askClaude')}>${asking ? 'Asked Claude' : 'Ask Claude to apply'}</button>
    ${editBatch(whatifs) && html`<button class="quiet" data-tip="Copy the set_param operations for slxkit apply" onClick=${on.copyEdit}>Copy as edit</button>`}
    <button class="quiet" data-tip="Back to the model's values" onClick=${on.clearAll}>Clear</button>
  </div>`;
}
