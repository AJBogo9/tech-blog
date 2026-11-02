// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page: top bar, outline, canvas and inspector (viewing design 5.1)

import { html, render, useState, useEffect, useLayoutEffect, useRef, useMemo } from './vendor/htm-preact.js';
import { Canvas } from './canvas.js';
import { isPick, parsePlace, PICK, placeHash } from './place.js';
import { activeAt, matchedIn, rowId, search, stepActive } from './search.js';
import { ago, pickModels, split } from './picker.js';
import { copyText, host, onHost } from './host.js';
import { Dock } from './dock.js';
import { Splitter } from './splitter.js';
import { latestOk, readout, outputsOf, signalBadges, plainNumbers } from './plots.js';
import { TopBar, fileState, oneLine, scriptProblems } from './topbar.js';
import { NARROW } from './panels.js';
import { createPanes, modes, over } from './panes.js';
import { Inspector, reference } from './inspector.js';
import { Banners } from './whatif.js';
import { api, configureApi, failed, plain, quiet, useApi } from './api.js';
import { appsPart, say, setter, storage, store, useStore } from './state.js';
import { placesOf, reducePlaces } from './places.js';
import { pushPlace, readTrail, replacePlace, startTrail, stepPlace } from './trail.js';
import { COMMANDS, claudeMenu, contextOf, gestureHint, keySheet, keysOf, palette, runCommand as runIn, short, tipParts } from './commands.js';
import { listenTips } from './tip.js';
import { closeMenu, menuOpen } from './menu.js';
import { createActions, listenKeys } from './keys.js';
import { Sheet } from './sheet.js';
import { createRuns, keptView } from './runs.js';
import { choicesOf, connect, createShare, listen, listenTurns, socketUrl, takeLateToken, takeToken, themeOf, watchTheme } from './session.js';
import { createMarks, rendered, renders } from './marks.js';
import { scriptRuns, typeset } from './math.js';
import { createSiteFetch, readSite } from './site.js';

const marks = createMarks();
// whether the page drew its first system: the marks may have dropped the "first" mark since
let drawnFirst = false;
// what the page checks read (tools/page/check.py): window.slxkit, set by start(); `commands` gives
// each command's keys as search's rows show them, and the key sheet, from the command list
const commands = () => ({ keys: Object.fromEntries(COMMANDS.map((c) => [c.label, keysOf(c.id)])), sheet: keySheet() });
const hooks = { ready: false, system: null, version: 0, selection: null, view: () => null, marks, renders, commands };

// read once by start(), so that importing this module touches neither the address nor storage
let token = null;
// a static copy's site.json (`slxkit export`), read by start(); null for a page a server serves
/** @type {import('./site.js').Site | null} */
let site = null;
// another model can be opened from this page: never in VS Code, and in a static copy only when it
// holds several
const pickable = () => !host.embedded && (!site || site.models.length > 1);
// in a frame of a page that scrolls past it, and not full screen: the wheel and one finger scroll
// that page (canvas.js)
const framedNow = () => host.framed && !document.fullscreenElement;
// the model this page shows when it is not the server's own: a path below the server's folder,
// fixed for the page's life; another model in the address reloads the page
let modelPath = null;
// this page's name in the shared view: a redraw updates the view only while this page holds it
let pageName = '';
// inside VS Code the page's own back and forward (trail.js), set by start(); null in a browser,
// whose history keeps them
/** @type {import('./trail.js').Trail | null} */
let trail = null;
// the page reloads into another place (another model, the picker): a selection it still renders
// would write its own place over the new one's entry
let leaving = false;
// where the trail is kept for a reload of this frame (another model opened in the page): the
// frame's name outlives the reload
const trailKey = () => `slxkit-trail:${window.name}`;

function keepTrail(next) {
  trail = next;
  try {
    sessionStorage.setItem(trailKey(), JSON.stringify(next));
  } catch {
    // storage blocked: a reload starts a new trail
  }
}

// the address names `hash` and the page goes there, as after the browser's back
function arriveAt(hash) {
  history.replaceState(null, '', hash);
  dispatchEvent(new PopStateEvent('popstate'));
}

// back (-1) or forward (1) one place: along the trail in VS Code, else in the browser's history;
// false at either end of the trail
function walk(step) {
  if (!trail) return void history.go(step);
  const next = stepPlace(trail, step);
  if (!next) return false;
  keepTrail(next);
  arriveAt(next.places[next.at]);
}

// a place a link names (a Model block's model, a vscode:// link): a new entry after the one shown
function visit(hash) {
  if (!trail) {
    location.hash = hash;
    return;
  }
  keepTrail(pushPlace(trail, hash));
  arriveAt(hash);
}

// a port reference's block: "387::25.y1" is block 387::25
const blockOf = (port) => port.slice(0, port.lastIndexOf('.'));
const changeWords = { added: 'added', changed: 'changed', moved: 'moved' };

// an element with a class and text; model text only ever goes in as text
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const badge = (count) => count > 0 && html`<span class="badge">${count} changed</span>`;
// a readout's text cut to this many characters, so a long value cannot outgrow the canvas
const READOUT_CHARS = 160;
const clip = (text) => {
  const chars = [...String(text)];
  return chars.length > READOUT_CHARS ? `${chars.slice(0, READOUT_CHARS - 1).join('')}…` : String(text);
};

// a name in a readout as the canvas draws it, one text per line, its subscripts and superscripts
// kept; a long one cut as written (data-text); null where none is drawn
function drawnName(texts) {
  if (texts.length === 0) return null;
  const written = texts.map((t) => t.dataset.text ?? t.textContent).join(' ');
  if ([...written].length > READOUT_CHARS) return el('strong', '', clip(written));
  const strong = el('strong');
  texts.forEach((t, i) => {
    if (i > 0) strong.append(' ');
    const parts = /** @type {[string, number][]} */ (
      [...t.childNodes].map((n) => [n.textContent ?? '', n instanceof Element ? Number(n.getAttribute('dy')) || 0 : 0])
    );
    for (const [text, at] of scriptRuns(parts)) strong.append(at ? el(at, '', text) : text);
  });
  return strong;
}

