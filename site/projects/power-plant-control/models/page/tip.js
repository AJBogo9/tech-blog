// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the one tooltip for actions (design 3.5): raised, the action's words and its key in ink-3. It shows
// 400 ms after the pointer rests on an element with `data-command` (the words and keys of commands.js)
// or `data-tip` (its own words; with a command, a second line), at once on keyboard focus, and goes on
// a press, a key, a scroll or blur. One element under body, outside the page's store, so a hover
// renders nothing of the page

import { MAC, tip as tipLine, tipParts } from './commands.js';

// how long the pointer rests before the tooltip shows
export const REST_MS = 400;
// between the tooltip and its element, and between it and the viewport's edges
const GAP = 4;
const MARGIN = 4;

/**
 * where the tooltip goes: centred below its element, above when there is no room below, inside the
 * viewport
 * @param {{ left: number, top: number, width: number, bottom: number }} element its box on screen
 * @param {{ width: number, height: number }} tip the tooltip's size
 * @param {{ width: number, height: number }} view the viewport
 * @returns {{ left: number, top: number }}
 */
export function placeTip(element, tip, view) {
  const centred = element.left + element.width / 2 - tip.width / 2;
  const left = Math.max(MARGIN, Math.min(centred, view.width - MARGIN - tip.width));
  const below = element.bottom + GAP;
  const above = element.top - GAP - tip.height;
  let top = below;
  if (below + tip.height > view.height - MARGIN) {
    // above when it fits there, else on whichever side has more room
    top = above >= MARGIN || element.top > view.height - element.bottom ? above : below;
  }
  return { left, top: Math.max(MARGIN, Math.min(top, view.height - MARGIN - tip.height)) };
}

/**
 * the box a tooltip is placed by: the element's; a splitter's box is its pane's height, so its
 * tooltip goes at the pointer, or at its middle on keyboard focus
 * @param {{ left: number, top: number, width: number, height: number, bottom: number }} box the element's
 * @param {boolean} separator the element is a splitter
 * @param {{ x: number, y: number } | null} pointer where the pointer is, null after keyboard focus
 */
export function anchorOf(box, separator, pointer) {
  if (!separator) return box;
  const { x, y } = pointer ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  return { left: x, top: y, width: 0, bottom: y };
}

/**
 * what the tooltip says for an element: a command's words and keys, with the element's own words
 * as a second line; a splitter's own words first, since it resizes, with its command second; or the
 * element's own words, with `data-keys` for a key of its own (a field's Escape)
 * @param {{ command?: string, tip?: string, keys?: string }} data the element's dataset
 * @param {boolean} [mac]
 * @param {boolean} [own] its own words first (a splitter)
 * @returns {{ label: string, keys: string, more: string }}
 */
export function wordsOf({ command, tip, keys }, mac = MAC, own = false) {
  if (command && own && tip) return { label: tip, keys: '', more: tipLine(command, mac) };
  if (command) return { ...tipParts(command, mac), more: tip ?? '' };
  return { label: tip ?? '', keys: keys ?? '', more: '' };
}

/**
 * when the tooltip shows and goes, apart from the page: the pointer entering an element (null for
 * one without a tooltip), keyboard focus arriving or leaving, and a press, key, scroll or blur
 * @template E
 * @param {{ show: (el: E) => void, hide: () => void, later: (f: () => void, ms: number) => any, cancel: (timer: any) => void }} io
 */
export function createTips({ show, hide, later, cancel }) {
  /** @type {E | null} */
  let hovered = null;
  /** @type {E | null} */
  let shown = null;
  // how the shown one came: a hover goes when the pointer moves on, a focus stays
  let byHover = false;
  let timer = null;
  const stop = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  /** @param {E} el @param {boolean} hover */
  const put = (el, hover) => {
    shown = el;
    byHover = hover;
    show(el);
  };
  const off = () => {
    if (shown === null) return;
    shown = null;
    hide();
  };
  return {
    /** @param {E | null} el the element under the pointer that has a tooltip, null for none */
    enter(el) {
      // within the same element (onto its key): nothing new, and a press keeps it away
      if (el === hovered) return;
      hovered = el;
      stop();
      if (shown !== null && (byHover || el !== null)) off();
      if (el !== null)
        timer = later(() => {
          timer = null;
          put(el, true);
        }, REST_MS);
    },
    /** @param {E} el keyboard focus arrived */
    focus(el) {
      stop();
      put(el, false);
    },
    /** @param {E} el focus left it */
    blur(el) {
      if (shown === el) off();
    },
    // a press, a key, a scroll or the window's blur
    dismiss() {
      stop();
      off();
    },
  };
}

