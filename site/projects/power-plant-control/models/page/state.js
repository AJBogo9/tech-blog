// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's state in one store (design 6.1): what App held in 36 useState calls and 15 mirror
// refs. Components read it with useStore; callbacks registered once read store.get()

import { createStore, useSelector } from './store.js';
import { NO_INPUTS } from './lin.js';
import { initialPlaces } from './places.js';

// what the person chose for each side panel, kept apart for a wide and a narrow page (panels.js)
export const NO_PANES = { outline: 'auto', inspector: 'auto', outline_narrow: 'auto', inspector_narrow: 'auto' };

// the page before the server has said anything; start() sets the theme and the width
export function initialState() {
  return {
    // the server: its status (version, file problem, Claude's live edits), the model's outline, the
    // live channel ('connected', 'lost', 'token'), and why nothing can be drawn
    status: null,
    model: null,
    link: 'connected',
    failure: null,
    theme: 'light',
    // where the page is: the open system, the blocks selected, the one the inspector shows, and the
    // address, history and show requests around them (places.js)
    ...initialPlaces(),
    // what Claude sees and does: the selection withheld, Follow Claude, the notice over the canvas,
    // a failed share, a warning about Claude's session the person put away
    withheld: false,
    follow: false,
    notice: null,
    shareError: null,
    putAway: null,
    // what the page reads per version: the changes since reviewed and the search index; the text
    // twin on or off and what the canvas points at
    changes: { blocks: {}, deleted: [], systems: {} },
    index: null,
    textOn: false,
    pointed: null,
    // search: the query and the active result's row id (search.js rowId), null for the first; the
    // key sheet open
    query: '',
    active: /** @type {string | null} */ (null),
    sheet: false,
    // runs: the records newest first, the run going, the plots' signals, Auto, the dock's height, the
    // fixed time cursor
    runs: [],
    runState: null,
    layout: [],
    auto: true,
    dockHeight: 280,
    cursorT: null,
    // what-if values and the scrub: the server's list, the scrub's drawing, a count that puts the
    // runs' own plots back, the words beside the row dragged
    whatif: { whatifs: [], asked: null },
    scrub: null,
    unscrubbed: 0,
    scrubHint: null,
    // the linear model's input line of each plot, and the plot picking one
    linInputs: NO_INPUTS,
    picking: null,
    // the side panels: the person's choice per width, which slide in now and why, whether the page is narrow
    panes: NO_PANES,
    slides: { outline: null, inspector: null },
    narrow: false,
    // the page is shown full screen (a frame's full-screen button)
    full: false,
  };
}

/** @typedef {ReturnType<typeof initialState>} PageState */

// what the pointer is over: the canvas's target and the search result; only the twin and the
// results read them, so a hover renders nothing else (a key added for a hover goes here)
export const HOVER = /** @type {const} */ (['pointed', 'active']);
// what App reads: every key but the hover keys and the places bookkeeping; a new key goes here, into
// HOVER or into BOOKKEEPING (state.test.mjs holds the three to the state's keys)
export const APPS = /** @type {const} */ ([
  'status', 'model', 'link', 'failure', 'theme',
  'system', 'selection', 'primary', 'systems',
  'withheld', 'follow', 'notice', 'shareError', 'putAway',
  'changes', 'index', 'textOn',
  'query', 'sheet',
  'runs', 'runState', 'layout', 'auto', 'dockHeight', 'cursorT',
  'whatif', 'scrub', 'unscrubbed', 'scrubHint',
  'linInputs', 'picking',
  'panes', 'slides', 'narrow', 'full',
]);

/**
 * App's part of the state: its keys (APPS)
 * @param {PageState} state
 * @returns {Pick<PageState, typeof APPS[number]>}
 */
export function appsPart(state) {
  const part = {};
  for (const key of APPS) part[key] = state[key];
  return /** @type {any} */ (part);
}

export const store = createStore(initialState());

/**
 * the part of the page's state a component reads
 * @template T
 * @param {(state: PageState) => T} select
 * @returns {T}
 */
export const useStore = (select) => useSelector(store, select);

/**
 * a useState-like setter of one key: a value, or a function of the value now
 * @param {keyof PageState} key
 * @returns {(value: any) => void}
 */
export const setter = (key) => (value) => store.set((s) => ({ [key]: typeof value === 'function' ? value(s[key]) : value }));

let noticeTimer = null;
/**
 * a short notice over the canvas, gone after 4 s; one that carries Claude's request (with Go) stays
 * until it is acted on
 * @param {string} text
 * @param {any} [request]
 */
export function say(text, request = null) {
  clearTimeout(noticeTimer);
  store.set({ notice: { text, request } });
  if (!request) noticeTimer = setTimeout(() => store.set({ notice: null }), 4000);
}

// the person's choices this browser keeps per model (localStorage); storage may be blocked
export const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // not kept
    }
  },
};
