// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// where the page is (viewing design V11), as a pure reducer: the open system, the selection, the
// address and its history entries, and Claude's show requests. Each event gives the next state and
// the effects the page carries out (a notice, blocks shown on the canvas, an address written, a
// reload). The order is the page's: a place from the address waits until its system is drawn, the
// address waits for the page while it heads for a place, and a show request taken with a version
// the page has not drawn waits for that version.

import { keepOrParent } from './view.js';
import { isPick, landing, parsePlace, placeHash } from './place.js';

const oneLine = (text) => String(text).replace(/\s*\n\s*/g, ' ');

/**
 * @typedef {{ id: string, parent: string | null, name: string }} System
 * @typedef {{ system: string, sel: string[], reveal?: string[], model?: string }} Place
 * @typedef {{ system: string, select?: string[], note?: { sid: string, text: string } | null, version?: number }} ShowRequest
 * @typedef {(sids: string[]) => string[]} Drawn the blocks of a list the canvas has drawn now, each once
 * @typedef {{ kind: 'notice', text: string, request?: ShowRequest }
 *   | { kind: 'unnotice' }
 *   | { kind: 'show', select: string[], reveal: string[], note?: { sid: string, text: string } | null }
 *   | { kind: 'address', hash: string, push: boolean }
 *   | { kind: 'reload' }
 *   | { kind: 'opening', id: string }} Effect
 */

// the page before its model has loaded
export function initialPlaces() {
  return {
    system: 'root',
    /** @type {string[]} */
    selection: [],
    /** @type {string | null} */
    primary: null,
    // the outline's systems as last read, and every system's parent seen this session, so a place
    // whose system a save took away lands on its nearest parent
    /** @type {System[]} */
    systems: [],
    /** @type {Map<string, string | null>} */
    parents: new Map(),
    // a place from the address or a search, selected once its system is drawn; `heading` is that
    // place while the page is on its way to it (back, forward, a link, the first load): the browser
    // already stands on its entry, so the address waits for the page instead of writing over it
    /** @type {Place | null} */
    pendingPlace: null,
    /** @type {Place | null} */
    heading: null,
    // the next change of system replaces the history entry instead of adding one
    replacing: false,
    // the place last written to the address
    /** @type {{ system: string, sel: string[] } | null} */
    lastPlace: null,
    // Claude's show request waiting for its system to be drawn; one taken with a version this page
    // has not drawn yet; and the version drawn
    /** @type {ShowRequest | null} */
    pendingShow: null,
    /** @type {ShowRequest | null} */
    awaitedShow: null,
    drawnVersion: 0,
  };
}

/** @typedef {ReturnType<typeof initialPlaces>} Places */

const KEYS = Object.keys(initialPlaces());
// the keys only the reducer reads: the page renders nothing from them
export const BOOKKEEPING = /** @type {const} */ ([
  'parents',
  'pendingPlace',
  'heading',
  'replacing',
  'lastPlace',
  'pendingShow',
  'awaitedShow',
  'drawnVersion',
]);

/**
 * the places part of a larger state (the page's store holds these keys among others)
 * @param {Record<string, any>} state
 * @returns {Places}
 */
export const placesOf = (state) => /** @type {Places} */ (Object.fromEntries(KEYS.map((k) => [k, state[k]])));

/**
 * open a system: a request or place waiting for another system is over, and so is the way to a place
 * @param {Places} state
 * @param {string} id
 * @param {Effect[]} effects
 * @returns {Places}
 */
function open(state, id, effects) {
  const next = {
    ...state,
    heading: null,
    pendingShow: state.pendingShow && state.pendingShow.system !== id ? null : state.pendingShow,
    pendingPlace: state.pendingPlace && state.pendingPlace.system !== id ? null : state.pendingPlace,
  };
  if (!state.systems.some((s) => s.id === id)) return next;
  effects.push({ kind: 'opening', id });
  return { ...next, selection: [], primary: null, system: id };
}

/**
 * Claude's request on the system drawn: its blocks selected and brought into view, its note pinned
 * @param {Places} state
 * @param {ShowRequest} request
 * @param {Drawn} drawn
 * @param {Effect[]} effects
 * @returns {Places}
 */
