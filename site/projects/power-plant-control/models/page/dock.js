// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the results dock: the plots of the latest run with the previous one as a ghost, one time
// cursor over all of them, drag to zoom every plot to the same window, the step metrics of a
// signal and the project's specs as chips (viewing design 5.5)

import { html, useState, useEffect, useLayoutEffect, useRef } from './vendor/htm-preact.js';
import { removeSignal, timeAt, xAt, readoutValue, zoomWindow, number, readout, verdictText, verdictState, marksText, localClock, utcOffset, valueChanges } from './plots.js';
import { whatifText, historyText, isPlainRunAfter } from './whatif.js';
import { Linear, inputOf } from './lin.js';
import { api, failed, useApi } from './api.js';
import { say } from './state.js';
import { keysOf, short } from './commands.js';
import { Splitter } from './splitter.js';
import { rendered } from './marks.js';

// the commands the dock provides while it is shown, and those its first plot provides (commands.js)
export const DOCK_ACTIONS = ['results', 'history', 'table', 'auto', 'log', 'scriptProblems', 'wholeRun', 'compare', 'clearCursor'];
export const PLOT_ACTIONS = ['step', 'linear', 'export'];

/**
 * the dock's commands that apply now: Table with plots, the scripts' problems when there are some,
 * Whole run in a zoom, A minus B with a run to compare with, and clearing the cursors while one is
 * fixed or an interval is set (else Escape goes on to the selection)
 * @param {{ layout: unknown[], zoom: unknown, against: unknown, fixed: number | null, span: unknown, problems?: number }} dock
 */
export function dockOffers({ layout, zoom, against, fixed, span, problems = 0 }) {
  const applies = { table: layout.length > 0, scriptProblems: problems > 0, wholeRun: !!zoom, compare: !!against, clearCursor: fixed !== null || !!span };
  return DOCK_ACTIONS.filter((id) => applies[/** @type {keyof typeof applies} */ (id)] ?? true);
}

/**
 * the first plot's commands that apply now: Export needs a run
 * @param {unknown} run
 */
export const plotOffers = (run) => PLOT_ACTIONS.filter((id) => id !== 'export' || !!run);

/**
 * the actions of `offered` (ids joined by spaces) provided while they are offered; each runs the
 * component's newest function of that name
 * @param {((id: string, action: () => boolean | void) => () => void) | null | undefined} provide
 * @param {string} offered
 * @param {{ current: Record<string, () => boolean | void> }} actions
 */
function useProvided(provide, offered, actions) {
  useEffect(() => {
    if (!provide || !offered) return;
    const gone = offered.split(' ').map((id) => provide(id, () => actions.current[id]()));
    return () => gone.forEach((stop) => stop());
  }, [provide, offered]);
}

// plot height in px; the width follows the dock
const HEIGHT = 180;
// a press that moves less than this is a click, not a zoom
const DRAG = 4;
// ms within which a second click makes a double-click
const DOUBLE = 500;