function Outline({ systems, open, onOpen, counts }) {
  rendered('Outline');
  const children = new Map();
  for (const s of systems) {
    if (!children.has(s.parent)) children.set(s.parent, []);
    children.get(s.parent).push(s);
  }
  const node = (s) => {
    const kids = children.get(s.id) ?? [];
    return html`<li class=${s.id === open ? 'open' : ''} key=${s.id}>
      <div class="row">
        <button class="link" onClick=${() => onOpen(s.id)} data-tip=${s.path}>${oneLine(s.name)}</button>
        <span class="count">${s.blocks}</span>
        ${badge(counts[s.id] ?? 0)}
      </div>
      ${kids.length > 0 && html`<ul>${kids.map(node)}</ul>`}
    </li>`;
  };
  return html`<ul class="tree">${(children.get(null) ?? []).map(node)}</ul>`;
}

const base = (file) => file.split(/[\\/]/).pop();

// the open system as the text view prints it, the text Claude reads; a line under the pointer
// marks what it describes on the canvas, and what is under the pointer on the canvas marks its
// lines here, which only the twin reads
function Twin({ twin, failure, onLine, onPick }) {
  rendered('Twin');
  const pointed = useStore((s) => s.pointed);
  useEffect(() => {
    if (pointed) document.querySelector('.twin .tl.hl')?.scrollIntoView({ block: 'nearest' });
  }, [pointed, twin]);
  const lit = (l) => !!pointed && (pointed.sid ? l.block === pointed.sid : !!pointed.from && l.from === pointed.from);
  return html`<div class="twin" onMouseOver=${(e) => onLine(e.target.closest?.('.tl') ?? null)} onMouseLeave=${() => onLine(null)}>
    ${failure ? html`<div class="th">Cannot read the text view: ${plain(failure)}</div>` : twin && html`<div class="th">${twin.header}</div>`}
    ${(twin?.lines ?? []).map(
      (l, i) => html`<div
        class=${lit(l) ? 'tl hl' : 'tl'}
        key=${i}
        data-block=${l.block ?? undefined}
        data-from=${l.from ?? undefined}
        data-to=${l.to ?? undefined}
        onClick=${() => l.block && onPick(l.block)}
      >
        ${l.text}
      </div>`,
    )}
  </div>`;
}

