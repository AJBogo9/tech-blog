// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// runs, plots and what-if values (viewing design 5.5 and V9): Run and Stop, Auto after a quick
// model changed, the runs' list, the plots' signals, the view the server keeps per model, the
// what-if list and the sliders' gestures. Callbacks the page registers once call these; they read
// the store of now

import { addSignal, latestOk } from './plots.js';
import { APPLY_REQUEST, Gestures, editBatch, remove, sameTarget, scrubsLiveFor, upsert, whatifNotice, wireForm } from './whatif.js';
import { pickInput as pickInputOf, readInputs } from './lin.js';
import { NO_PANES, storage } from './state.js';
import { failed, quiet } from './api.js';

// a run that takes less than this is run again by itself after a model change (viewing design V8)
export const QUICK_MS = 200;
// what the person can choose for a side panel
const PREFS = ['auto', 'shown', 'hidden'];
const JSON_POST = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

/**
 * whether a new version runs the model again by itself: not on the first version the page sees nor
 * on one it saw, and then only with Auto on after a quick run
 * @param {number | null} seen the version Auto last saw
 * @param {number} version
 * @param {any[]} runs newest first
 * @param {boolean} auto
 */
export function autoRuns(seen, version, runs, auto) {
  if (seen === null || version === seen) return false;
  const latest = latestOk(runs);
  return auto && !!latest && latest.wall_ms < QUICK_MS;
}

/**
 * a run event: the newest run decides what the page says; an older one ending (stopped by the newer)
 * only refreshes the list
 * @param {string | null} newest the newest run's id
 * @param {{ id: string, state: string }} run
 */
export function runEvent(newest, run) {
  const next = run.state === 'running' ? run.id : newest;
  const mine = run.id === next;
  return { newest: next, shown: mine ? run : null, ended: run.state !== 'running', newestEnded: mine && run.state !== 'running' };
}

/**
 * the view the server keeps for a model, as the store's fields; what it lacks stays as the browser
 * had it
 * @param {any} kept /api/views
 * @param {Record<string, string>} panes the browser's choice of side panels
 */
export function keptView(kept, panes) {
  /** @type {Record<string, any>} */
  const patch = { linInputs: readInputs(kept.linear) };
  if (Array.isArray(kept.plots)) patch.layout = kept.plots;
  if (typeof kept.auto === 'boolean') patch.auto = kept.auto;
  if (Number.isFinite(kept.dock)) patch.dockHeight = kept.dock;
  const chosen = {};
  for (const key of Object.keys(NO_PANES)) if (PREFS.includes(kept[key])) chosen[key] = kept[key];
  patch.panes = { ...panes, ...chosen };
  return patch;
}

/**
 * a page's runs, plots and what-ifs
 * @param {object} page
 * @param {{ get: () => any, set: (patch: any) => void }} page.store
 * @param {(path: string, init?: RequestInit) => Promise<Response>} page.api
 * @param {(text: string) => void} page.say a notice over the canvas
 * @param {(person?: boolean) => void} page.share what the person sees, shared with Claude soon
 * @param {(text: string) => Promise<boolean>} page.copy
 * @param {{ name: string, ms: number, at: number }[]} page.marks
 * @param {() => number} page.plotWidth the dock's plot width, for a scrub's plots
 * @param {(f: () => void, ms: number) => any} [page.later]
 * @param {(timer: any) => void} [page.cancel]
 * @param {() => number} [page.now]
 */
