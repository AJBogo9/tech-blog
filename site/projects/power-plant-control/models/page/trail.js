// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's own back and forward inside VS Code: a VS Code window of its own (Move Editor into New
// Window) is an about:blank page that keeps no browser history for the frames inside it, so
// history.back() does nothing there. The places the page went to, in order, and the one it shows

/** @typedef {{ places: string[], at: number }} Trail */

// the places kept, as many as Chromium keeps in a tab's history
export const TRAIL_MAX = 50;

/**
 * @param {string} hash the address the page starts at
 * @returns {Trail}
 */
export const startTrail = (hash) => ({ places: [hash], at: 0 });

/**
 * a new place: the places ahead of the one shown go, and the oldest past TRAIL_MAX
 * @param {Trail} trail
 * @param {string} hash
 * @returns {Trail}
 */
export function pushPlace(trail, hash) {
  const places = [...trail.places.slice(0, trail.at + 1), hash].slice(-TRAIL_MAX);
  return { places, at: places.length - 1 };
}

/**
 * the place shown, written again
 * @param {Trail} trail
 * @param {string} hash
 * @returns {Trail}
 */
export const replacePlace = (trail, hash) => ({ places: trail.places.with(trail.at, hash), at: trail.at });

/**
 * one place back (-1) or forward (1); null at either end
 * @param {Trail} trail
 * @param {number} step
 * @returns {Trail | null}
 */
export function stepPlace(trail, step) {
  const at = trail.at + step;
  return at >= 0 && at < trail.places.length ? { places: trail.places, at } : null;
}

/**
 * a trail kept as JSON, read back; null for none or a damaged one
 * @param {string | null} text
 * @returns {Trail | null}
 */
export function readTrail(text) {
  try {
    const t = JSON.parse(text ?? '');
    const fine =
      Array.isArray(t?.places) && t.places.length > 0 && t.places.every((p) => typeof p === 'string') && Number.isInteger(t.at) && t.at >= 0 && t.at < t.places.length;
    return fine ? { places: t.places, at: t.at } : null;
  } catch {
    return null;
  }
}
