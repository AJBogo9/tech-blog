// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's keys in one map (viewing design 5.10), read in layers from the innermost out: a menu,
// the key sheet, pick mode, the search, another field, a slid-in panel, a run going, the plots' cursors, the
// canvas. Escape is decided here once; a field other than the search keeps its own Escape (a what-if
// row goes back to the model's value)

import { commandOf } from './commands.js';

/**
 * a key as the map names it: 'F' for f and F, 'Ctrl+K' for Ctrl or Cmd with k, 'Alt+ArrowLeft',
 * 'Escape' with any modifier; null for Ctrl or Cmd with Alt, which the page leaves alone, and for
 * a keydown with no key (Chrome's autofill sends such)
 * @param {{ key?: string, code?: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean }} e
 * @returns {string | null}
 */
export function keyName({ key, code, ctrlKey, metaKey, altKey }) {
  if (typeof key !== 'string') return null;
  if (key === 'Escape') return key;
  const command = ctrlKey || metaKey;
  if (command && altKey) return null;
  const bare = key.length === 1 ? key.toUpperCase() : key;
  if (command) return `Ctrl+${bare}`;
  // Alt by the letter or digit typed, else by the key's place: Option+K on a Mac types "˚"
  if (altKey) return `Alt+${/^[A-Za-z0-9]$/.test(key) ? bare : (/^(?:Key|Digit)(.)$/.exec(code ?? '')?.[1] ?? bare)}`;
  return bare;
}

/**
 * @typedef {{ menu: boolean, sheet: boolean, picking: boolean, field: boolean, search: boolean, button: boolean, separator: boolean, slid: boolean, running: boolean }} Where
 * where the key was pressed: a menu is open (menu.js), the key sheet is open, a plot picks an input line, focus is in a field,
 * that field is the search, focus is on a button, summary or link, focus is on a splitter, a side
 * panel is over the canvas, a run is going
 * @typedef {{ ids: string[], first: boolean, prevent: boolean | 'acted', stop: boolean, share: boolean, unhover: boolean, coast: boolean }} Route
 * the commands to run in order, or only until one acted (`first`); preventDefault always, never or
 * when one acted; stopPropagation; share the view with Claude when one acted; end a readout; end a
 * coast of the canvas
 */

// the keys a splitter sizes its pane by (splitter.js)
const SIZING = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** @type {Route} */
const NONE = { ids: [], first: false, prevent: false, stop: false, share: false, unhover: true, coast: false };

/**
 * what a key does where it was pressed
 * @param {string | null} name keyName's
 * @param {Where} at
 * @returns {Route}
 */
export function route(name, at) {
  // Escape closes the innermost layer open, in the order of commands.js ESCAPE_ORDER
  if (name === 'Escape') {
    // a menu over everything: it closes and its button takes the focus
    if (at.menu) return { ...NONE, ids: ['closeMenu'], prevent: true, stop: true, unhover: false };
    // the key sheet over the page
    if (at.sheet) return { ...NONE, ids: ['closeSheet'], prevent: true, stop: true, unhover: false };
    // pick mode, even in a field: the pick is what the person is in the middle of
    if (at.picking) return { ...NONE, ids: ['cancelPick'], prevent: true, stop: true, unhover: false };
    // the search ends: its field clears and the outline that slid in for it goes
    if (at.search) return { ...NONE, ids: ['endSearch'], prevent: true, stop: true, unhover: false };
    // another field's own Escape (a what-if row undoes the drag it is in)
    if (at.field) return NONE;
    // panels over the canvas go, and nothing else happens
    if (at.slid) return { ...NONE, ids: ['putAway'], prevent: true, stop: true, unhover: false };
    // a run going stops, and nothing else
    if (at.running) return { ...NONE, ids: ['stop'], prevent: true };
    // the plots' cursors clear; only when there were none, the selection
    return { ...NONE, ids: ['clearCursor', 'deselect'], first: true, prevent: 'acted', share: true, coast: true };
  }
  // a focused splitter keeps the keys that size its pane
  if (at.separator && SIZING.has(name)) return NONE;
  const id = name === null ? null : commandOf(name);
  if (!id) return NONE;
  // with Ctrl or Alt a key works anywhere, a field included, and keeps its own meaning when the
  // command did nothing (Option+K types its character); Alt+arrows leave a readout as it is
  if (name.startsWith('Ctrl+') || name.startsWith('Alt+')) return { ...NONE, ids: [id], prevent: 'acted', unhover: !name.startsWith('Alt+') };
  // a plain key never acts in a field or an open menu, which takes its arrows, Enter and Space, and
  // a focused button, summary or link keeps its Enter and Space
  if (at.field || at.menu || (at.button && (name === 'Enter' || name === ' '))) return NONE;
  return { ...NONE, ids: [id], prevent: 'acted', share: true, coast: name === 'Enter' || name === 'Backspace' };
}

/**
 * the page's one keydown listener, in the capture phase so that pick mode and slid-in panels take
 * Escape before the focused element does
 * @param {EventTarget} target window
 * @param {{ at: (e: KeyboardEvent) => Where, run: (id: string) => boolean, unhover: () => void, coast: () => void, after: () => void }} page
 *   where the page is; a command run, true when it acted; a readout ended; a coast ended; the view shared
 * @returns {() => void} stops listening
 */
export function listenKeys(target, { at, run, unhover, coast, after }) {
  /** @param {KeyboardEvent} e */
  const down = (e) => {
    const r = route(keyName(e), at(e));
    if (r.unhover) unhover();
    if (r.ids.length === 0) return;
    if (r.coast) coast();
    let acted = false;
    for (const id of r.ids) {
      acted = run(id) === true || acted;
      if (r.first && acted) break;
    }
    if (r.prevent === true || (r.prevent === 'acted' && acted)) e.preventDefault();
    if (r.stop) e.stopPropagation();
    if (r.share && acted) after();
  };
  // an options object, not true: node's EventTarget, which the tests use, removes a capture
  // listener only by an options object
  target.addEventListener('keydown', down, { capture: true });
  return () => target.removeEventListener('keydown', down, { capture: true });
}

/**
 * actions a component provides for the key map while it is shown (the dock's cursors); each says
 * whether it acted
 * @param {() => void} [changed] an action provided or withdrawn: search offers the commands again
 */
export function createActions(changed = () => {}) {
  /** @type {Map<string, () => boolean | void>} */
  const actions = new Map();
  return {
    /** @param {string} id @param {() => boolean | void} action @returns {() => void} */
    provide(id, action) {
      actions.set(id, action);
      changed();
      return () => {
        if (actions.get(id) !== action) return;
        actions.delete(id);
        changed();
      };
    },
    /** @param {string} id @returns {boolean | null} null when nothing provides it */
    run(id) {
      const action = actions.get(id);
      return action ? action() === true : null;
    },
    /** @param {string} id @returns {boolean} whether something provides it now */
    has: (id) => actions.has(id),
  };
}