// the results of a search: name, what matched, and where it is, and a command's keys; the mouse
// never takes the focus from the field; the active row, kept by its id while rows come and go, only
// the results read
function Results({ results, onPick, onPoint }) {
  rendered('Results');
  const active = activeAt(results, useStore((s) => s.active));
  useEffect(() => {
    document.querySelector('.results li.active')?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);
  if (results.length === 0) return html`<p class="empty">Nothing found</p>`;
  return html`<ul class="results" onMouseDown=${(e) => e.preventDefault()}>
    ${results.map(
      (r, i) => html`<li class=${i === active ? 'active' : ''} key=${`${r.kind}:${r.sid ?? r.id}:${i}`} title=${r.title}
        onClick=${() => onPick(r)} onMouseMove=${() => onPoint(i)}>
        ${r.key && html`<kbd>${r.key}</kbd>`}<span class="label">${r.label}</span> <span class="detail">${r.detail}</span>
        ${r.crumbs && html`<div class="where">${r.crumbs}</div>`}
      </li>`,
    )}
  </ul>`;
}

// a hidden panel's thin edge: its arrow shows the panel, or hides the one that slid in; the second
// click of a double-click does nothing more
function Edge({ side, open, command, onToggle }) {
  const arrow = (side === 'left') === open ? '\u2039' : '\u203a';
  const more = open ? 'Hides it until you open it again; Escape puts it away once' : undefined;
  return html`<button class=${`edge ${side}`} data-command=${command} data-tip=${more} aria-label=${tipParts(command).label}
    aria-expanded=${open} onClick=${(e) => e.detail < 2 && onToggle()}>${arrow}</button>`;
}

// the store's setters under the names App's useState calls gave them
const setStatus = setter('status');
const setModel = setter('model');
const setWithheld = setter('withheld');
const setFollow = setter('follow');
const setNotice = setter('notice');
const setFailure = setter('failure');
const setLink = setter('link');
const setChanges = setter('changes');
const setPutAway = setter('putAway');
const setQuery = setter('query');
const setActive = setter('active');
const setIndex = setter('index');
const setTextOn = setter('textOn');
const setLayoutState = setter('layout');
const setAutoState = setter('auto');
const setDockHeightState = setter('dockHeight');
const setCursorT = setter('cursorT');
const setPointed = setter('pointed');

function App() {
  // the whole state but what the pointer is over and the places bookkeeping (state.js appsPart): App
  // renders again whenever any of the rest changes, as it did with useState, and not on a hover
  const { status, model, system, selection, primary, withheld, follow, notice, theme, failure, link, changes,
    shareError, putAway, query, sheet, index, textOn, runs, runState, layout, auto, dockHeight, whatif, scrub,
    unscrubbed, scrubHint, cursorT, linInputs, picking, panes, slides, narrow, full } = useStore(appsPart);
  rendered('App');
  const infos = useRef(new Map());
  const canvasElement = useRef(null);
  const canvas = useRef(null);
  const pending = useRef(null);
  const pageElement = useRef(null);
  const searchField = useRef(null);
  const typedAt = useRef(null);
  // what the person looks at, shared with Claude (session.js)
  const share = useMemo(
    () => createShare({ store, api, region: () => canvas.current.region(), name: pageName, ready: () => hooks.ready, marks }),
    [],
  );
  const shareSoon = share.soon;
  // runs, plots and what-ifs (runs.js)
  const runner = useMemo(
    () =>
      createRuns({
        store,
        api,
        say,
        share: shareSoon,
        copy: copyText,
        marks,
        plotWidth: () => Math.round(document.querySelector('.plot-box')?.getBoundingClientRect().width ?? 600),
      }),
    [],
  );
  // the side panels (panes.js)
  const sides = useMemo(() => createPanes({ store, keepView: runner.keepView }), []);
  const { outline: outlineMode, inspector: inspectorMode } = modes({ panes, narrow, slides });
  const searchAsked = useRef(false);
  // the actions components provide to the commands while they are shown (keys.js); a count of
  // their changes, so that search offers the commands again
  const [provisions, setProvisions] = useState(0);
  const keyActions = useMemo(() => createActions(() => setProvisions((n) => n + 1)), []);

  // the live channel (session.js), and the person turning to this page; the turns are registered
  // before the key map, so a key press marks the page turned to before the key's own share
  useEffect(() => {
    const stopListening = listen({
      token,
      modelPath,
      onStatus: setStatus,
      onLink: setLink,
      onShow,
      onRun: runner.onRun,
      onPage: runner.onPage,
    });
    runner.refreshRuns();
    const stopTurns = listenTurns(share);
    return () => {
      stopListening();
      stopTurns();
    };
  }, []);

  useLayoutEffect(() => {
    canvas.current = new Canvas(canvasElement.current, {
      onSelect: (sids, sid) => {
        dispatchPlace({ type: 'select', sids, primary: sid ?? sids[sids.length - 1] ?? null });
        // a click on the canvas puts the outline away; on a block it slides the inspector in, also
        // when that block was selected already; on paper it puts the inspector away
        sides.clicked(sids.length > 0);
        shareSoon(true);
      },
      onView: (person) => shareSoon(person),
      onOpen: (sid) => openByPerson(sid),
      describe: (target) => describe(target),
      onPoint: (target) =>
        setPointed(target ? (target.matches('g.ln') ? { from: target.dataset.src ?? null } : { sid: target.dataset.sid }) : null),
      onHover: (ms) => marks.push({ name: 'hover', ms, at: Date.now() }),
      // a static copy runs nothing, so a line plots nothing
      onLine: host.site ? null : (ref, shift) => runner.lineClicked(ref, shift),
      framed: framedNow,
    });
    hooks.view = () => canvas.current.view();
  }, []);

  // values at the fixed cursor written on the lines they belong to, and each spec's pass or fail
  // beside its signal
  const latest = latestOk(runs);
  // a signal with two specs fails when either fails, whatever their order
  const marked = () => {
    const badges = signalBadges(latestOk(store.get().runs)?.metrics);
    return Object.keys(badges).length > 0 ? badges : null;
  };
  const valuesPath = latest && cursorT !== null ? `/api/values?run=${encodeURIComponent(latest.id)}&t=${cursorT}` : null;
  useApi(valuesPath, [runs, cursorT], {
    hold: false,
    onData: ({ values }) => {
      const shown = {};
      for (const [ref, v] of Object.entries(values)) shown[ref] = v.length === 1 ? readout(v[0]) : `[${v.map(readout).join(' ')}]`;
      canvas.current.annotate(shown, marked());
    },
    // a run pruned meanwhile: no values rather than old ones
    onError: () => canvas.current.annotate(null, marked()),
  });
  useEffect(() => {
    if (valuesPath === null) canvas.current.annotate(null, marked());
  }, [runs, cursorT]);
  // the cursor and the plots are part of what Claude sees
  useEffect(() => shareSoon(true), [cursorT, layout]);

  // back after a lost connection: a run may have ended meanwhile, and the what-ifs changed
  useEffect(() => {
    if (link !== 'connected') return;
    runner.refreshRuns();
    runner.refreshWhatifs();
  }, [link]);

  // the plots, Auto and the dock's height as this model last had them: kept by the server per
  // model, so they outlive it and its port; this browser's copy until the server answers, or when
  // it keeps none
  useEffect(() => {
    if (!model?.file) return;
    const file = model.file;
    setLayoutState(storage.get(`slxkit:plots:${file}`, []));
    setAutoState(storage.get(`slxkit:auto:${file}`, true));
    setDockHeightState(storage.get(`slxkit:dock:${file}`, 280));
    sides.load(file);
    runner.refreshWhatifs();
  }, [model?.file]);
  useApi(model?.file ? '/api/views' : null, [model?.file], {
    hold: false,
    onData: (kept) => store.set(keptView(kept, store.get().panes)),
    onError: quiet('reading the view kept for this model'),
  });

  // a quick model is run again by itself 300 ms after it changes, unless Auto is off
  useEffect(() => {
    if (!status) return;
    const timer = runner.autoAfter(status.version);
    return () => clearTimeout(timer);
  }, [status?.version]);

  // a new version may leave the shown run older than the model: the list says which
  useEffect(() => {
    if (status) runner.refreshRuns();
  }, [status?.version]);

  // each new version: the outline, then the open system or its nearest parent
  useEffect(() => {
    if (status) pending.current ??= { name: `reload:${status.version}`, start: performance.now() };
  }, [status?.version]);
  useApi(status ? '/api/model' : null, [status?.version], {
    hold: false,
    onData: (m) => {
      // the views this tab had before a reload
      if (store.get().systems.length === 0) canvas.current.keep(`slxkit:views:${m.file}`);
      // the first outline goes to the place the address names; a later one leaves a system a
      // save took away for its nearest parent
      dispatchPlace({ type: 'loaded', systems: m.systems, hash: location.hash });
      setModel(m);
    },
    onError: (e) => setFailure(e.message),
  });

  // the drawing of the open system
  useApi(model ? `/api/system/${encodeURIComponent(system)}?theme=${theme}` : null, [model, system, theme], {
    read: 'text',
    hold: false,
    onData: (text) => {
      const retyped = canvas.current.show(system, text);
      setFailure(null);
      // what is still drawn stays selected, then the place and Claude's requests waiting for it
      dispatchPlace({ type: 'drawn', system, version: model.version, drawn: drawnNow, retyped });
      // every block's readout at once, so a hover never waits for the server
      const key = `readouts:${system}`;
      if (!infos.current.has(key)) {
        infos.current.set(key, api(`/api/readouts/${encodeURIComponent(system)}`).then((r) => r.json()));
      }
      const done = pending.current;
      pending.current = null;
      if (done) marks.push({ name: done.name, ms: performance.now() - done.start, at: Date.now() });
      if (!drawnFirst) {
        drawnFirst = true;
        marks.push({ name: 'first', ms: performance.now(), at: Date.now() });
        // the person just opened this page, if it has the focus; one opened behind others
        // takes Claude's view only once the person turns to it
        if (document.hasFocus()) share.turn();
        shareSoon(true);
      }
      Object.assign(hooks, { ready: true, system, version: model.version });
    },
    onError: (e) => {
      const shown = canvas.current.id;
      // nothing drawn yet: the canvas says why
      if (shown === null) setFailure(plain(e));
      // another system asked for: the page stays on the one drawn, and says why
      else dispatchPlace({ type: 'failed', system, shown, why: plain(e) });
      // the system drawn: its drawing stays, and the top bar says the server does not answer
    },
  });

  // what changed since reviewed, with each version
  const loadChanges = () =>
    api('/api/changes')
      .then((r) => r.json())
      .then((c) => {
        setChanges(c);
        canvas.current.mark(c.blocks);
      })
      .catch(quiet('reading the changes since reviewed'));
  useEffect(() => {
    if (!model) return;
    infos.current.clear();
    loadChanges();
    api('/api/index')
      .then((r) => r.json())
      .then(setIndex)
      .catch(quiet('reading the search index'));
  }, [model]);

  // every match, for the canvas; the first 50, for the list; the commands that apply where the page is
  const found = useMemo(
    () => (model && index && query.trim() ? search(index, model.systems, query, palette(contextNow())) : []),
    [model, index, query, selection, primary, system, runState, picking, layout, provisions],
  );
  const results = useMemo(() => found.slice(0, 50), [found]);
  // how long a keystroke takes to show its results
  useLayoutEffect(() => {
    if (typedAt.current === null) return;
    marks.push({ name: 'search', ms: performance.now() - typedAt.current, at: Date.now() });
    typedAt.current = null;
  }, [results]);
  // while a search runs, the open system's blocks that match nothing are dimmed
  useEffect(() => {
    const live = query.trim() !== '';
    canvas.current.dim(live ? matchedIn(found, system) : null);
  }, [found, query, system, model]);

  function focusSearch() {
    // the field is in the outline: an outline out of view slides in first
    if (modes(store.get()).outline === 'edge') {
      searchAsked.current = true;
      sides.slide('outline', 'asked');
      return;
    }
    searchField.current?.focus();
    searchField.current?.select();
  }
  function endSearch() {
    sides.slide('outline', null);
    setQuery('');
    setActive(null);
    searchField.current?.blur();
    canvasElement.current.focus();
  }
  // a result: its system opens and its block is selected; a note is brought into view; a
  // command runs
  function pick(r) {
    if (!r) return;
    sides.slide('outline', null);
    if (r.kind === 'command') {
      endSearch();
      runCommand(r.id);
      return;
    }
    const sel = r.kind === 'annotation' || !r.sid ? [] : [r.sid];
    goTo(r.system, sel, r.sid ? [r.sid] : []);
  }
  function goTo(system, sel, reveal) {
    dispatchPlace({ type: 'goto', system, sel, reveal, drawn: drawnNow });
    shareSoon(true);
  }
  function toggleFollow() {
    const { follow, model } = store.get();
    setFollow(!follow);
    if (model) storage.set(`slxkit:follow:${model.file}`, !follow);
    shareSoon(true);
  }
  function toggleWithheld() {
    setWithheld((w) => !w);
    shareSoon(true);
  }
  // the operations the commands run (commands.js lists them, keys.js reaches them); false when one
  // did nothing
  /** @type {import('./commands.js').Page} */
  const page = {
    fit: () => {
      canvas.current.fit();
    },
    actual: () => {
      canvas.current.actual();
    },
    zoomBack: () => {
      canvas.current.back();
    },
    zoomForward: () => {
      canvas.current.forward();
    },
    // a subsystem opens here, a Model block's model in this page
    open: () => {
      const { primary, systems } = store.get();
      const acted = !!primary && systems.some((s) => s.id === primary);
      if (acted) open(primary);
      else if (primary) openModel(primary);
      return acted;
    },
    up: () => {
      const { system, systems } = store.get();
      const parent = systems.find((s) => s.id === system)?.parent;
      if (parent) openByPerson(parent);
      return !!parent;
    },
    back: () => walk(-1),
    forward: () => walk(1),
    search: () => focusSearch(),
    pick: () => {
      visit(PICK);
    },
    run: () => {
      runner.startRun();
    },
    stop: () => runner.stopRun(),
    cancelPick: () => runner.cancelPick(),
    reviewed: () => markReviewed(),
    follow: () => toggleFollow(),
    withhold: () => toggleWithheld(),
    text: () => toggleText(),
    askClaude: () => runner.whatifOn.ask(),
    closeMenu: () => closeMenu(),
    side: (side) => sides.toggle(side),
    putAway: () => sides.putAway(),
    deselect: () => dispatchPlace({ type: 'deselect' }),
    sheet: () => store.set((s) => ({ sheet: !s.sheet })),
    // full screen when the frame allows it, else the same place in a tab of its own
    fullScreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (document.fullscreenEnabled) void document.documentElement.requestFullscreen();
      else window.open(location.href, '_blank', 'noopener');
    },
    closeSheet: () => store.set({ sheet: false }),
    endSearch: () => endSearch(),
    // the lines leaving the selected block, in one new plot
    plot: () => {
      const refs = outputsOf(canvas.current.lineSources(), store.get().primary);
      if (refs.length > 0) runner.plotLines(refs);
      else say('Nothing to plot: no line leaves the selected block');
      return refs.length > 0;
    },
    // Alt+K: the selection as the tokens Claude reads
    copyRef: () => {
      const { model, selection } = store.get();
      const text = selection.map((sid) => reference(model?.name ?? '', sid)).join(' ');
      copyText(text).then((done) => say(done ? `Copied ${text}` : 'Cannot copy: the browser refused the clipboard'));
    },
    // what a component provides while it is shown (the dock's cursors)
    provided: (id) => keyActions.run(id) === true,
  };
  // where the page is, for the commands' conditions
  function contextNow() {
    return contextOf(store.get(), { embedded: host.embedded, site: host.site, pickable: pickable(), framed: host.framed, provided: keyActions.has, menu: menuOpen() });
  }
  // a command, where it applies; true when it acted
  function runCommand(id) {
    return runIn(id, page, contextNow());
  }
  function searchKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => stepActive(results, a, step));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[activeAt(results, store.get().active)]);
    }
    // Escape ends the search through the key map (keys.js)
  }

  // the readout of a block or line under the pointer; long text is cut so the readout fits
  async function describe(target) {
    const box = el('div');
    if (target.matches('g.ln')) {
      const name = drawnName([...target.querySelectorAll('.lname')]);
      if (name) box.append(name);
      box.append(el('div', 'mono', `${target.dataset.src ?? '?'} -> ${target.dataset.dst ?? '?'}`));
      // the gestures, where the click happens (VO-12)
      if (target.dataset.src && !host.site) box.append(el('div', 'muted', gestureHint('plotLine')));
      return box;
    }
    const sid = target.dataset.sid;
    const readouts = infos.current.get(`readouts:${canvas.current.id}`);
    const info = readouts ? (await readouts.catch(() => ({})))[sid] : null;
    if (!info) return null;
    box.append(drawnName([...target.querySelectorAll('text.name')]) ?? el('strong', '', clip(info.name)), el('div', 'muted', info.type));
    const kind = changeWords[canvas.current.changes[sid]];
    if (kind) box.append(el('div', 'change', `${kind} since reviewed`));
    for (const p of info.params) box.append(el('div', 'mono', clip(`${p.label ?? p.name} = ${p.value}${p.unit != null ? ` ${p.unit}` : ''}`)));
    if (info.opens) {
      // the preview follows when it arrives; the readout does not wait for it
      const preview = el('div', 'preview');
      box.append(preview);
      const key = `preview:${info.opens}:${store.get().theme}`;
      if (!infos.current.has(key)) {
        infos.current.set(
          key,
          api(`/api/system/${encodeURIComponent(info.opens)}?theme=${store.get().theme}`).then((r) => r.text()),
        );
      }
      infos.current
        .get(key)
        .then((svg) => {
          // the server's own drawing, escaped when it was drawn
          preview.innerHTML = svg;
          canvas.current.replaceTip();
          // its maths typeset, as the canvas's
          void typeset(preview).then(() => canvas.current.replaceTip());
        })
        .catch(() => preview.remove());
    }
    return box;
  }

  // R: the version shown is reviewed
  function markReviewed() {
    const version = hooks.version;
    api('/api/reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    })
      .then((r) => r.json())
      .then((answer) => {
        // a version that arrived after the press stays to review
        if (answer.newer != null) say('A newer version arrived: press R again');
        return loadChanges();
      })
      .catch(failed(say, 'Cannot mark the changes reviewed'));
  }

  // the places reducer (places.js): its next state into the store, then its effects
  // the blocks of a list the canvas has drawn now
  const drawnNow = (sids) => canvas.current.drawn(sids);
  function dispatchPlace(event) {
    const { state, effects } = reducePlaces(placesOf(store.get()), event);
    store.set(state);
    for (const e of effects) {
      if (e.kind === 'notice') say(e.text, e.request ?? null);
      else if (e.kind === 'unnotice') setNotice(null);
      else if (e.kind === 'show') {
        canvas.current.select(e.select);
        canvas.current.reveal(e.reveal);
        if (e.note) canvas.current.pin(e.note.sid, e.note.text);
      } else if (e.kind === 'address') {
        // a page on its way to another model leaves that model's entry as it is
        if (leaving) continue;
        // in VS Code the address only names the place, and the trail keeps back and forward
        if (trail) {
          keepTrail(e.push ? pushPlace(trail, e.hash) : replacePlace(trail, e.hash));
          history.replaceState(null, '', e.hash);
        } else if (e.push) history.pushState(null, '', e.hash);
        else history.replaceState(null, '', e.hash);
      } else if (e.kind === 'reload') {
        leaving = true;
        location.reload();
      } else if (e.kind === 'opening') pending.current = { name: `open:${e.id}`, start: performance.now() };
    }
  }
  // Claude's show request: at once with Follow Claude on, else as a notice with Go
  function onShow(request) {
    dispatchPlace({ type: 'show', request, follow: store.get().follow, drawn: drawnNow });
  }

  // back in touch: what the person did meanwhile reaches Claude
  useEffect(() => {
    if (link === 'connected' && shareError) shareSoon(true);
  }, [link]);

  // the selected block, read again with each version; a block that went clears the selection
  useEffect(() => {
    canvas.current.select(selection);
    hooks.selection = selection;
    shareSoon();
  }, [selection, withheld, system]);
  const { data: block } = useApi(primary && model ? `/api/block/${encodeURIComponent(primary)}` : null, [primary, model], {
    // a block that went: unless the inspector has moved on to another meanwhile
    onError: () => dispatchPlace({ type: 'gone', sid: primary }),
  });
  // Follow Claude and the text twin, kept per model
  useEffect(() => {
    if (!model) return;
    setFollow(storage.get(`slxkit:follow:${model.file}`, false));
    setTextOn(storage.get(`slxkit:text:${model.file}`, false));
  }, [model?.file]);
  // the twin's lines; a failed read keeps the lines shown and says why in the twin's head
  const { data: twin, error: twinError } = useApi(textOn && model ? `/api/text/${encodeURIComponent(system)}` : null, [model, system, textOn], {
    keep: true,
  });
  // another system: nothing is pointed at any more
  useEffect(() => setPointed(null), [system]);
  function toggleText() {
    const { textOn, model } = store.get();
    setTextOn(!textOn);
    if (model) storage.set(`slxkit:text:${model.file}`, !textOn);
  }
  // a twin line under the pointer: its block, or a connection's two blocks and its line
  function pointLine(line) {
    if (!line) {
      canvas.current.highlight([]);
      return;
    }
    const { block, from, to } = line.dataset;
    const sids = block ? [block] : [from, to].filter(Boolean).map(blockOf);
    canvas.current.highlight(sids, from ?? null);
  }
  function pickLine(sid) {
    dispatchPlace({ type: 'select', sids: [sid], primary: sid });
    canvas.current.select([sid]);
    shareSoon(true);
  }

  // the tab's title: the file, and the open system below the root
  useEffect(() => {
    if (!model) return;
    const open = system === 'root' ? null : model.systems.find((s) => s.id === system)?.name;
    document.title = open ? `${oneLine(open)} · ${base(model.file)}` : base(model.file);
  }, [model, system]);

  // the open system's outline entry in view, however deep or far down the outline it is: centred
  // when out of view, and its start shown without hiding the tree left of it when it fits
  useEffect(() => {
    const entry = document.querySelector('.tree li.open > .row > button');
    // the list scrolls below the search field, not the outline around both
    const outline = entry?.closest('.list');
    if (!outline) return;
    const e = entry.getBoundingClientRect();
    const o = outline.getBoundingClientRect();
    if (e.top < o.top || e.bottom > o.bottom) outline.scrollTop += e.top - o.top - (o.height - e.height) / 2;
    if (e.left < o.left || e.left > o.right - 60) outline.scrollLeft += e.left - o.left - 16;
  }, [system, model, outlineMode]);

  // the page's width sets the panels' automatic rule; crossing it puts what slid in away
  useEffect(() => sides.watch(window), []);
  // another system: the outline that slid in has done its work
  useEffect(() => sides.slide('outline', null), [system]);
  // the inspector slides in when blocks are selected (a click, a search result, Go, an address)
  // and the page's own slide goes when none are
  const selected = selection.join(',');
  useEffect(() => sides.selected(!!selected), [selected]);
  // the outline put away ends its search, so nothing stays dimmed with no field to clear it
  useEffect(() => {
    if (outlineMode !== 'edge' || !query) return;
    setQuery('');
    setActive(null);
  }, [outlineMode]);
  // a search asked for while the outline was out of view: its field, once the outline slid in
  useEffect(() => {
    if (!searchAsked.current || outlineMode === 'edge') return;
    searchAsked.current = false;
    searchField.current?.focus();
    searchField.current?.select();
  }, [outlineMode]);

  // panel widths per model
  useEffect(() => {
    if (!model) return;
    const widths = storage.get(`slxkit:panels:${model.file}`, null);
    // within today's bounds: a width kept in a wider window may lie past them
    const [lo, hi] = widthBounds();
    if (widths) for (const [k, v] of Object.entries(widths)) pageElement.current.style.setProperty(`--${k}`, `${Math.max(lo, Math.min(hi, v))}px`);
  }, [model?.file]);

  // the one tooltip for actions (tip.js), outside the store: a hover renders nothing here
  useEffect(() => listenTips(window), []);
  // the keys of 5.10 in one map with layers (keys.js)
  useEffect(() => {
    const stopKeys = listenKeys(window, {
      at: (e) => {
        const s = store.get();
        const target = /** @type {Element} */ (e.target);
        return {
          menu: menuOpen(),
          sheet: s.sheet,
          picking: !!s.picking,
          field: !!target.closest?.('input, textarea, select, [contenteditable]'),
          search: !!target.closest?.('input.search'),
          button: !!target.closest?.('button, summary, a'),
          separator: !!target.closest?.('[role="separator"]'),
          slid: over(s),
          running: s.runState?.state === 'running',
        };
      },
      run: runCommand,
      unhover: () => canvas.current.unhover(),
      coast: () => canvas.current.stop(),
      after: () => shareSoon(true),
    });
    // a button clicked with the mouse takes no focus, so Enter and Space keep acting on the canvas
    const noFocus = (e) => {
      if (e.target.closest?.('button, summary')) e.preventDefault();
    };
    // the mouse's back and forward buttons, the same way in a browser and a VS Code webview
    const buttons = (e) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      walk(e.button === 3 ? -1 : 1);
    };
    // a place in the address: back, forward, or a link typed or pasted
    const arrive = () => onPlace();
    // a copy of shown numbers keeps the ASCII minus and e notation (ruling A2)
    const copy = (e) => {
      const text = window.getSelection()?.toString() ?? '';
      const plain = plainNumbers(text);
      if (!text || plain === text || !e.clipboardData) return;
      e.clipboardData.setData('text/plain', plain);
      e.preventDefault();
    };
    document.addEventListener('mousedown', noFocus);
    document.addEventListener('mouseup', buttons);
    document.addEventListener('copy', copy);
    window.addEventListener('popstate', arrive);
    return () => {
      stopKeys();
      document.removeEventListener('mousedown', noFocus);
      document.removeEventListener('mouseup', buttons);
      document.removeEventListener('copy', copy);
      window.removeEventListener('popstate', arrive);
    };
  }, []);

  // the address names a place (back, forward, a link typed or pasted); a restarted server's URL
  // opened in this tab is taken first
  function onPlace() {
    const { system, selection } = store.get();
    if (takeLateToken(placeHash({ model: modelPath, system, sel: selection }))) return;
    dispatchPlace({ type: 'arrive', hash: location.hash, modelPath, shown: canvas.current.id, drawn: drawnNow });
  }

  // after a change of system or selection is rendered, the address follows
  useEffect(() => {
    if (!model) return;
    dispatchPlace({ type: 'write', modelPath, hash: location.hash });
  }, [model, system, selection]);

  // what a what-if row and the banner do (runs.js), with the words beside the row dragged
  const whatifOn = { ...runner.whatifOn, hint: scrubHint };
  function open(id) {
    dispatchPlace({ type: 'open', id });
  }
  // a system picked in the outline: the outline that slid in for it goes
  function pickSystem(id) {
    openByPerson(id);
    sides.slide('outline', null);
  }
  function openByPerson(id) {
    if (!store.get().systems.some((s) => s.id === id)) {
      openModel(id);
      return;
    }
    open(id);
    shareSoon(true);
  }
  // a Model block: the model it names, in this page next to this one's file; a notice names a
  // file that is not there
  async function openModel(sid) {
    const readouts = infos.current.get(`readouts:${store.get().system}`);
    const ref = readouts ? (await readouts.catch(() => ({})))[sid]?.model : null;
    if (!ref) return;
    if (!ref.found) {
      say(site ? `${ref.file} is not in this copy` : `No ${ref.file} next to ${store.get().model?.file ? base(store.get().model?.file) : 'this model'}`);
      return;
    }
    // a copy names its models by key
    if (site) return visit(placeHash({ model: ref.key, system: 'root' }));
    const folder = modelPath ? modelPath.slice(0, modelPath.lastIndexOf('/') + 1) : '';
    visit(placeHash({ model: folder + ref.file, system: 'root' }));
  }

  // a side panel's width as its splitter sizes it: at least 120 px, at most half the window
  const widths = useRef({});
  const widthOf = (side) => () => parseFloat(getComputedStyle(pageElement.current).getPropertyValue(`--${side}`));
  const widthBounds = () => [120, Math.round(window.innerWidth / 2)];
  const resize = (side) => (px) => {
    widths.current[side] = px;
    pageElement.current.style.setProperty(`--${side}`, `${px}px`);
  };
  const keepWidths = () => model && storage.set(`slxkit:panels:${model.file}`, { ...storage.get(`slxkit:panels:${model.file}`, {}), ...widths.current });

  const gone = changes.deleted.filter((d) => d.system === system);
  const problems = scriptProblems(model?.scripts);
  // on a narrow page a panel that slid in can be pinned beside the canvas, and a pinned one let go
  const pin = (side, mode) =>
    narrow &&
    mode !== 'edge' &&
    html`<div class="pane-head">
      ${mode === 'over'
        ? html`<button class="quiet" data-tip="Keep it beside the canvas, which gets narrower" onClick=${() => sides.pin(side, true)}>Pin</button>`
        : html`<button class="quiet" data-tip="Let it slide over the canvas again" onClick=${() => sides.pin(side, false)}>Unpin</button>`}
    </div>`;
  // the outline's search field and list, docked or slid in
  const outlineBody = html`
    ${pin('outline', outlineMode)}
    <div class="search-box">
      <input
        class="search"
        id="search"
        name="search"
        type="search"
        placeholder="Search"
        aria-label="Search the model"
        ref=${searchField}
        value=${query}
        onInput=${(e) => {
          typedAt.current = performance.now();
          setQuery(e.currentTarget.value);
          setActive(null);
        }}
        onKeyDown=${searchKey}
      />
      <kbd aria-hidden="true">/</kbd>
    </div>
    <div class="list">
      ${query.trim()
        ? html`<${Results} results=${results} onPick=${pick} onPoint=${(i) => setActive(rowId(results[i]))} />`
        : model && html`<${Outline} systems=${model.systems} open=${system} onOpen=${pickSystem} counts=${changes.systems} />`}
    </div>
  `;
  // a static copy tries no values and copies no reference for Claude
  const inspectorBody = html`${pin('inspector', inspectorMode)}${model && html`<${Inspector} model=${model} block=${block} whatifs=${whatif.whatifs} on=${host.site ? null : whatifOn} onOpen=${() => runCommand('open')} />`}`;
  const pageClass = `page${outlineMode === 'docked' ? '' : ' left-edge'}${inspectorMode === 'docked' ? '' : ' right-edge'}`;
  return html`<div class=${pageClass} ref=${pageElement}>
    <${TopBar}
      model=${model}
      system=${system}
      changes=${changes}
      state=${fileState({ link, status, putAway })}
      problems=${problems}
      share=${{ count: selection.length, withheld, error: shareError, follow, system: oneLine(model?.systems.find((s) => s.id === system)?.name ?? ''),
        primary: block && block.sid === primary ? oneLine(block.name) : null }}
      menu=${claudeMenu(contextNow())}
      running=${runState?.state === 'running'}
      pickable=${pickable()}
      site=${host.site}
      framed=${host.framed}
      full=${full}
      run=${runCommand}
      open=${openByPerson}
      dismiss=${setPutAway}
    />
    ${outlineMode === 'docked' && html`<aside class="outline">${outlineBody}</aside>`}
    ${outlineMode === 'docked'
      ? html`<${Splitter} side="left" label="Outline width" tip="Drag or use the arrow keys to resize; double-click to hide it" command="outline" size=${widthOf('left')}
          bounds=${widthBounds} onSize=${resize('left')} onDone=${keepWidths} onToggle=${() => runCommand('outline')} />`
      : html`<${Edge} side="left" open=${outlineMode === 'over'} onToggle=${() => runCommand('outline')} command="outline" />`}
    <div class="middle">
    <div class="stage">
    ${!host.site && html`<${Banners} follow=${follow} whatifs=${whatif.whatifs} asked=${whatif.asked} on=${whatifOn} run=${runCommand} />`}
    <main class="canvas" ref=${canvasElement} tabindex="0">
      ${failure && html`<div class="message">${failure}</div>`}
      ${gone.length > 0 &&
      html`<div class="gone" title=${gone.map((d) => oneLine(d.name)).join('\n')}>
        Deleted since reviewed: ${gone.slice(0, 3).map((d) => oneLine(d.name)).join(', ')}${gone.length > 3 ? ` and ${gone.length - 3} more` : ''}
      </div>`}
      ${notice &&
      html`<div class="notice">
        <span>${notice.text}</span>
        ${notice.request &&
        html`<button
          class="quiet"
          onClick=${() => {
            dispatchPlace({ type: 'apply', request: notice.request, drawn: drawnNow });
            shareSoon(true);
          }}
        >
          Go
        </button>`}
        <button class="quiet icon close" data-tip="Close" aria-label="Close" onClick=${() => setNotice(null)}>×</button>
      </div>`}
      ${picking && html`<div class="notice"><span>Click the line the input adds to</span><button class="quiet icon close" data-command="cancelPick" aria-label=${tipParts('cancelPick').label} onClick=${() => runCommand('cancelPick')}>×</button></div>`}
    </main>
    ${outlineMode === 'over' && html`<aside class="outline over">${outlineBody}</aside>`}
    ${inspectorMode === 'over' && html`<aside class="inspector over">${inspectorBody}</aside>`}
    </div>
    ${textOn && html`<${Twin} twin=${twin} failure=${twinError} onLine=${pointLine} onPick=${pickLine} />`}
    ${!host.site &&
    html`<${Dock}
      layout=${layout}
      setLayout=${runner.setLayout}
      runs=${runs}
      runState=${runState}
      theme=${theme}
      auto=${auto}
      setAuto=${runner.setAuto}
      height=${dockHeight}
      setHeight=${runner.setHeight}
      onDrawn=${runner.plotDrawn}
      onCursor=${setCursorT}
      provideKey=${keyActions.provide}
      onRunsChanged=${runner.refreshRuns}
      scrub=${scrub}
      unscrubbed=${unscrubbed}
      onWindow=${runner.setWindow}
      onMode=${runner.setMode}
      linear=${{ inputs: linInputs, picking, pick: runner.pickInput }}
      version=${status?.version}
      onLinear=${(ms) => marks.push({ name: 'linear', ms, at: Date.now() })}
      problems=${problems?.lines}
    />`}
    </div>
    ${inspectorMode === 'docked'
      ? html`<${Splitter} side="right" label="Inspector width" tip="Drag or use the arrow keys to resize; double-click to hide it" command="inspector" size=${widthOf('right')}
          bounds=${widthBounds} onSize=${resize('right')} onDone=${keepWidths} onToggle=${() => runCommand('inspector')} />`
      : html`<${Edge} side="right" open=${inspectorMode === 'over'} onToggle=${() => runCommand('inspector')} command="inspector" />`}
    ${inspectorMode === 'docked' && html`<aside class="inspector">${inspectorBody}</aside>`}
    ${sheet && html`<${Sheet} onClose=${() => runCommand('closeSheet')} site=${host.site} framed=${host.framed && !full} />`}
  </div>`;
}

