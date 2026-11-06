// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// a splitter (page design 3.4): the 1 px rule between two panes, with an 8 px hit area. A drag or a
// key sizes the pane on its side: an arrow by 8 px, Shift by 64, Home and End to the bounds; a
// double-click hides the pane where the page lets it

import { html, useLayoutEffect, useRef } from './vendor/htm-preact.js';

/** @typedef {'left' | 'right' | 'bottom'} Side where the pane sits against its rule */

// the arrow that moves the rule away from its pane grows the pane
const GROWS = { left: 'ArrowRight', right: 'ArrowLeft', bottom: 'ArrowUp' };
const SHRINKS = { left: 'ArrowLeft', right: 'ArrowRight', bottom: 'ArrowDown' };

/**
 * the size a key gives the pane, within its bounds; null for a key the splitter leaves alone
 * @param {string} key
 * @param {boolean} shift
 * @param {{ side: Side, value: number, min: number, max: number }} at
 * @returns {number | null}
 */
export function stepSize(key, shift, { side, value, min, max }) {
  if (key === 'Home') return min;
  if (key === 'End') return max;
  const sign = key === GROWS[side] ? 1 : key === SHRINKS[side] ? -1 : 0;
  if (sign === 0) return null;
  // from within the bounds: a size kept in a wider window may lie past them
  const from = Math.max(min, Math.min(max, value));
  return Math.max(min, Math.min(max, from + sign * (shift ? 64 : 8)));
}

/**
 * @param {{ side: Side, label: string, tip: string, command?: string, size: () => number, bounds: () => [number, number],
 *   onSize: (px: number) => void, onDone?: () => void, onToggle?: () => void }} props
 *   the pane's size now and its bounds, read when needed; a size to show; a drag or key done, to keep it
 */
export function Splitter({ side, label, tip, command, size, bounds, onSize, onDone, onToggle }) {
  const element = useRef(/** @type {HTMLElement | null} */ (null));
  // the value as the page shows it, written here so that a drag renders nothing
  const show = (/** @type {number} */ px) => {
    const [min, max] = bounds();
    const e = element.current;
    if (!e) return;
    e.setAttribute('aria-valuemin', String(min));
    e.setAttribute('aria-valuemax', String(max));
    e.setAttribute('aria-valuenow', String(Math.round(px)));
  };
  useLayoutEffect(() => show(size()));
  const set = (/** @type {number} */ px) => {
    const [min, max] = bounds();
    const v = Math.round(Math.max(min, Math.min(max, px)));
    onSize(v);
    show(v);
  };

  /** @param {PointerEvent} e */
  const down = (e) => {
    if (e.button !== 0) return;
    const bar = /** @type {HTMLElement} */ (e.currentTarget);
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('active');
    const at = (/** @type {PointerEvent} */ p) => (side === 'bottom' ? p.clientY : p.clientX);
    // from the size at the press, so a press beside the rule does not jump
    const from = at(e);
    const was = size();
    const sign = side === 'left' ? 1 : -1;
    const move = (/** @type {PointerEvent} */ m) => set(was + sign * (at(m) - from));
    const up = () => {
      bar.classList.remove('active');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      onDone?.();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };
  /** @param {KeyboardEvent} e */
  const key = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const [min, max] = bounds();
    const next = stepSize(e.key, e.shiftKey, { side, value: size(), min, max });
    if (next === null) return;
    e.preventDefault();
    set(next);
    onDone?.();
  };
  return html`<div ref=${element} class=${`split ${side}`} role="separator" tabindex="0" aria-label=${label}
    aria-orientation=${side === 'bottom' ? 'horizontal' : 'vertical'} data-command=${command} data-tip=${tip}
    onPointerDown=${down} onKeyDown=${key} onDblClick=${onToggle} onFocus=${() => show(size())}></div>`;
}
