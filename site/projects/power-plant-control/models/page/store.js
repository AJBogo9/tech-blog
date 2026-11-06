// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// a small store (design 6.1): one value, its listeners, and a hook that renders a component again
// only when the part it reads changes. Callbacks registered once (the socket, the canvas, the
// gestures, the keys) read the value of now with get(), so they need no mirror refs

import { useLayoutEffect, useReducer, useRef } from './vendor/htm-preact.js';

/**
 * @template S
 * @typedef {object} Store
 * @property {() => S} get the value now
 * @property {(patch: Partial<S> | ((state: S) => Partial<S> | null)) => void} set merge a patch, or what a function of the value now returns; listeners hear of a change only
 * @property {(listener: (state: S) => void) => () => void} subscribe the function returned unsubscribes
 */

/**
 * @template S
 * @param {S} initial
 * @returns {Store<S>}
 */
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      if (!next || Object.keys(next).every((k) => Object.is(state[k], next[k]))) return;
      state = { ...state, ...next };
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * the same for a render: one value, or arrays or plain objects whose entries are the same values
 * @param {any} a
 * @param {any} b
 */
export function same(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
}

/**
 * the part of a store's value a component reads; it renders again when that part changes
 * @template S, T
 * @param {Store<S>} store
 * @param {(state: S) => T} select
 * @returns {T}
 */
export function useSelector(store, select) {
  const [, rendered] = useReducer((n) => n + 1, 0);
  const picked = select(store.get());
  const last = useRef(picked);
  last.current = picked;
  const selector = useRef(select);
  selector.current = select;
  useLayoutEffect(() => {
    const check = (state) => {
      if (!same(selector.current(state), last.current)) rendered(0);
    };
    const stop = store.subscribe(check);
    // a change between the render and this subscription
    check(store.get());
    return stop;
  }, [store]);
  return picked;
}