function Plot({ index, refs, run, running, ghost, tz, minus, window: zoom, theme, cursor, setCursor, onZoom, onReset, onRemove, verdicts, onDrawn, onFull, span, onSpan, scrubbed, unscrubbed, onStep, linear, version, onLinear, provide }) {
  rendered('Plot');
  const box = useRef(null);
  const svgBox = useRef(null);
  const [width, setWidth] = useState(0);
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState(null);
  const [step, setStep] = useState(false);
  const [lin, setLin] = useState(false);
  // Step for the dock, which tells a scrub; a plot that goes takes its Step with it
  const stepTo = (on) => {
    setStep(on);
    onStep?.(on);
  };
  useEffect(() => () => onStep?.(false), []);
  const [exporting, setExporting] = useState(false);
  // Step, Linear and Export for the commands, when this is the first plot
  const actions = useRef({});
  actions.current = {
    step: () => {
      stepTo(!step);
      return true;
    },
    linear: () => {
      setLin(!lin);
      return true;
    },
    export: () => {
      setExporting(!exporting);
      return true;
    },
  };
  useProvided(provide, plotOffers(run).join(' '), actions);
  // a file of this plot as shown: the window, the ghost or difference, at a print width
  const save = (format, width) => {
    const query = new URLSearchParams({ run: run.id, signals: refs.join(','), format, width, tz });
    if (zoom) {
      query.set('t0', zoom[0]);
      query.set('t1', zoom[1]);
    }
    if (ghost && minus) query.set('minus', ghost);
    else if (ghost) query.set('ghost', ghost);
    api(`/api/export?${query}`)
      .then(async (r) => {
        const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `plot.${format}`;
        const url = URL.createObjectURL(await r.blob());
        const link = Object.assign(document.createElement('a'), { href: url, download: name });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch(failed(say, 'Cannot export the plot'));
  };
  // the press being dragged: kept in a ref so every event sees the latest, and in state to draw
  const dragNow = useRef(null);
  const [drag, setDragState] = useState(null);
  const setDrag = (d) => {
    dragNow.current = d;
    setDragState(d);
  };

  useLayoutEffect(() => {
    // one plot request per frame while the dock is resized
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(Math.round(entry.contentRect.width)));
    });
    observer.observe(box.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // the run's plot; `unscrubbed` counts the scrub drawings taken away, each brings the run's own back
  const plotQuery = () => {
    // the compared run is named by its local clock time
    const query = new URLSearchParams({ run: run.id, signals: refs.join(','), w: String(width), h: String(HEIGHT), theme, tz: String(tz) });
    if (ghost && minus) query.set('minus', ghost);
    else if (ghost) query.set('ghost', ghost);
    if (zoom) {
      query.set('t0', String(zoom[0]));
      query.set('t1', String(zoom[1]));
    }
    if (step) query.set('marks', refs[0]);
    return query;
  };
  useApi(run && width >= 84 ? `/api/plot?${plotQuery()}` : null, [run?.id, refs.join(','), ghost, tz, minus, zoom?.[0], zoom?.[1], width, theme, step, unscrubbed], {
    hold: false,
    onData: (plot) => {
      setData(plot);
      setFailure(null);
    },
    onError: (e) => setFailure(e.message),
  });

  // the run's own values at the fixed cursor, for the readout there: the values on the lines come
  // from the same samples, so both say the same
  // `{t, values}`, as /api/values answers
  const { data: exact } = useApi(run && cursor.fixed !== null ? `/api/values?run=${encodeURIComponent(run.id)}&t=${cursor.fixed}` : null, [run?.id, cursor.fixed]);

  // two cursors: each trace's statistics between them
  const statsPath = run && span ? `/api/stats?${new URLSearchParams({ run: run.id, signals: refs.join(','), t0: String(span[0]), t1: String(span[1]) })}` : null;
  const { data: stats } = useApi(statsPath, [run?.id, refs.join(','), span?.[0], span?.[1]]);

  // a slider's scrub draws its plot in place of the run's until the next run's plot comes; one draw
  // per scrub, however often the dock renders meanwhile
  useEffect(() => {
    if (scrubbed) setData(scrubbed);
  }, [scrubbed?.seq]);

  useLayoutEffect(() => {
    if (!data) return;
    // the SVG comes from the server, which escapes every name in it
    svgBox.current.innerHTML = data.svg;
    onDrawn(refs, data);
    onFull(data.full);
  }, [data]);

  const map = data && { x0: data.area[0], y0: data.area[1], x1: data.area[2], y1: data.area[3], t0: data.t0, t1: data.t1 };
  const at = (e) => e.clientX - box.current.getBoundingClientRect().left;
  const inside = (x) => map && x >= map.x0 && x <= map.x1;
  const move = (e) => {
    const x = at(e);
    if (dragNow.current) setDrag({ ...dragNow.current, x });
    setCursor((c) => ({ ...c, hover: inside(x) ? timeAt(x, map) : null }));
  };
  const down = (e) => {
    if (e.button !== 0 || !inside(at(e))) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser does not know: the drag works without capture
    }
    // Shift-drag sets the two cursors, a plain drag zooms
    setDrag({ start: at(e), x: at(e), span: e.shiftKey });
  };
  // the last click: a second one soon after at the same place belongs to a double-click, which
  // shows the whole run and leaves the fixed cursor as it was before the first
  const clicked = useRef({ at: -Infinity, x: 0, fixed: null });
  const up = (e) => {
    const pressed = dragNow.current;
    if (!pressed) return;
    const { start, x, span: spanning } = pressed;
    setDrag(null);
    if (Math.abs(x - start) > DRAG && spanning) onSpan(timeAt(start, map), timeAt(x, map));
    else if (Math.abs(x - start) > DRAG) onZoom(timeAt(start, map), timeAt(x, map));
    else {
      const last = clicked.current;
      if (e.timeStamp - last.at < DOUBLE && Math.abs(x - last.x) <= DRAG) return;
      clicked.current = { at: e.timeStamp, x, fixed: cursor.fixed };
      // a click fixes the cursor there, or clears it when it is already there
      const t = timeAt(x, map);
      setCursor((c) => ({ ...c, fixed: c.fixed !== null && Math.abs(xAt(c.fixed, map) - x) <= 3 ? null : t }));
    }
  };
  const whole = (e) => {
    // the cursor as it was before the double-click's first click, which went through `up`
    if (e.timeStamp - clicked.current.at < DOUBLE) {
      const before = clicked.current.fixed;
      setCursor((c) => ({ ...c, fixed: before }));
    }
    onReset();
  };

  const shown = cursor.hover ?? cursor.fixed;
  const line = (t, kind) =>
    map && t !== null && t >= map.t0 && t <= map.t1
      ? html`<div class=${`cursor ${kind}`} style=${`left:${xAt(t, map)}px;top:${map.y0}px;height:${map.y1 - map.y0}px`}></div>`
      : null;
  const readoutBox =
    map && shown !== null && shown >= map.t0 && shown <= map.t1
      ? html`<div class="readout" style=${`left:${Math.min(xAt(shown, map) + 8, map.x1 - 150)}px;top:${map.y0 + 4}px`}>
          <div class="t">t = ${readout(shown)} s</div>
          ${data.traces.map((tr) => html`<div><span class="label">${tr.label}</span> ${readout(readoutValue(tr, shown, minus ? null : exact))}</div>`)}
        </div>`
      : null;

  return html`<section class="plotview">
    <div class="plot-head">
      ${verdicts.map((v) => html`<span class=${`verdict ${verdictState(v)}`} data-tip=${v.title}>${{ pass: '✓', fail: '✗', skip: '–' }[verdictState(v)]} ${verdictText(v)}</span>`)}
      ${run?.older && html`<span class="stale" data-tip="The model or its script values changed since this run: Run again">older than the model</span>`}
      ${data?.missing?.length > 0 && html`<span class="muted">not logged in this run: ${data.missing.join(', ')}</span>`}
      ${minus && data?.difference && html`<span class="muted">largest difference ${number(data.difference.largest)} at ${number(data.difference.at)} s</span>`}
      <span class="grow"></span>
      ${step && data?.marks && html`<span class="muted">${marksText(data.marks)}</span>`}
      ${exporting &&
      run &&
      html`<span class="exports">
        <span class="muted" data-tip="Exports are light, without the Step marks">light</span>
        <button class="quiet" data-tip="SVG 8.5 cm wide, a column" onClick=${() => save('svg', 8.5)}>SVG 8.5</button>
        <button class="quiet" data-tip="SVG 17 cm wide, a page" onClick=${() => save('svg', 17)}>SVG 17</button>
        <button class="quiet" data-tip="PNG at 300 dpi, 8.5 cm wide" onClick=${() => save('png', 8.5)}>PNG 8.5</button>
        <button class="quiet" data-tip="PNG at 300 dpi, 17 cm wide" onClick=${() => save('png', 17)}>PNG 17</button>
        <button class="quiet" data-tip="The plotted values as CSV" onClick=${() => save('csv', 8.5)}>CSV</button>
      </span>`}
      <button class="quiet" data-command="export" aria-pressed=${exporting} onClick=${() => setExporting(!exporting)}>${short('export')}</button>
      <button class="quiet" data-command="step" aria-pressed=${step} onClick=${() => stepTo(!step)}>${short('step')}</button>
      <button class="quiet linear" data-command="linear" aria-pressed=${lin} onClick=${() => setLin(!lin)}>${short('linear')}</button>
      ${refs.map((r) => html`<button class="quiet" data-tip=${`Take ${r} out of this plot`} onClick=${() => onRemove(index, r)}>${data?.labels?.[r] ?? r} ×</button>`)}
    </div>
    ${stats?.signals?.length > 0 &&
    html`<table class="stats">
      <tr><th>${readout(stats.t0)} to ${readout(stats.t1)} s</th><th>Δ</th><th>min</th><th>max</th><th>mean</th><th>RMS</th><th>p-p</th></tr>
      ${stats.signals.map(
        (s) => html`<tr>
          <td>${s.label}</td><td>${readout(s.delta)}</td><td>${readout(s.min)}</td><td>${readout(s.max)}</td><td>${readout(s.mean)}</td><td>${readout(s.rms)}</td><td>${readout(s.peak_to_peak)}</td>
        </tr>`,
      )}
    </table>`}
    <div
      class="plot-box"
      ref=${box}
      style=${`height:${HEIGHT}px`}
      onPointerMove=${move}
      onPointerDown=${down}
      onPointerUp=${up}
      onPointerCancel=${() => setDrag(null)}
      onLostPointerCapture=${() => dragNow.current && setDrag(null)}
      onPointerLeave=${() => setCursor((c) => ({ ...c, hover: null }))}
      onDblClick=${whole}
    >
      <div class="svg" ref=${svgBox}></div>
      ${failure && html`<div class="message">${failure}</div>`}
      ${!run && html`<div class="message">${running ? 'Running…' : `Run (${keysOf('run')}) to see this signal`}</div>`}
      ${line(cursor.fixed, 'fixed')} ${cursor.hover !== null && line(cursor.hover, 'hover')} ${readoutBox}
      ${map &&
      span &&
      (() => {
        const a = Math.max(xAt(Math.min(...span), map), map.x0);
        const b = Math.min(xAt(Math.max(...span), map), map.x1);
        return b > a ? html`<div class="spanband" style=${`left:${a}px;width:${b - a}px;top:${map.y0}px;height:${map.y1 - map.y0}px`}></div>` : null;
      })()}
      ${drag &&
      Math.abs(drag.x - drag.start) > DRAG &&
      html`<div class=${drag.span ? 'spanband' : 'zoombox'} style=${`left:${Math.min(drag.x, drag.start)}px;width:${Math.abs(drag.x - drag.start)}px;top:${map.y0}px;height:${map.y1 - map.y0}px`}></div>`}
    </div>
    ${lin &&
    html`<${Linear} output=${refs[0]} input=${linear.input} cursor=${cursor.fixed} theme=${theme} version=${version} runId=${run?.id} picking=${linear.picking} onPick=${linear.pick} onDrawn=${(ms) => onLinear?.(ms)} />`}
  </section>`;
}

// the signal table: time down the side, the plotted signals as columns; a click on a row moves
// the time cursor there
function Table({ run, refs, zoom, fixed, onPick, minus, tz }) {
  const tableQuery = () => {
    const query = new URLSearchParams({ run: run.id, signals: refs.join(','), rows: '200', tz: String(tz) });
    // with A − B on, the rows are the differences the plots show
    if (minus) query.set('minus', minus);
    if (zoom) {
      query.set('t0', String(zoom[0]));
      query.set('t1', String(zoom[1]));
    }
    return query;
  };
  const { data: table } = useApi(run && refs.length > 0 ? `/api/table?${tableQuery()}` : null, [run?.id, refs.join(','), zoom?.[0], zoom?.[1], minus, tz]);
  if (!table) return null;
  // the row nearest the fixed cursor is marked
  let near = -1;
  if (fixed !== null) {
    let best = Infinity;
    table.rows.forEach((row, i) => {
      if (Math.abs(row[0] - fixed) < best) {
        best = Math.abs(row[0] - fixed);
        near = i;
      }
    });
  }
  return html`<div class="table-box">
    <table class="signals">
      <thead><tr>${table.headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
      <tbody>
        ${table.rows.map(
          (row, i) => html`<tr class=${i === near ? 'near' : ''} onClick=${() => onPick(row[0])}>${row.map((v) => html`<td>${readout(v)}</td>`)}</tr>`,
        )}
      </tbody>
    </table>
    ${table.rows.length < table.of && html`<p class="muted">${table.rows.length} of ${table.of} samples, evenly picked; zoom in for more</p>`}
  </div>`;
}

// the history: newest first, the star pins, a click makes a run the one compared with
function History({ runs, latest, compare, setCompare, onPin }) {
  return html`<ul class="history">
    ${runs.map((r, i) => {
      const verdicts = (r.metrics ?? []).flatMap((m) => m.verdicts ?? []);
      // what this run's script values changed from the run before it
      const changed = valueChanges(runs[i + 1], r);
      // what-if values that differ from the run before it (the record holds the full list)
      const tried = historyText(r, runs[i + 1]);
      // a limit that does not apply (pass null) counts as neither
      const passed = verdicts.filter((v) => v.pass === true).length;
      const failed = verdicts.filter((v) => v.pass === false).length;
      const shown = r.id === latest?.id ? 'latest' : r.id === compare ? 'compared' : '';
      // the latest run and one that failed compare with nothing: unavailable, with the reason on hover
      const off = r.status !== 'ok' ? 'This run did not finish: nothing to compare' : r.id === latest?.id ? 'The latest run: the others compare with it' : null;
      return html`<li key=${r.id} class=${shown}>
        <button class="quiet icon star" data-tip=${r.pinned ? 'Unpin: pruning may remove it' : 'Pin: never pruned'}
          aria-label=${r.pinned ? 'Unpin' : 'Pin'} aria-pressed=${r.pinned} onClick=${() => onPin(r.id, !r.pinned)}>
          ${r.pinned ? '★' : '☆'}
        </button>
        <button class="link" aria-disabled=${off !== null} data-tip=${off ?? 'Compare the latest run with this one'}
          onClick=${() => off === null && setCompare(compare === r.id ? null : r.id)}>
          ${localClock(r.started)}
        </button>
        <span class="muted">${r.author}</span>
        <span>${r.status === 'ok' ? `${number(r.wall_ms)} ms` : r.status}</span>
        ${passed + failed > 0 && html`<span class=${failed > 0 ? 'bad' : 'good'}>${passed} ✓ ${failed} ✗</span>`}
        ${r.partial && html`<span class="muted">partial</span>`}
        <span class="muted">${r.version?.live ? `unsaved edits ${r.version.live}` : (r.version?.sha ?? '').slice(0, 7)}</span>
        ${changed && html`<span data-tip="Script values changed since the run before">${changed}</span>`}
        ${tried && html`<span data-tip="What-if values changed since the run before">what-if ${tried}</span>`}
        ${isPlainRunAfter(r, runs[i + 1]) && html`<span class="muted" data-tip="No what-if values: the model's own values">plain run</span>`}
        ${shown && html`<span class="muted">${shown}</span>`}
      </li>`;
    })}
  </ul>`;
}

export function Dock({ layout, setLayout, runs, runState, theme, auto, setAuto, height, setHeight, onDrawn, onCursor, provideKey, onRunsChanged, scrub, unscrubbed, onWindow, onMode, linear, version, onLinear, problems = [] }) {
  rendered('Dock');
  const [zoom, setZoom] = useState(null);
  // the zoom window, for a scrub's plots
  useEffect(() => onWindow?.(zoom), [zoom]);
  const [cursor, setCursor] = useState({ hover: null, fixed: null });
  const [log, setLog] = useState(false);
  const [history, setHistory] = useState(false);
  const [tableOn, setTableOn] = useState(false);
  const [compare, setCompare] = useState(null);
  const [minus, setMinus] = useState(false);
  // the two cursors' interval, set by Shift-drag on any plot
  const [span, setSpan] = useState(null);
  // the person's collapse; with nothing to show the dock is only its bar
  const [closed, setClosed] = useState(false);
  const ok = runs.filter((r) => r.status === 'ok');
  const latest = ok[0] ?? null;
  const previous = ok[1] ?? null;
  // the run the latest is compared with: the one picked in the history, else the previous one
  const against = (compare && compare !== latest?.id && runs.some((r) => r.id === compare) ? compare : null) ?? previous?.id ?? null;
  // the compared run's start, for its local clock time
  const againstStarted = runs.find((r) => r.id === against)?.started;
  // no run to compare with: no difference plot either
  useEffect(() => {
    if (!against && minus) setMinus(false);
  }, [against]);
  // each plot's Step, by its key; with A − B, how a scrub draws the plots: as the dock does
  const [steps, setSteps] = useState({});
  const plotKey = (refs, i) => `${i}:${refs.join(',')}`;
  useEffect(
    () => onMode?.({ minus: minus && !!against, marks: layout.map((refs, i) => (steps[plotKey(refs, i)] ? refs[0] : null)) }),
    [minus, against, layout, steps],
  );
  const pin = (id, pinned) =>
    api(`/api/runs/${encodeURIComponent(id)}/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned }) })
      .then(onRunsChanged)
      .catch(failed(say, pinned ? 'Cannot pin the run' : 'Cannot unpin the run'));
  const last = runs[0] ?? null;
  // the latest run's span, as its plots report it; a zoom past its end goes
  const full = useRef([0, Number.POSITIVE_INFINITY]);
  const onFull = (span) => {
    if (!Array.isArray(span)) return;
    full.current = span;
    if (zoom && (zoom[0] >= span[1] || zoom[1] <= span[0])) setZoom(null);
  };
  useEffect(() => setCursor((c) => ({ ...c, hover: null })), [latest?.id]);
  // the fixed cursor goes to the canvas, as values on lines, and to Claude's view
  useEffect(() => onCursor(cursor.fixed), [cursor.fixed]);

  const specs = latest?.metrics ?? [];
  const verdictsOf = (refs) =>
    specs
      .filter((m) => m.verdicts && refs.includes(m.signal))
      .flatMap((m) => m.verdicts.map((v) => ({ ...v, title: `${m.name} on ${m.signal}` })));
  const troubles = specs.filter((m) => m.error);
  const open = !closed && (layout.length > 0 || log || history || troubles.length > 0);
  const plottedRefs = [...new Set(layout.flat())];
  // what the commands reach in the dock while it is shown; Escape at rest clears the fixed cursor
  // and the two cursors' interval (the page's key map decides when: no layer above them open)
  const actions = useRef({});
  actions.current = {
    results: () => {
      setClosed(open);
      return true;
    },
    history: () => {
      setHistory(!history);
      return true;
    },
    table: () => {
      setTableOn(!tableOn);
      return true;
    },
    auto: () => {
      setAuto(!auto);
      return true;
    },
    log: () => {
      setLog(!log);
      return true;
    },
    // the top bar's "Scripts: 1 problem": the log, open
    scriptProblems: () => {
      setClosed(false);
      setLog(true);
      return true;
    },
    wholeRun: () => {
      setZoom(null);
      return true;
    },
    compare: () => {
      setMinus(!minus);
      return true;
    },
    // acted when there was a cursor to clear, so the next Escape clears the selection
    clearCursor: () => {
      setCursor((c) => (c.fixed === null ? c : { ...c, fixed: null }));
      setSpan(null);
      return cursor.fixed !== null || span !== null;
    },
  };
  useProvided(provideKey, dockOffers({ layout, zoom, against, fixed: cursor.fixed, span, problems: problems.length }).join(' '), actions);
  // a signal plotted while the dock is collapsed opens it
  const plotted = useRef(layout.flat().length);
  useEffect(() => {
    const now = layout.flat().length;
    if (now > plotted.current) setClosed(false);
    plotted.current = now;
  }, [layout]);

  let state = '';
  // a long run says how far it is, after a second
  if (runState?.state === 'running')
    state = Number.isFinite(runState.t) ? `running… t = ${readout(runState.t)}${Number.isFinite(runState.stop) ? ` of ${number(runState.stop)}` : ''} s` : 'running…';
  else if (runState?.state === 'paused') state = runState.why;
  else if (last?.status === 'error') state = `error: ${last.error}`;
  else if (last?.status === 'stopped') state = 'stopped';
  else if (latest)
    state = `${number(latest.wall_ms)} ms, ${latest.signal_count} signals${latest.author !== 'you' ? `, by ${latest.author}` : ''}${latest.partial ? ', not every signal fitted the logging budget' : ''}${latest.whatif && Object.keys(latest.whatif).length > 0 ? `, what-if ${whatifText(latest.whatif)}` : ''}${latest.older ? '; older than the model' : ''}`;
  else state = `Run (${keysOf('run')}), then click a line to plot its signal, Shift-click for a new plot`;
  if (latest && layout.length === 0 && runState?.state !== 'running') state += '; click a line to plot it, Shift-click for a new plot';
  // the log's lines: the scripts' problems, then the last run's error and warnings
  const warnings = problems.length + (last?.warnings ?? []).length + (last?.error ? 1 : 0);

  return html`<section class=${open ? 'dock' : 'dock closed'} style=${open ? `flex-basis:${height}px` : ''}>
    ${open &&
    html`<${Splitter} side="bottom" label="Results height" tip="Drag or use the arrow keys to resize" size=${() => height}
      bounds=${() => [120, Math.round(window.innerHeight * 0.8)]} onSize=${setHeight} />`}
    <div class="dock-bar">
      <button class="quiet" data-command="results" onClick=${() => setClosed(open)}>${open ? '▾' : '▸'} Results</button>
      <span class=${last?.status === 'error' ? 'state bad' : 'state'} data-tip=${state}>${state}</span>
      <span class="grow"></span>
      ${cursor.fixed !== null && html`<span class="muted">cursor ${readout(cursor.fixed)} s</span>`}
      ${span && html`<button class="quiet" data-command="clearCursor" onClick=${() => setSpan(null)}>${readout(span[0])} to ${readout(span[1])} s ×</button>`}
      ${zoom && html`<button class="quiet" data-command="wholeRun" data-tip="Or double-click a plot" onClick=${() => setZoom(null)}>${short('wholeRun')}</button>`}
      ${against &&
      html`<button class="quiet" data-command="compare" data-tip=${`Compared with the run started ${localClock(againstStarted)}`} aria-pressed=${minus}
        onClick=${() => setMinus(!minus)}>
        ${short('compare')}
      </button>`}
      <button class="quiet" data-command="history" aria-pressed=${history} onClick=${() => setHistory(!history)}>${short('history')}</button>
      ${layout.length > 0 &&
      html`<button class="quiet" data-command="table" aria-pressed=${tableOn} onClick=${() => setTableOn(!tableOn)}>${short('table')}</button>`}
      <button class="quiet" data-command="auto" aria-pressed=${auto} onClick=${() => setAuto(!auto)}>${short('auto')}</button>
      <button class="quiet" data-command="log" aria-pressed=${log} onClick=${() => setLog(!log)}>
        ${short('log')}${warnings > 0 ? ` ${warnings}` : ''}
      </button>
    </div>
    ${open &&
    html`<div class="dock-body">
      ${troubles.map((m) => html`<div class="trouble">Spec ${m.name}: ${m.error}</div>`)}
      ${history && html`<${History} runs=${runs} latest=${latest} compare=${against} setCompare=${setCompare} onPin=${pin} />`}
      ${tableOn &&
      html`<${Table}
        run=${latest}
        refs=${plottedRefs}
        zoom=${zoom}
        fixed=${cursor.fixed}
        onPick=${(t) => setCursor((c) => ({ ...c, fixed: t }))}
        minus=${minus ? against : null}
        tz=${utcOffset(againstStarted)}
      />`}
      ${log &&
      html`<ul class="log">
        ${problems.map((p) => html`<li class="script">${p}</li>`)}
        ${last?.error && html`<li class="bad">${last.error}</li>`}
        ${(last?.warnings ?? []).map((w) => html`<li>${w}</li>`)}
        ${warnings === 0 && html`<li class="muted">No warnings.</li>`}
      </ul>`}
      ${layout.length === 0
        ? null
        : layout.map(
            (refs, i) => html`<${Plot}
              key=${plotKey(refs, i)}
              index=${i}
              refs=${refs}
              run=${latest}
              running=${runState?.state === 'running'}
              ghost=${against}
              tz=${utcOffset(againstStarted)}
              minus=${minus}
              window=${zoom}
              theme=${theme}
              cursor=${cursor}
              setCursor=${setCursor}
              onZoom=${(a, b) => setZoom(zoomWindow(a, b, full.current) ?? zoom)}
              onReset=${() => setZoom(null)}
              onRemove=${(plot, ref) => setLayout(removeSignal(layout, plot, ref))}
              verdicts=${verdictsOf(refs)}
              onDrawn=${onDrawn}
              onFull=${onFull}
              span=${span}
              onSpan=${(a, b) => setSpan(a < b ? [a, b] : [b, a])}
              scrubbed=${scrub?.plots[i] ? { ...scrub.plots[i], seq: scrub.seq } : null}
              unscrubbed=${unscrubbed}
              onStep=${(on) => setSteps((s) => ({ ...s, [plotKey(refs, i)]: on }))}
              linear=${{ input: inputOf(linear.inputs, plotKey(refs, i)), picking: linear.picking === plotKey(refs, i), pick: () => linear.pick(plotKey(refs, i), layout.map(plotKey)) }}
              version=${version}
              onLinear=${onLinear}
              provide=${i === 0 ? provideKey : null}
            />`,
          )}
    </div>`}
  </section>`;
}
