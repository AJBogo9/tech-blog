// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// search over the page's index (viewing design 5.3): block names, types and library names,
// variables, values, signal names and notes as literal text, with case and runs of whitespace
// ignored; the page's commands by the start of their label, the starts of its words or its letters
// in order; one result per block, ranked, every match unless `limit` is given

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const oneLine = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ');
// a name or value longer than this many characters is cut in the list, whole in its title
const SHOWN = 60;
const cut = (text) => {
  const chars = [...text];
  return chars.length > SHOWN ? `${chars.slice(0, SHOWN - 1).join('')}…` : text;
};
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** @type {(value: unknown) => string[]} */
const identifiers = (value) => String(value).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];

// where a system lies, as the breadcrumbs read it: the names below the model, each on one
// line, joined by "/" (a "/" in a name stays one "/", not the "//" of a block path)
export function systemPath(systems, id, byId = new Map(systems.map((s) => [s.id, s]))) {
  const names = [];
  for (let s = byId.get(id); s && s.parent != null && names.length < systems.length; s = byId.get(s.parent))
    names.unshift(oneLine(s.name));
  return names.join('/');
}

// an index read for searching once: each block's, signal's and note's normalised text, the
// identifiers its parameters use, its one-line label and its system's crumbs; kept per index while
// its systems stay the same (a new version fetches a new index, so this is once per version)
const prepared = new WeakMap();

export function prepare(index, systems) {
  const kept = prepared.get(index);
  if (kept?.systems === systems) return kept;
  const byId = new Map(systems.map((s) => [s.id, s]));
  const paths = new Map(systems.map((s) => [s.id, systemPath(systems, s.id, byId)]));
  const crumbs = (system) => paths.get(system) ?? '';
  const shown = (text, system) => ({ label: cut(oneLine(text)), title: oneLine(text), crumbs: crumbs(system) });
  const ready = {
    systems,
    blocks: (index.blocks ?? []).map((b) => ({
      b,
      name: normalize(b.name),
      type: normalize(b.type),
      kind: normalize(b.kind),
      params: (b.params ?? []).map((p) => ({ p, value: normalize(p.value), names: identifiers(p.value) })),
      ...shown(b.name, b.system),
    })),
    signals: (index.signals ?? []).map((s) => ({ s, name: normalize(s.name), ...shown(s.name, s.system) })),
    annotations: (index.annotations ?? []).map((a) => ({ a, text: normalize(a.text), ...shown(a.text, a.system) })),
  };
  prepared.set(index, ready);
  return ready;
}

// a text's words, without the punctuation around them ("plots'" is "plots")
const wordsOf = (text) =>
  normalize(text)
    .split(' ')
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
// words that match no word of a label: "the" is in most of them
const FUNCTION_WORDS = new Set(['the', 'a', 'an', 'to', 'or', 'of', 'for', 'and', 'in', 'on', 'with']);
const contentWords = (words) => words.filter((w) => !FUNCTION_WORDS.has(w));
// each of `query` starts one of `words`, in order
function inOrder(query, words) {
  let at = 0;
  for (const q of query) {
    while (at < words.length && !words[at].startsWith(q)) at++;
    if (at === words.length) return false;
    at++;
  }
  return true;
}
// the letters of `letters` in order inside one word, starting with its first letter
function fuzzy(letters, words) {
  return words.some((w) => {
    if (w[0] !== letters[0]) return false;
    let i = 1;
    for (let j = 1; j < w.length && i < letters.length; j++) if (w[j] === letters[i]) i++;
    return i === letters.length;
  });
}
// how well a command matches, as a rank among search's: its label starting with the query 1.5, a
// synonym 1.55; every word of the query starting one of the label's, in order, 1.6, of a synonym's
// 1.65; any of these under 3 characters 7; the query's letters in order inside one word, from its
// first letter, 7.5 in the label and 7.55 in a synonym; null for none. Function words count only
// in a label's or a synonym's start
export function commandRank(command, query) {
  const q = normalize(query);
  if (wordsOf(query).length === 0) return null;
  const synonyms = command.synonyms ?? [];
  const short = (rank) => (q.length < 3 ? 7 : rank);
  if (normalize(command.label).startsWith(q)) return short(1.5);
  if (synonyms.some((s) => normalize(s).startsWith(q))) return short(1.55);
  const words = contentWords(wordsOf(query));
  if (words.length === 0) return null;
  const label = contentWords(wordsOf(command.label));
  const others = synonyms.map((s) => contentWords(wordsOf(s)));
  if (inOrder(words, label)) return short(1.6);
  if (others.some((s) => inOrder(words, s))) return short(1.65);
  const letters = words.join('');
  if (letters.length < 3) return null;
  if (fuzzy(letters, label)) return 7.5;
  if (others.some((s) => fuzzy(letters, s))) return 7.55;
  return null;
}