// the picker: the models below the server's folder, newest first, filtered as you type; it reads
// the list again every 20 s, which also keeps a server started with --open running
function Picker({ notice }) {
  const [list, setList] = useState(null);
  const [failure, setFailure] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const field = useRef(null);
  const leaving = useRef(false);
  // the server filters the whole folder, past the models it sends: asked again as the query changes
  const queryNow = useRef('');
  queryNow.current = query;
  const reload = useRef(() => {});
  useEffect(() => {
    let alive = true;
    let asked = 0;
    const load = () => {
      const q = queryNow.current.trim();
      const n = ++asked;
      return api(q ? `/api/models?q=${encodeURIComponent(q)}` : '/api/models')
        .then((r) => r.json())
        .then((l) => {
          if (!alive || n !== asked) return;
          setList(l);
          setFailure(null);
        })
        .catch((e) => {
          if (!alive) return;
          setFailure(
            e.status === 401
              ? 'This tab has no access to the server: open the URL slxkit view printed.'
              : 'Not connected to slxkit view.',
          );
        });
    };
    reload.current = load;
    load();
    const timer = setInterval(load, 20000);
    // a live channel that carries nothing here: the server counts it as an open page, so one
    // started with --open keeps running while this tab is hidden and its timers are throttled
    const close = connect({ url: socketUrl(), token, hello: { pick: true }, onEvent: () => {}, onLink: () => {} });
    // back to a model's address, or a restarted server's URL: that page
    const back = () => !leaving.current && !takeLateToken(PICK) && !isPick(location.hash) && location.reload();
    window.addEventListener('popstate', back);
    field.current?.focus();
    return () => {
      alive = false;
      clearInterval(timer);
      close();
      window.removeEventListener('popstate', back);
    };
  }, []);
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) {
      typed.current = true;
      return undefined;
    }
    const soon = setTimeout(() => reload.current(), 100);
    return () => clearTimeout(soon);
  }, [query]);
  const shown = list ? pickModels(list.models, query) : [];
  const at = Math.min(active, Math.max(0, shown.length - 1));
  // the row the arrows reach stays in view, so Enter opens a model the person sees
  useEffect(() => {
    document.querySelector('.models li.active')?.scrollIntoView({ block: 'nearest' });
  }, [at, query]);
  const choose = (m) => {
    leaving.current = true;
    const hash = placeHash({ model: m.path, system: 'root' });
    // in a frame the trail keeps the place, and the host's history stays as it was
    if (trail) {
      keepTrail(pushPlace(trail, hash));
      history.replaceState(null, '', hash);
    } else location.hash = hash;
    location.reload();
  };
  const key = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(0, Math.min(shown.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && shown[at]) {
      e.preventDefault();
      choose(shown[at]);
    }
  };
  const now = Date.now();
  let body;
  if (failure) body = html`<p class="bad">${failure}</p>`;
  else if (!list) body = html`<p class="muted">Looking for models…</p>`;
  else if (list.models.length === 0) body = html`<p>No .slx files below ${list.root}.</p>`;
  else if (shown.length === 0) body = html`<p class="muted">No model matches.</p>`;
  else
    body = html`<ul class="models" role="listbox" aria-label="Models">
      ${shown.map((m, i) => {
        const { name, folder } = split(m.path);
        return html`<li
          key=${m.path}
          role="option"
          aria-selected=${i === at}
          class=${i === at ? 'active' : ''}
          title=${m.path}
          onClick=${() => choose(m)}
          onMouseMove=${() => i !== at && setActive(i)}
        >
          <span class="name">${name}</span><span class="folder">${folder}</span><span class="age">${m.modified == null ? '' : ago(m.modified, now)}</span>
        </li>`;
      })}
    </ul>`;
  return html`<div class="picker">
    <h1>Open a model</h1>
    ${list?.root && html`<p class="muted">${list.root}</p>`}
    ${notice && html`<p class="bad">${notice}</p>`}
    <input
      ref=${field}
      type="search"
      name="filter"
      placeholder="Filter by name or folder"
      aria-label="Filter models"
      value=${query}
      onInput=${(e) => {
        setQuery(e.target.value);
        setActive(0);
      }}
      onKeyDown=${key}
    />
    ${body}
    ${list?.partial && html`<p class="muted">The folder is large: these are the first ${list.models.length} models found.</p>`}
  </div>`;
}

