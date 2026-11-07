// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the side panels (outline left, inspector right), free of the DOM. A panel is docked beside the
// canvas, a thin edge, or slides in over the canvas's edge without moving it. `pref` is what the
// person chose for this model at this width (a wide page and a narrow one each keep their own):
// 'auto' (nothing), 'hidden', or 'shown' (on a narrow page: pinned beside the canvas). `slide` says
// why a panel slides in: 'auto' when the page brought it (a block selected), 'asked' when the
// person did.

// below this page width a panel the person left alone is an edge that slides in when wanted
export const NARROW = 1100;

export function paneMode(pref, narrow, slide) {
  if (pref === 'shown' || (pref !== 'hidden' && !narrow)) return 'docked';
  // a panel the person hid slides in only when they ask for it
  if (slide === 'asked' || (slide === 'auto' && pref !== 'hidden')) return 'over';
  return 'edge';
}

// the key a choice is kept under for this width: a choice at one width never changes the other
export function prefKey(side, narrow) {
  return narrow ? `${side}_narrow` : side;
}

// the arrow, a double-click on the divider, or the key: a panel in view is hidden and that is kept,
// so a hidden inspector no longer slides in on a narrow page (Escape or a click on paper put it
// away once and keep nothing); a hidden panel shown again follows the automatic rule, sliding in
// at once on a narrow page
export function toggled(pref, narrow, slide) {
  if (paneMode(pref, narrow, slide) !== 'edge') return { pref: 'hidden', slide: null };
  return narrow ? { pref: 'auto', slide: 'asked' } : { pref: 'auto', slide: null };
}

// a narrow page's pin: a slid-in panel docks beside the canvas, which gets narrower; unpinned, it
// slides over the canvas again
export function pinned(pin) {
  return pin ? { pref: 'shown', slide: null } : { pref: 'auto', slide: 'asked' };
}