// how well a block's name, type or library name match, all normalized: the best of the name equal
// to the query 0, starting with it 1, holding it 1.3; the type or library name starting with it 1.4,
// holding it 3; null for none
export function blockRank(name, type, kind, q) {
  const at = name.indexOf(q);
  if (at >= 0) return { kind: 'block', rank: name === q ? 0 : at === 0 ? 1 : 1.3 };
  if (type.startsWith(q) || kind.startsWith(q)) return { kind: 'type', rank: 1.4 };
  if (type.includes(q) || kind.includes(q)) return { kind: 'type', rank: 3 };
  return null;
}

// a block as blockRank says; a signal 2; a variable a parameter uses 4; a value holding the query 5;
// a note 6; a command as commandRank says (search finds the model first: a command ranks below the
// names that hold the query and the types that start with it)
export function search(index, systems, query, commands = [], limit = Infinity) {
  const q = normalize(query);
  if (!q) return [];
  const raw = String(query).trim();
  const variable = IDENTIFIER.test(raw) ? raw : null;
  const ready = prepare(index, systems);
  const out = [];
  for (const { b, name, type, kind, params, label, title, crumbs } of ready.blocks) {
    const ranked = blockRank(name, type, kind, q);
    let hit = null;
    if (ranked) hit = { ...ranked, detail: b.kind };
    else {
      const used = variable && params.find((p) => p.names.includes(variable));
      const p = (used || params.find((p) => p.value.includes(q)))?.p;
      if (p) hit = { kind: used ? 'variable' : 'value', rank: used ? 4 : 5, detail: cut(`${p.label ?? p.name} = ${oneLine(p.value)}`) };
    }
    if (hit) out.push({ ...hit, sid: b.sid, system: b.system, label, title, crumbs });
  }
  for (const { s, name, label, title, crumbs } of ready.signals) {
    if (name.includes(q))
      out.push({ kind: 'signal', rank: 2, sid: s.src, system: s.system, label, title, detail: 'signal', crumbs });
  }
  for (const { a, text, label, title, crumbs } of ready.annotations) {
    if (text.includes(q))
      out.push({ kind: 'annotation', rank: 6, sid: a.sid, system: a.system, label, title, detail: 'note', crumbs });
  }
  for (const c of commands) {
    const rank = commandRank(c, query);
    if (rank !== null) out.push({ kind: 'command', rank, id: c.id, label: c.label, detail: 'command', key: c.key ?? '', crumbs: '' });
  }
  out.sort((a, b) => a.rank - b.rank || a.crumbs.localeCompare(b.crumbs) || a.label.localeCompare(b.label));
  return out.slice(0, limit);
}

// a result row's id, which the active row is kept by while rows come and go (a signal and its
// source block are two rows)
export const rowId = (r) => `${r.kind}:${r.system ?? ''}:${r.sid ?? r.id}:${r.label}`;
// the active row's place in `results`: the row of `id`, else the first
export function activeAt(results, id) {
  const at = id === null ? -1 : results.findIndex((r) => rowId(r) === id);
  return Math.max(0, at);
}
// the id of the row `step` rows from the active one, within the list; null for no rows
export function stepActive(results, id, step) {
  if (results.length === 0) return null;
  const at = Math.max(0, Math.min(results.length - 1, activeAt(results, id) + step));
  return rowId(results[at]);
}

// what stays undimmed on the canvas while a search runs: every block, note and signal source of
// `system` that matched
export function matchedIn(results, system) {
  return results.filter((r) => r.kind !== 'command' && r.system === system && r.sid).map((r) => r.sid);
}
