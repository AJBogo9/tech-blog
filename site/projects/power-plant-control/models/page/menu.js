// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// a menu (design 3.5): a button opens a raised list under it, items 28 px with their key on the
// right, checkbox items, rules between groups. A click, Enter, Space or ArrowDown opens it on the
// first item that applies, ArrowUp on the last; the arrows, Home and End move over the items that
// apply; Enter or a click runs one; Escape (the key map's menu layer, keys.js) closes it and focuses
// the button; Tab, a press outside or the focus going elsewhere closes it. Which menu is open is kept
// here, outside the store

import { html, useState, useRef, useLayoutEffect } from './vendor/htm-preact.js';

/** @typedef {import('./commands.js').MenuItem} MenuItem */

/** @param {{ why?: string | null }} item */
const applies = (item) => !item.why;

/**
 * the item a key moves to from `from`: the arrows to the next or previous item that applies, round
 * past the ends; Home and End to the first and the last that apply; -1 when none applies
 * @param {{ why?: string | null }[]} items
 * @param {number} from
 * @param {string} key
 */
export function moveTo(items, from, key) {
  const ok = items.map(applies);
  if (!ok.includes(true)) return -1;
  if (key === 'Home') return ok.indexOf(true);
  if (key === 'End') return ok.lastIndexOf(true);
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return from;
  const n = items.length;
  for (let i = 1; i <= n; i++) {
    const at = (((from + step * i) % n) + n) % n;
    if (ok[at]) return at;
  }
  return from;
}

/**
 * the item a menu opens on: the last that applies for ArrowUp, else the first
 * @param {{ why?: string | null }[]} items
 * @param {string} key the key that opened it, or 'click'
 */
export const openAt = (items, key) => moveTo(items, -1, key === 'ArrowUp' ? 'End' : 'Home');

/** @type {{ close: () => void } | null} the open menu */
let current = null;

/** whether a menu is open, for the key map's layer */
export const menuOpen = () => current !== null;

/** the open menu closed, its button focused; false when none was open */
export function closeMenu() {
  if (!current) return false;
  current.close();
  return true;
}

/**
 * a button and the menu it opens
 * @param {object} props
 * @param {string} props.box the classes of the box that holds both
 * @param {string} props.className the button's classes beside quiet, which a menu's button is
 * @param {string} props.label the menu's name
 * @param {string} [props.tip] the button's tooltip
 * @param {MenuItem[]} props.items
 * @param {(id: string) => unknown} props.onRun an item chosen
 * @param {any} [props.children] the button's content
 */
export function Menu({ box, className, label, tip, items, onRun, children }) {
  // the focused item while open (-1: none applies), null while closed
  const [at, setAt] = useState(/** @type {number | null} */ (null));
  const open = at !== null;
  const boxRef = useRef(/** @type {HTMLElement | null} */ (null));
  const button = useRef(/** @type {HTMLElement | null} */ (null));
  const list = useRef(/** @type {HTMLElement | null} */ (null));
  // what had the focus before the menu opened: a mouse click leaves it on the canvas
  const before = useRef(/** @type {Element | null} */ (null));

  /** @param {'button' | 'before' | null} focus */
  const close = (focus) => {
    setAt(null);
    if (focus === 'button') button.current?.focus();
    else if (focus === 'before') /** @type {HTMLElement | null} */ (before.current)?.focus?.();
  };
  /** @param {string} key */
  const openOn = (key) => {
    before.current = document.activeElement;
    setAt(openAt(items, key));
  };

  // while open: the key map's Escape reaches it, and a press outside closes it
  useLayoutEffect(() => {
    if (!open) return;
    const me = { close: () => close('button') };
    current = me;
    const press = (/** @type {Event} */ e) => {
      if (!boxRef.current?.contains(/** @type {Node} */ (e.target))) close(null);
    };
    document.addEventListener('pointerdown', press, true);
    return () => {
      if (current === me) current = null;
      document.removeEventListener('pointerdown', press, true);
    };
  }, [open]);
  // the focused item takes the focus
  useLayoutEffect(() => {
    if (at === null) return;
    const element = at >= 0 ? list.current?.querySelectorAll('[role^="menuitem"]')[at] : list.current;
    /** @type {HTMLElement | null | undefined} */ (element)?.focus();
  }, [at]);

  const onButtonKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    openOn(e.key);
  };
  const onListKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setAt(moveTo(items, at ?? -1, e.key));
    } else if (e.key === 'Tab') {
      // the Tab goes on from the button
      close('button');
    }
  };
  // the focus gone elsewhere (a key command such as Ctrl+K): the menu closes and leaves the focus
  // there; a window losing the focus keeps it open
  const onFocusOut = (/** @type {FocusEvent} */ e) => {
    if (!open || boxRef.current?.contains(/** @type {Node | null} */ (e.relatedTarget))) return;
    if (e.relatedTarget === null && !document.hasFocus()) return;
    close(null);
  };
  /** @param {MenuItem} item */
  const choose = (item) => {
    if (item.why) return;
    close('before');
    onRun(item.id);
  };

  return html`<div class=${`menu-box ${box}`} ref=${boxRef} onFocusOut=${onFocusOut}>
    <button class=${`quiet ${className}`} ref=${button} aria-haspopup="menu" aria-expanded=${open} data-tip=${tip}
      onClick=${() => (open ? close('before') : openOn('click'))} onKeyDown=${onButtonKey}>${children}</button>
    ${open &&
    html`<div class="menu" role="menu" aria-label=${label} tabindex="-1" ref=${list} onKeyDown=${onListKey}>
      ${items.map(
        (item) => html`${item.rule && html`<hr />`}
          <button class="menuitem" role=${item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked=${item.checked === undefined ? undefined : String(item.checked)} aria-disabled=${item.why ? 'true' : undefined}
            data-item=${item.id} data-tip=${item.why ?? undefined} tabindex="-1" onClick=${() => choose(item)}>
            <span class="check" aria-hidden="true">${item.checked ? '✓' : ''}</span>
            <span class="label">${item.label}</span>
            ${item.keys && html`<kbd>${item.keys}</kbd>`}
          </button>`,
      )}
    </div>`}
  </div>`;
}