function finish(state, request, drawn, effects) {
  const sids = drawn(request.select ?? []);
  const shown = request.note ? [...sids, request.note.sid] : sids;
  effects.push({ kind: 'show', select: sids, reveal: drawn(shown), note: request.note ?? null });
  return { ...state, selection: sids, primary: sids[0] ?? null };
}

/**
 * Claude's request taken up (Go, or Follow Claude): at once on the system drawn, after the drawing
 * of another system, or once the version it was taken with is drawn
 * @param {Places} state
 * @param {ShowRequest} request
 * @param {Drawn} drawn
 * @param {Effect[]} effects
 * @returns {Places}
 */
function apply(state, request, drawn, effects) {
  effects.push({ kind: 'unnotice' });
  // taken with a version this page has not drawn yet, or before anything is drawn: wait for it
  if ((request.version ?? 0) > state.drawnVersion || state.drawnVersion === 0) return { ...state, awaitedShow: request };
  if (!state.systems.some((s) => s.id === request.system)) {
    effects.push({ kind: 'notice', text: "Claude's request names a system this model no longer has" });
    return state;
  }
  if (request.system === state.system) return finish(state, request, drawn, effects);
  return open({ ...state, pendingShow: request }, request.system, effects);
}

/**
 * the next state and its effects
 * @param {Places} state
 * @param {any} event
 * @returns {{ state: Places, effects: Effect[] }}
 */
