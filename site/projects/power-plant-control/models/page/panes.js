// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the side panels of a page (outline left, inspector right): the person's choice for this model at
// this width, which slide in now and why, and whether the page is narrow. panels.js holds the rules;
// these are the page's acts on them

import { NARROW, paneMode, pinned, prefKey, toggled } from './panels.js';
import { NO_PANES, storage } from './state.js';

const NO_SLIDES = { outline: null, inspector: null };

/**
 * each panel's mode now: 'docked', 'over' (slid in over the canvas) or 'edge'
 * @param {{ panes: Record<string, string>, narrow: boolean, slides: { outline: string | null, inspector: string | null } }} state
 */
export function modes({ panes, narrow, slides }) {
  return {
    outline: paneMode(panes[prefKey('outline', narrow)], narrow, slides.outline),
    inspector: paneMode(panes[prefKey('inspector', narrow)], narrow, slides.inspector),
  };
}

/**
 * a panel is over the canvas now (a docked panel's slide is unseen and no layer of the key map)
 * @param {{ panes: Record<string, string>, narrow: boolean, slides: { outline: string | null, inspector: string | null } }} state
 */
export function over(state) {
  const m = modes(state);
  return m.outline === 'over' || m.inspector === 'over';
}

/**
 * a page's side panels
 * @param {object} page
 * @param {{ get: () => any, set: (patch: any) => void }} page.store
 * @param {(parts: object) => void} page.keepView the server keeps the view for the next time
 */
export function createPanes({ store, keepView }) {
  // why a panel slides in: 'auto' when the page brought it (a block selected), 'asked' when the person did
  function slide(side, why) {
    store.set((s) => (s.slides[side] === why ? null : { slides: { ...s.slides, [side]: why } }));
  }
  // a side panel the person showed or hid, kept per model by this browser and by the server
  function choose(side, pref) {
    const { panes, narrow, model } = store.get();
    const key = prefKey(side, narrow);
    if (panes[key] === pref) return;
    const next = { ...panes, [key]: pref };
    store.set({ panes: next });
    if (model?.file) storage.set(`slxkit:panes:${model.file}`, next);
    keepView({ [key]: pref });
  }
  // slides in unless it slid in already
  function slideIn(side) {
    store.set((s) => (s.slides[side] ? null : { slides: { ...s.slides, [side]: 'auto' } }));
  }
  return {
    slide,
    slideIn,
    // the arrow, a double-click on the divider, O or I
    toggle(side) {
      const { panes, narrow, slides } = store.get();
      const next = toggled(panes[prefKey(side, narrow)], narrow, slides[side]);
      choose(side, next.pref);
      slide(side, next.slide);
    },
    // a narrow page's pin on a panel that slid in, or on one pinned beside the canvas
    pin(side, on) {
      const next = pinned(on);
      choose(side, next.pref);
      slide(side, next.slide);
    },
    // Escape: whatever slid in goes, and nothing is kept
    putAway() {
      store.set({ slides: NO_SLIDES });
    },
    // a click on the canvas puts the outline away; on a block it slides the inspector in, also when
    // that block was selected already; on paper it puts the inspector away
    clicked(onBlock) {
      store.set((s) => ({ slides: { outline: null, inspector: onBlock ? (s.slides.inspector ?? 'auto') : null } }));
    },
    // the selection changed: blocks slide the inspector in, none takes the page's own slide away
    selected(any) {
      if (any) slideIn('inspector');
      else store.set((s) => (s.slides.inspector === 'auto' ? { slides: { ...s.slides, inspector: null } } : null));
    },
    // the page's width sets the automatic rule; crossing it puts what slid in away
    /** @param {number} width */
    resized(width) {
      const narrow = width < NARROW;
      if (narrow !== store.get().narrow) store.set({ narrow, slides: NO_SLIDES });
    },
    // the window's width counts at once and on each resize; returns the stop function
    /** @param {{ innerWidth: number, addEventListener: Function, removeEventListener: Function }} win */
    watch(win) {
      const resized = () => this.resized(win.innerWidth);
      resized();
      win.addEventListener('resize', resized);
      return () => win.removeEventListener('resize', resized);
    },
    // a model's panels as this browser kept them, until the server's view says otherwise
    /** @param {string} file */
    load(file) {
      store.set({ panes: { ...NO_PANES, ...storage.get(`slxkit:panes:${file}`, {}) }, slides: NO_SLIDES });
    },
  };
}
