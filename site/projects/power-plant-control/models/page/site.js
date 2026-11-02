// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// a static copy of the page (`slxkit export`): the files that hold the server's answers, read in
// place of its requests, and a live channel that says the one version a copy has. The copy's
// index.html marks the page with `data-site`; its site.json lists the models, each answer below
// `m/<key>/`

// the word of a refusal: what the page asked for needs `slxkit view`
export const STATIC = 'static';

/**
 * a system id or SID as the export names its file: `[A-Za-z0-9_-]` kept, every other byte of its
 * UTF-8 as `~` and two upper-case hex digits (`62:114` is `62~3A114`), as `export::file_name` writes it
 * @param {string} id
 */
export function fileName(id) {
  let out = '';
  for (const b of new TextEncoder().encode(id)) {
    const c = String.fromCharCode(b);
    out += /[A-Za-z0-9_-]/.test(c) ? c : `~${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/**
 * @typedef {{ key: string, name: string, file: string }} SiteModel
 * @typedef {{ models: SiteModel[], default: string | null }} Site what site.json holds
 */

/** @param {any} value @param {number} [status] */
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

// what the page reads that a copy answers the same way for every model: nothing changed since
// reviewed, no runs, no what-ifs, no view kept on a server
const EMPTY = {
  '/api/changes': { blocks: {}, deleted: [], systems: {}, reviewed: 1 },
  '/api/runs': [],
  '/api/whatif': { whatifs: [], asked: null },
  '/api/views': {},
};

// the answers read from files: the route's pattern, the file below `m/<key>/` for its id, and what
// a missing file means
/** @type {[RegExp, (id: string, query: URLSearchParams) => string, string][]} */
const FILES = [
  [/^\/api\/system\/(.+)$/, (id, q) => `system/${fileName(id)}.${q.get('theme') === 'dark' ? 'dark' : 'light'}.svg`, 'system'],
  [/^\/api\/readouts\/(.+)$/, (id) => `readouts/${fileName(id)}.json`, 'system'],
  [/^\/api\/text\/(.+)$/, (id) => `text/${fileName(id)}.json`, 'system'],
  [/^\/api\/block\/(.+)$/, (id) => `block/${fileName(id)}.json`, 'block'],
];

/**
 * the request function of a static copy, in place of the server's: `site` is its site.json, `model`
 * the key of the model the page shows (null for the copy's default), `read` fetches a file of the
 * copy. A file the copy lacks, and a request only `slxkit view` answers, are refused as the server
 * words a refusal, `{error, code}` with the code `static`
 * @param {{ site: Site, model: string | null, read?: (url: string, init?: RequestInit) => Promise<Response> }} copy
 * @returns {(path: string, init?: RequestInit) => Promise<Response>}
 */
export function createSiteFetch({ site, model, read = (url, init) => fetch(url, init) }) {
  const key = model ?? site.default ?? null;
  const refuse = (/** @type {number} */ status, /** @type {string} */ error) => json({ error, code: STATIC }, status);
  const file = async (/** @type {string} */ at, /** @type {string} */ missing, /** @type {RequestInit} */ init) => {
    const response = await read(`m/${encodeURIComponent(key ?? '')}/${at}`, { signal: init.signal });
    return response.ok ? response : refuse(response.status, missing);
  };
  return async (path, init = {}) => {
    const url = new URL(path, 'http://copy');
    const route = url.pathname;
    if ((init.method ?? 'GET').toUpperCase() !== 'GET') {
      // the page's view, which no server keeps for a copy
      if (route === '/api/view' || route === '/api/views') return json({});
      return refuse(405, 'This is a static copy of the model: running it and changing it need slxkit view');
    }
    if (route === '/api/models')
      return json({ root: '', default: null, models: site.models.map((m) => ({ path: m.key, name: m.name, modified: null })), partial: false });
    if (route in EMPTY) return json(EMPTY[/** @type {keyof typeof EMPTY} */ (route)]);
    if (key === null) {
      // several models and none named: the picker, as a server with no model of its own answers
      if (route === '/api/model') return json({ pick: true });
      return refuse(404, 'No model is open');
    }
    if (!site.models.some((m) => m.key === key)) return refuse(404, `No model ${key} in this copy`);
    if (route === '/api/model') return file('model.json', `No model ${key} in this copy`, init);
    if (route === '/api/index') return file('index.json', 'The search index is not in this copy', init);
    for (const [pattern, at, what] of FILES) {
      const found = pattern.exec(route);
      if (!found) continue;
      let id;
      try {
        id = decodeURIComponent(found[1]);
      } catch {
        return refuse(400, `Cannot read ${found[1]}`);
      }
      return file(at(id, url.searchParams), `No ${what} ${id} in this copy`, init);
    }
    return refuse(404, 'This is a static copy of the model: this needs slxkit view');
  };
}

/**
 * the live channel of a copy: it opens and says version 1, the only version a copy has, and never
 * closes by itself
 */
export function siteSocket() {
  /** @type {any} */
  const socket = { onopen: null, onmessage: null, onclose: null, send() {}, close() {} };
  setTimeout(() => {
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ event: 'open' }) });
    socket.onmessage?.({ data: JSON.stringify({ event: 'version', data: { version: 1, error: null, problem: null, live: null } }) });
  }, 0);
  return socket;
}

/**
 * the copy's site.json, read beside its index.html
 * @param {(url: string) => Promise<Response>} [read]
 * @returns {Promise<Site>}
 */
export async function readSite(read = (url) => fetch(url)) {
  const response = await read('site.json');
  if (!response.ok) throw new Error(`site.json: ${response.status}`);
  const site = await response.json();
  if (!Array.isArray(site?.models)) throw new Error('site.json lists no models');
  return { models: site.models, default: typeof site.default === 'string' ? site.default : null };
}