// the address under the picker: a blank one, or one the page cannot read, becomes the picker's own
// when the server asked for the picker, so that back to this entry shows it again; the second is
// named in the picker's notice
function pickerAddress(asked) {
  const blank = location.hash === '' || location.hash === '#';
  const unread = blank || parsePlace(location.hash) ? null : `The page cannot read the address ${location.hash}`;
  if (asked && (blank || unread)) history.replaceState(null, '', PICK);
  return unread;
}

// the picker when the address asks for it or the server has no model to show; else the page. A
// static copy reads its site.json first and its files in place of a server
export async function start() {
  /** @type {any} */ (window).slxkit = hooks;
  modelPath = parsePlace(location.hash)?.model ?? null;
  const root = document.getElementById('app');
  if (host.site) {
    try {
      site = await readSite();
    } catch (e) {
      return render(html`<p class="message">Cannot read this copy of the model: ${e.message}</p>`, root);
    }
    configureApi({ token: null, modelPath, fetch: createSiteFetch({ site, model: modelPath }) });
  } else {
    token = takeToken();
    configureApi({ token, modelPath });
  }
  pageName = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  // full screen from a frame: the page then behaves as a page of its own (canvas.js, style.css)
  const frame = () => {
    store.set({ full: !!document.fullscreenElement });
    document.documentElement.classList.toggle('framed', framedNow());
  };
  frame();
  document.addEventListener('fullscreenchange', frame);
  // in VS Code and in a website's frame the page keeps its own back and forward: the frame's history
  // entries would be the host's
  if (host.embedded || host.framed) {
    // a reload of this frame finds its trail again under the frame's name
    if (!window.name.startsWith('slxkit-')) window.name = `slxkit-${pageName}`;
    let kept = null;
    try {
      kept = readTrail(sessionStorage.getItem(trailKey()));
    } catch {
      // storage blocked: a new trail
    }
    trail = kept ?? startTrail(location.hash);
  }
  const dark = matchMedia('(prefers-color-scheme: dark)');
  store.set({ theme: themeOf(host.theme, dark.matches), narrow: innerWidth < NARROW });
  // the theme from now on, so that one VS Code sends while the model loads is kept
  watchTheme({
    store,
    hostTheme: host.theme,
    dark,
    onHost,
    root: document.documentElement,
    hash: () => location.hash,
    go: visit,
  });
  if (host.theme) document.documentElement.dataset.theme = host.theme;
  if (isPick(location.hash)) return render(html`<${Picker} />`, root);
  let file = null;
  try {
    // a server with no model to show asks for the picker, without an error status
    const asked = await (await api('/api/model')).json();
    if (asked.pick === true) return render(html`<${Picker} notice=${pickerAddress(true)} />`, root);
    file = asked.file ?? null;
  } catch (e) {
    // a model that is not there (404) or cannot be read (422): the picker, saying why
    if (e.status === 404 || e.status === 422) {
      const asked = e.data?.pick === true;
      const why = e.status === 422 ? `Cannot open ${modelPath}: ${e.message}` : e.message;
      const unread = pickerAddress(asked);
      return render(html`<${Picker} notice=${unread ?? (asked ? null : why)} />`, root);
    }
  }
  // Follow Claude and the twin as the person left them, before the live channel can bring a request
  store.set(choicesOf(file, storage.get));
  render(html`<${App} />`, root);
}