/**
 * the tooltip on a page: one element under body, and the listeners that show and hide it
 * @param {Window} win
 * @returns {() => void} stops listening and removes the tooltip
 */
export function listenTips(win) {
  const doc = win.document;
  const layer = doc.createElement('div');
  layer.className = 'tooltip';
  layer.id = 'tooltip';
  layer.setAttribute('role', 'tooltip');
  layer.hidden = true;
  doc.body.append(layer);
  /** @type {HTMLElement | null} */
  let owner = null;
  // where the pointer is, for a splitter's tooltip; null after keyboard focus
  /** @type {{ x: number, y: number } | null} */
  let pointer = null;
  const hide = () => {
    layer.hidden = true;
    owner?.removeAttribute('aria-describedby');
    owner = null;
  };
  /** @param {HTMLElement} el */
  const show = (el) => {
    const separator = el.getAttribute('role') === 'separator';
    const { label, keys, more } = wordsOf(el.dataset, MAC, separator);
    if (!label || !el.isConnected) return hide();
    const line = doc.createElement('div');
    line.className = 'line';
    line.append(Object.assign(doc.createElement('span'), { textContent: label }));
    if (keys) line.append(Object.assign(doc.createElement('kbd'), { textContent: keys }));
    layer.replaceChildren(line);
    if (more) layer.append(Object.assign(doc.createElement('div'), { className: 'more', textContent: more }));
    owner?.removeAttribute('aria-describedby');
    owner = el;
    el.setAttribute('aria-describedby', layer.id);
    layer.hidden = false;
    // measured at the viewport's corner, so its width does not depend on where the last one was
    layer.style.left = '0px';
    layer.style.top = '0px';
    const at = placeTip(anchorOf(el.getBoundingClientRect(), separator, pointer), layer.getBoundingClientRect(), {
      width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight,
    });
    layer.style.left = `${at.left}px`;
    layer.style.top = `${at.top}px`;
  };
  /** @type {ReturnType<typeof createTips<HTMLElement>>} */
  const tips = createTips({ show, hide, later: (f, ms) => win.setTimeout(f, ms), cancel: (t) => win.clearTimeout(t) });
  /** @param {EventTarget | null} target @returns {HTMLElement | null} */
  const tipped = (target) => /** @type {Element | null} */ (target)?.closest?.('[data-command], [data-tip]') ?? null;
  /** @param {PointerEvent} e */
  const over = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'touch') tips.enter(tipped(e.target));
  };
  /** @param {PointerEvent} e */
  const move = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
  };
  // the pointer left the page
  /** @param {PointerEvent} e */
  const out = (e) => {
    if (e.relatedTarget === null) tips.enter(null);
  };
  /** @param {FocusEvent} e */
  const focusIn = (e) => {
    const el = tipped(e.target);
    if (el && el === e.target && el.matches(':focus-visible')) {
      pointer = null;
      tips.focus(el);
    }
  };
  /** @param {FocusEvent} e */
  const focusOut = (e) => {
    const el = tipped(e.target);
    if (el) tips.blur(el);
  };
  const dismiss = () => tips.dismiss();
  const capture = { capture: true, passive: true };
  doc.addEventListener('pointerover', over);
  doc.addEventListener('pointermove', move, { passive: true });
  doc.addEventListener('pointerout', out);
  doc.addEventListener('focusin', focusIn);
  doc.addEventListener('focusout', focusOut);
  win.addEventListener('pointerdown', dismiss, capture);
  win.addEventListener('keydown', dismiss, capture);
  win.addEventListener('scroll', dismiss, capture);
  win.addEventListener('blur', dismiss);
  return () => {
    doc.removeEventListener('pointerover', over);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerout', out);
    doc.removeEventListener('focusin', focusIn);
    doc.removeEventListener('focusout', focusOut);
    win.removeEventListener('pointerdown', dismiss, capture);
    win.removeEventListener('keydown', dismiss, capture);
    win.removeEventListener('scroll', dismiss, capture);
    win.removeEventListener('blur', dismiss);
    tips.dismiss();
    layer.remove();
  };
}
