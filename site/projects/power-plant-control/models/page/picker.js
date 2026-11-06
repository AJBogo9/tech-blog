// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the picker's list: which models a filter keeps, and how old each one is

// the models whose path holds every word of the query, ignoring case, in the server's order
export function pickModels(models, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return models;
  return models.filter((m) => {
    const path = m.path.toLowerCase();
    return words.every((w) => path.includes(w));
  });
}

const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// how long ago `ms` was, as a person says it; older than a week, the date
export function ago(ms, now) {
  const age = now - ms;
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (age < 7 * DAY) {
    const days = Math.floor(age / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

// a path's file name and the folder it sits in
export function split(path) {
  const at = path.lastIndexOf('/');
  return at < 0 ? { name: path, folder: '' } : { name: path.slice(at + 1), folder: path.slice(0, at) };
}
