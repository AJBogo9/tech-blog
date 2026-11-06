// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's timing marks, which the page checks read as window.slxkit.marks (tools/page/check.py):
// an array that keeps its last `cap` entries, so a page open for days does not grow it without end

/** @typedef {{ name: string, ms: number, at: number }} Mark */

/** @returns {Mark[]} */
export function createMarks(cap = 500) {
  /** @type {Mark[]} */
  const marks = [];
  // not enumerable, so the marks list only their entries
  Object.defineProperty(marks, 'push', {
    value: (/** @type {Mark[]} */ ...added) => {
      Array.prototype.push.apply(marks, added);
      if (marks.length > cap) marks.splice(0, marks.length - cap);
      return marks.length;
    },
  });
  return marks;
}

// how often each component rendered, which the page checks read as window.slxkit.renders: a hover
// renders only what shows it
/** @type {Record<string, number>} */
export const renders = {};

/** @param {string} name */
export function rendered(name) {
  renders[name] = (renders[name] ?? 0) + 1;
}