export function reducePlaces(state, event) {
  /** @type {Effect[]} */
  const effects = [];
  const done = (next) => ({ state: next, effects });
  switch (event.type) {
    // the outline of a new version: on the first, the place the address names; later, a save
    // that took the open system away leaves its nearest parent in place of this entry
    case 'loaded': {
      const parents = new Map(state.parents);
      for (const s of event.systems) parents.set(s.id, s.parent);
      const next = { ...state, systems: event.systems, parents };
      if (state.systems.length === 0) {
        const place = parsePlace(event.hash);
        if (place && event.systems.some((s) => s.id === place.system))
          return done({ ...next, pendingPlace: place, heading: place, system: place.system });
        if (!place && event.hash !== '' && event.hash !== '#')
          effects.push({ kind: 'notice', text: `The page cannot read the address ${event.hash}: showing the root` });
        return done(next);
      }
      const kept = keepOrParent(event.systems, state.systems, state.system);
      if (kept === state.system) return done(next);
      // its blocks went with it: what the selection named is gone (or, in another model copied over
      // the file, another block)
      const gone = state.systems.find((s) => s.id === state.system)?.name ?? state.system;
      const shown = event.systems.find((s) => s.id === kept)?.name ?? kept;
      effects.push({ kind: 'notice', text: `${oneLine(gone)} was removed: showing ${oneLine(shown)}` });
      return done({ ...next, replacing: true, selection: [], primary: null, system: kept });
    }
    // the canvas drew `system` of `version`: what is still drawn as it was stays selected (a reload
    // can take blocks away, or give their SIDs to blocks of another type), then the place, the show
    // request and the awaited request waiting for this drawing
    case 'drawn': {
      let next = { ...state, drawnVersion: event.version };
      const kept = event.drawn(state.selection).filter((sid) => !event.retyped.includes(sid));
      if (kept.length !== state.selection.length)
        next = { ...next, selection: kept, primary: kept.includes(state.primary) ? state.primary : (kept[kept.length - 1] ?? null) };
      const place = state.pendingPlace;
      if (place && place.system === event.system) {
        const sids = event.drawn(place.sel);
        effects.push({ kind: 'show', select: sids, reveal: place.reveal ?? sids });
        next = { ...next, pendingPlace: null, selection: sids, primary: sids[0] ?? null };
      }
      const asked = state.pendingShow;
      if (asked && asked.system === event.system) next = finish({ ...next, pendingShow: null }, asked, event.drawn, effects);
      const awaited = state.awaitedShow;
      if (awaited && (awaited.version ?? 0) <= event.version) next = apply({ ...next, awaitedShow: null }, awaited, event.drawn, effects);
      return done(next);
    }
    // another system could not be drawn: the page stays on the one drawn and says why (with nothing
    // drawn yet the canvas says it, which is the page's to do)
    case 'failed': {
      if (event.shown === null || event.shown === event.system) return done(state);
      const name = state.systems.find((s) => s.id === event.system)?.name ?? event.system;
      effects.push({ kind: 'notice', text: `Cannot open ${oneLine(name)}: ${event.why}` });
      return done({ ...state, heading: null, pendingPlace: null, replacing: true, system: event.shown });
    }
    case 'open':
      return done(open(state, event.id, effects));
    // a search result: its block selected now on the system drawn, or once its system is drawn
    case 'goto': {
      if (event.system === state.system) {
        const sids = event.drawn(event.sel);
        effects.push({ kind: 'show', select: sids, reveal: event.reveal });
        return done({ ...state, selection: sids, primary: sids[0] ?? null });
      }
      return done(open({ ...state, pendingPlace: { system: event.system, sel: event.sel, reveal: event.reveal } }, event.system, effects));
    }
    // the canvas selected blocks (a click, Shift-click, a twin line)
    case 'select':
      return done({ ...state, selection: event.sids, primary: event.primary });
    case 'deselect':
      return done({ ...state, selection: [], primary: null });
    // the inspected block could not be read: it went, unless the inspector moved on meanwhile
    case 'gone':
      return done(state.primary === event.sid ? { ...state, primary: null } : state);
    // the address changed (back, forward, a link typed or pasted): its system, or its nearest parent
    // the model still has, and the blocks of it that are drawn
    case 'arrive': {
      const place = parsePlace(event.hash);
      // the picker, another model, or the server's own page (an empty address): a page of its own
      const own = event.hash === '' || event.hash === '#';
      if (isPick(event.hash) || own || (place && (place.model ?? null) !== event.modelPath)) {
        effects.push({ kind: 'reload' });
        return done(state);
      }
      // an address the page cannot read: said, and the address shows where the page is
      if (!place) {
        effects.push({ kind: 'notice', text: `The page cannot read the address ${event.hash}` });
        effects.push({ kind: 'address', hash: placeHash({ model: event.modelPath, system: state.system, sel: state.selection }), push: false });
        return done(state);
      }
      const target = landing(place, state.systems, state.parents);
      // the system shown and none on the way: select at once
      if (target.system === state.system && event.shown === target.system && !state.heading) {
        const sids = event.drawn(target.sel);
        effects.push({ kind: 'show', select: sids, reveal: sids });
        return done({ ...state, pendingPlace: null, selection: sids, primary: sids[0] ?? null });
      }
      // else once its system is drawn; quick presses each set a newer place to head for
      const next = target.system !== state.system ? open(state, target.system, effects) : state;
      return done({ ...next, pendingPlace: target, heading: target });
    }
    // after the page rendered a change of system or selection: the address follows. A new system is
    // a new history entry, a new selection replaces the entry; on the way to a place the address
    // waits for the page to arrive and then only corrects that entry
    case 'write': {
      const arriving = state.heading;
      if (arriving && (arriving.system !== state.system || state.pendingPlace)) return done(state);
      const hash = placeHash({ model: event.modelPath, system: state.system, sel: state.selection });
      const fresh = !arriving && !state.replacing && state.lastPlace !== null && state.lastPlace.system !== state.system;
      if (event.hash !== hash) effects.push({ kind: 'address', hash, push: fresh });
      return done({ ...state, heading: null, replacing: false, lastPlace: { system: state.system, sel: state.selection } });
    }
    // Claude's show request: at once with Follow Claude on, else a notice with Go
    case 'show': {
      if (event.follow) return done(apply(state, event.request, event.drawn, effects));
      const select = event.request.select ?? [];
      const what = event.request.note?.text ?? `look at ${select.length || 'this'} block${select.length === 1 ? '' : 's'}`;
      effects.push({ kind: 'notice', text: `Claude: ${what}`, request: event.request });
      return done(state);
    }
    // Go on the notice
    case 'apply':
      return done(apply(state, event.request, event.drawn, effects));
    default:
      return done(state);
  }
}