export function createRuns({ store, api, say, share, copy, marks, plotWidth, later = (f, ms) => setTimeout(f, ms), cancel = (t) => clearTimeout(t), now = () => performance.now() }) {
  const set = (patch) => store.set(patch);
  const file = () => store.get().model?.file ?? null;
  // the newest run's id; a click on a line and Run, waiting for their plots (the budgets of 5.9); the
  // newest scrub's input time and plots drawn
  let newest = null;
  let plotAsked = null;
  let runAsked = null;
  let scrubMark = null;
  // the dock's zoom window and how it draws its plots (A − B, each plot's Step), for a scrub to draw
  // them the same way
  let dockWindow = null;
  let dockMode = { minus: false, marks: [] };
  // the line pick of a plot's linear model, while one waits for a click on a line
  let linePick = null;
  // the parts of the view the server keeps, sent together 300 ms after the last
  let viewTimer = null;
  let viewParts = {};
  // the version Auto last saw
  let autoSeen = null;
  // the signals one run logged, asked for when a click on a line must know them; a record never changes
  /** @type {{ id: string, refs: Promise<Set<string>> } | null} */
  let logged = null;

  function refreshRuns() {
    api('/api/runs')
      .then((r) => r.json())
      .then((runs) => set({ runs }))
      .catch(quiet('reading the runs'));
  }
  function refreshWhatifs() {
    api('/api/whatif')
      .then((r) => r.json())
      .then((w) => {
        set({ whatif: { whatifs: w.whatifs ?? [], asked: w.asked ?? null } });
        // what-ifs dropped while no page listened (after a restart): said once, as the event says them
        const said = whatifNotice(w.notice);
        if (said) say(said);
      })
      .catch(quiet('reading the what-if values'));
  }
  /**
   * Run: the signals plotted and `extra` are logged even when not every port fits. Auto asks with
   * the version it saw (`version`): the server starts one run per version whichever page asks
   * first, waits for a run the person started, and pauses before a model much longer than the last
   * run; the runs' events, not the answer, say what runs
   * @param {string[]} [extra]
   * @param {number | null} [version]
   */
  function startRun(extra = [], version = null) {
    const { layout } = store.get();
    const signals = [...new Set([...layout.flat(), ...extra])];
    const auto = version !== null;
    if (!auto) {
      // Run to redrawn plots, when there are plots to redraw
      if (layout.length > 0) runAsked ??= now();
      set({ runState: { state: 'running' } });
    }
    api('/api/run', { ...JSON_POST, body: JSON.stringify(auto ? { signals, auto, version } : { signals, auto }) })
      .then((r) => r.json())
      .then(({ id, paused }) => {
        // only Auto pauses
        if (paused) set({ runState: { state: 'paused', why: paused } });
        else if (!auto) newest = id;
      })
      .catch((e) => {
        set({ runState: { state: 'error', error: e.message } });
        failed(say, 'Cannot run the model')(e);
      });
  }
  function stopRun() {
    api('/api/stop', { ...JSON_POST, body: '{}' }).catch(failed(say, 'Cannot stop the run'));
  }
  // the server keeps the view for the next time; a drag of the dock's edge sends its last height
  function keepView(parts) {
    Object.assign(viewParts, parts);
    cancel(viewTimer);
    viewTimer = later(() => {
      const body = JSON.stringify(viewParts);
      viewParts = {};
      api('/api/views', { ...JSON_POST, body }).catch(quiet('keeping the view for the next time'));
    }, 300);
  }
  // the plots, Auto and the dock's height: in the store, this browser's copy and the server's
  function setLayout(next) {
    set({ layout: next });
    if (file()) storage.set(`slxkit:plots:${file()}`, next);
    keepView({ plots: next });
  }
  function setAuto(on) {
    set({ auto: on });
    if (file()) storage.set(`slxkit:auto:${file()}`, on);
    keepView({ auto: on });
  }
  function setHeight(h) {
    set({ dockHeight: h });
    if (file()) storage.set(`slxkit:dock:${file()}`, h);
    keepView({ dock: h });
  }
  /**
   * the port references a run logged, asked for once per run
   * @param {string} id
   */
  function signalsOf(id) {
    if (logged?.id !== id) {
      const refs = api(`/api/runs/${encodeURIComponent(id)}/signals`)
        .then((r) => r.json())
        .then((list) => new Set(list));
      logged = { id, refs };
      // one that failed is asked for again next time
      refs.catch(() => {
        if (logged?.refs === refs) logged = null;
      });
    }
    return logged.refs;
  }
  // a click on a line plots it; a signal the latest run did not log runs again with it, as does one
  // whose run's signals cannot be read
  function plotLine(ref, shift) {
    setLayout(addSignal(store.get().layout, ref, shift));
    plotAsked = { ref, start: now() };
    const latest = latestOk(store.get().runs);
    if (!latest) return startRun([ref]);
    signalsOf(latest.id).then(
      (refs) => refs.has(ref) || startRun([ref]),
      () => startRun([ref]),
    );
  }
  // lines plotted at once, as a block's outputs: one new plot, and one run for those the latest run
  // did not log
  function plotLines(refs) {
    if (refs.length === 0) return;
    setLayout([...store.get().layout, refs]);
    plotAsked = { ref: refs[0], start: now() };
    const latest = latestOk(store.get().runs);
    if (!latest) return startRun(refs);
    signalsOf(latest.id).then(
      (logged) => {
        const missing = refs.filter((ref) => !logged.has(ref));
        if (missing.length > 0) startRun(missing);
      },
      () => startRun(refs),
    );
  }
  // a click on a line on the canvas: the input of a linear model while a plot picks one, else a plot
  function lineClicked(ref, shift) {
    if (linePick) linePick(ref);
    else plotLine(ref, shift);
  }
  function pickInput(key, keys) {
    if (linePick) return cancelPick();
    set({ picking: key });
    linePick = (ref) => {
      const next = pickInputOf(store.get().linInputs, keys, key, ref);
      set({ linInputs: next });
      keepView({ linear: next.by });
      cancelPick();
    };
  }
  function cancelPick() {
    linePick = null;
    set({ picking: null });
  }
  // a plot drawn: the marks of a click on a line, of Run, and of a scrub, from the slider's input to
  // the last of its plots drawn
  function plotDrawn(refs, plot) {
    const t = now();
    if (plotAsked && plot.traces.some((tr) => tr.ref === plotAsked.ref)) {
      marks.push({ name: 'plot', ms: t - plotAsked.start, at: Date.now() });
      plotAsked = null;
    }
    if (runAsked !== null && store.get().runState?.state !== 'running') {
      marks.push({ name: 'run', ms: t - runAsked, at: Date.now() });
      runAsked = null;
    }
    const scrubbed = scrubMark;
    if (plot.seq != null && scrubbed?.seq === plot.seq && ++scrubbed.seen >= Math.min(scrubbed.plots, store.get().layout.length)) {
      marks.push({ name: 'scrub', ms: t - scrubbed.at, at: Date.now() });
      scrubMark = null;
    }
  }
  // the sliders' gestures: the scrub's one request in flight, its drawing in the dock
  const gestures = new Gestures({
    send: (target, value, seq) => {
      const { layout, theme, runs } = store.get();
      return api('/api/scrub', {
        ...JSON_POST,
        body: JSON.stringify({
          seq,
          kind: target.kind,
          name: target.name,
          block: target.block ?? null,
          value,
          plots: layout,
          w: plotWidth(),
          h: 180,
          theme,
          t0: dockWindow?.[0] ?? null,
          t1: dockWindow?.[1] ?? null,
          ghost: latestOk(runs)?.id ?? null,
          tz: -new Date().getTimezoneOffset(),
          minus: dockMode.minus,
          marks: dockMode.marks,
        }),
      }).then((r) => r.json());
    },
    show: (seq, plots, at) => {
      // only the newest scrub's mark counts: an older one's plots are drawn over or never
      scrubMark = { seq, at, plots: plots.length, seen: 0 };
      set({ scrub: { seq, plots } });
    },
    forget: () => {
      scrubMark = null;
      set({ scrub: null });
    },
    drop: () => {
      scrubMark = null;
      store.set((s) => ({ scrub: null, unscrubbed: s.unscrubbed + 1 }));
    },
    hint: (scrubHint) => set({ scrubHint }),
  });
  // a run starting or ending
  function onRun(run) {
    const e = runEvent(newest, run);
    newest = e.newest;
    if (e.shown) set({ runState: e.shown });
    // a run that ended well replaces the scrub's drawing with its own plots as they come
    if (e.newestEnded) gestures.ran(run.state === 'ok');
    if (e.ended) refreshRuns();
  }
  // the list as the server keeps it; the page that set it takes Claude's view
  function postWhatifs(list, ask = false) {
    return api('/api/whatif', { ...JSON_POST, body: JSON.stringify({ whatifs: list.map(wireForm), ask }) })
      .then((r) => r.json())
      .then((w) => {
        set({ whatif: { whatifs: w.whatifs ?? [], asked: w.asked ?? null } });
        share(true);
        return w;
      });
  }
  // the server's page events: the what-if list changed (set here, in another page, or by a new
  // version that holds or lost a tried value)
  function onPage(event, data) {
    if (event !== 'whatif') return;
    set({ whatif: { whatifs: data.whatifs ?? [], asked: data.asked ?? null } });
    const said = whatifNotice(data);
    if (said) say(said);
    // Claude's view lists the what-ifs: the page that holds it shares it again
    share();
  }
  const whatifs = () => store.get().whatif.whatifs;
  // a scrub may rerun the model when plots show and the median of the last three runs took at most SCRUB_LIVE_MS
  const scrubsLive = () => store.get().layout.length > 0 && scrubsLiveFor(store.get().runs);
  // what a what-if row and the banner do
  const whatifOn = {
    copy,
    // whether the server took the value: the row puts a refused one back
    set(target, value, lo, hi) {
      gestures.set();
      return postWhatifs(upsert(whatifs(), { ...target, value, lo, hi }))
        .then(() => {
          startRun();
          return true;
        })
        .catch((e) => {
          gestures.refused();
          say(e.message);
          return false;
        });
    },
    scrub(target, value, at) {
      gestures.scrub(target, value, at, scrubsLive);
    },
    release(target) {
      gestures.release(target);
    },
    // a tried value's bounds: kept, nothing runs (the value is the same)
    bounds(target, lo, hi) {
      const w = whatifs().find((x) => sameTarget(x, target));
      if (w) postWhatifs(upsert(whatifs(), { ...w, lo, hi })).catch((e) => say(e.message));
    },
    clear(target) {
      gestures.clear();
      // Escape on a row nothing was tried on posts nothing and starts no run
      if (!whatifs().some((w) => sameTarget(w, target))) return;
      postWhatifs(remove(whatifs(), target))
        .then(() => startRun())
        .catch((e) => say(e.message));
    },
    clearAll() {
      gestures.clear();
      postWhatifs([])
        .then(() => startRun())
        .catch((e) => say(e.message));
    },
    ask() {
      postWhatifs(whatifs(), true)
        .then(() => copy(APPLY_REQUEST))
        .then((copied) => say(copied ? 'Asked: paste the request into the chat; Claude sees the values in its view' : 'Asked: Claude sees the values in its view'))
        .catch((e) => say(e.message));
    },
    copyEdit() {
      const batch = editBatch(whatifs());
      if (batch) copy(batch).then((ok) => say(ok ? 'Copied the set_param operations for slxkit apply' : 'Could not copy'));
    },
  };
  return {
    refreshRuns,
    refreshWhatifs,
    startRun,
    stopRun,
    keepView,
    setLayout,
    setAuto,
    setHeight,
    plotLine,
    lineClicked,
    plotLines,
    pickInput,
    cancelPick,
    plotDrawn,
    onRun,
    onPage,
    whatifOn,
    /** @param {[number, number] | null} w */
    setWindow: (w) => (dockWindow = w),
    /** @param {{ minus: boolean, marks: (string | null)[] }} m */
    setMode: (m) => (dockMode = m),
    // a new version: Auto reruns a quick model 300 ms later unless Auto is off; the timer is
    // returned for the page's effect to cancel when another version comes first
    autoAfter(version) {
      const runs = autoRuns(autoSeen, version, store.get().runs, store.get().auto);
      autoSeen = version;
      if (!runs) return null;
      return later(() => startRun([], version), 300);
    },
  };
}
