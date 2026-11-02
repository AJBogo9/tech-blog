// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's session with its server: the token, the live channel (a WebSocket that reconnects and
// says whether the server answers), the theme the host or the browser asks for, the person's
// choices known before the model loads, and what the page shares with Claude

import { parsePlace, splitToken } from './place.js';
import { latestOk } from './plots.js';
import { plain } from './api.js';
import { host } from './host.js';
import { siteSocket } from './site.js';

/**
 * a token in the address that came after the page loaded (a restarted server's URL opened in the
 * same tab), and the address to keep: the place that came with it, else `place`; null for none
 * @param {string} hash
 * @param {string} place
 */
export function lateToken(hash, place) {
  const { token, rest } = splitToken(hash);
  return token ? { token, address: rest || place } : null;
}

// the token comes in the fragment once, maybe followed by a place; this tab keeps it for reloads
// and the address keeps only the place
export function takeToken() {
  const { token: found, rest } = splitToken(location.hash);
  let token = found;
  try {
    if (token) sessionStorage.setItem('slxkit-token', token);
    else token = sessionStorage.getItem('slxkit-token');
  } catch {
    // storage blocked: the fragment's token is all there is
  }
  if (found) history.replaceState(null, '', location.pathname + location.search + rest);
  return token;
}

/**
 * a token that arrives later: kept for this tab, the address set to its place or `place`, and the
 * page loaded again with it; false when there is none
 * @param {string} place
 */
export function takeLateToken(place) {
  const late = lateToken(location.hash, place);
  if (!late) return false;
  try {
    sessionStorage.setItem('slxkit-token', late.token);
  } catch {
    // storage blocked: the page cannot keep a token across a reload; the address keeps it
    location.reload();
    return true;
  }
  history.replaceState(null, '', location.pathname + location.search + late.address);
  location.reload();
  return true;
}

// where the live channel is
export const socketUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/socket`;

/**
 * the page's live channel, one WebSocket: a browser keeps six connections to a server, and a stream
 * held by each page left the seventh waiting. A browser WebSocket cannot send headers, so the token
 * goes in the first message. It reconnects after 1 s and says whether the server answers:
 * 'connected', 'lost', or 'token' when a restarted server has a new token
 * @param {object} channel
 * @param {string} channel.url
 * @param {string | null} channel.token
 * @param {object} channel.hello what else the first message says: the model, or that this is the picker
 * @param {(event: string, data: any) => void} channel.onEvent
 * @param {(link: 'connected' | 'lost' | 'token') => void} channel.onLink
 * @param {(url: string) => any} [channel.open] makes a socket (a fake in tests); a static copy's
 *   stands in for a server's
 * @param {(f: () => void, ms: number) => void} [channel.later]
 * @returns {() => void} closes it for good
 */
export function connect({ url, token, hello, onEvent, onLink, open = host.site ? siteSocket : (u) => new WebSocket(u), later = (f, ms) => setTimeout(f, ms) }) {
  let socket = null;
  let stopped = false;
  const start = () => {
    if (stopped) return;
    socket = open(url);
    socket.onopen = () => socket.send(JSON.stringify({ token: token ?? '', ...hello }));
    socket.onmessage = (m) => {
      let message;
      try {
        message = JSON.parse(m.data);
      } catch {
        return;
      }
      if (message.event === 'open') onLink('connected');
      else onEvent(message.event, message.data);
    };
    socket.onclose = (e) => {
      if (stopped) return;
      onLink(e.code === 4001 ? 'token' : 'lost');
      later(start, 1000);
    };
  };
  start();
  return () => {
    stopped = true;
    socket.close();
  };
}

/**
 * the version, show and run events of the model this page shows, and the page events (what-if values)
 * @param {object} page
 * @param {string | null} page.token
 * @param {string | null} page.modelPath
 * @param {(status: any) => void} page.onStatus
 * @param {(link: 'connected' | 'lost' | 'token') => void} page.onLink
 * @param {(request: any) => void} page.onShow
 * @param {(run: any) => void} page.onRun
 * @param {(event: string, data: any) => void} page.onPage
 */
export function listen({ token, modelPath, onStatus, onLink, onShow, onRun, onPage }) {
  return connect({
    url: socketUrl(),
    token,
    hello: modelPath ? { model: encodeURIComponent(modelPath) } : {},
    onEvent: (event, data) => {
      if (event === 'version') onStatus(data);
      else if (event === 'show') onShow(data);
      else if (event === 'run') onRun(data);
      else onPage(event, data);
    },
    onLink,
  });
}

/**
 * the theme the page draws in: VS Code's when it says, else the browser's
 * @param {string | null} hostTheme
 * @param {boolean} prefersDark
 */
export const themeOf = (hostTheme, prefersDark) => hostTheme ?? (prefersDark ? 'dark' : 'light');

/**
 * a message from the VS Code webview: a theme to draw in, a place to go to, or nothing
 * @param {any} data
 * @param {string} hash the address now
 * @returns {{ theme: string } | { hash: string } | null}
 */
export function hostMessage(data, hash) {
  if (data.slxkit === 'theme' && (data.theme === 'dark' || data.theme === 'light')) return { theme: data.theme };
  if (data.slxkit === 'place' && parsePlace(data.hash) && hash !== data.hash) return { hash: data.hash };
  return null;
}

/**
 * the theme from the moment the page starts, so that one VS Code sends while the model loads is
 * kept: the host's messages, else the browser's colour scheme; and places the host sends
 * @param {object} page
 * @param {{ set: (patch: object) => void }} page.store
 * @param {string | null} page.hostTheme the theme in the page's URL (?theme=)
 * @param {{ matches: boolean, addEventListener: Function, removeEventListener: Function }} page.dark the browser's colour scheme
 * @param {(handler: (data: any) => void) => () => void} page.onHost host.js's
 * @param {{ dataset: Record<string, string> }} page.root the document's element, whose data-theme CSS reads
 * @param {() => string} page.hash
 * @param {(hash: string) => void} page.go
 * @returns {() => void} stops
 */
export function watchTheme({ store, hostTheme, dark, onHost, root, hash, go }) {
  const follow = () => hostTheme ?? store.set({ theme: dark.matches ? 'dark' : 'light' });
  dark.addEventListener('change', follow);
  const stop = onHost((data) => {
    const said = hostMessage(data, hash());
    if (!said) return;
    if ('theme' in said) {
      root.dataset.theme = said.theme;
      store.set({ theme: said.theme });
    } else go(said.hash);
  });
  return () => {
    dark.removeEventListener('change', follow);
    stop();
  };
}

/**
 * Follow Claude and the text twin as the person left them for this model, read before the live
 * channel opens, so that a show request that comes before the first drawing is followed as they chose
 * @param {string | null} file the model's file, from the page's first /api/model
 * @param {(key: string, fallback: any) => any} read the browser's storage
 */
export function choicesOf(file, read) {
  return {
    follow: file ? read(`slxkit:follow:${file}`, false) === true : false,
    textOn: file ? read(`slxkit:text:${file}`, false) === true : false,
  };
}

/**
 * what the person looks at, shared with Claude at most every 50 ms (MCP view_state reads it). A share the
 * person caused (`soon(true)`) updates the shared view; any other, or one from a page the person has
 * not turned to (it had no focus when it first drew, and nobody pressed, typed or focused in it
 * since), updates only this page's own view
 * @param {object} page
 * @param {{ get: () => any, set: (patch: object) => void }} page.store
 * @param {(path: string, init?: RequestInit) => Promise<Response>} page.api
 * @param {() => object} page.region the canvas's region
 * @param {string} page.name this page's name in the shared view
 * @param {() => boolean} page.ready the first drawing is done
 * @param {{ name: string, ms: number, at: number }[]} page.marks
 * @param {(f: () => void, ms: number) => any} [page.later]
 * @param {(timer: any) => void} [page.cancel]
 */
export function createShare({ store, api, region, name, ready, marks, later = (f, ms) => setTimeout(f, ms), cancel = (t) => clearTimeout(t) }) {
  let timer = null;
  let person = false;
  let turned = false;
  return {
    // the person turned to this page
    turn() {
      turned = true;
    },
    /** @param {boolean} [byPerson] */
    soon(byPerson = false) {
      person ||= byPerson && turned;
      cancel(timer);
      timer = later(() => {
        if (!ready()) return;
        const { system, selection, withheld, cursorT, runs, layout } = store.get();
        const redraw = !person;
        person = false;
        api('/api/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page: name,
            redraw,
            system,
            region: region(),
            selection,
            withheld,
            cursor: cursorT === null ? null : { t: cursorT, run: latestOk(runs)?.id ?? null },
            plotted: [...new Set(layout.flat())],
          }),
        })
          .then(() => {
            store.set({ shareError: null });
            marks.push({ name: 'shared', ms: 0, at: Date.now() });
          })
          .catch((e) => store.set({ shareError: e.status === 503 ? e.message : `${plain(e)}: Claude sees what was shared before` }));
      }, 50);
    },
  };
}

/**
 * the person turning to this page makes it the one Claude sees: focus or showing it shares at once,
 * a press or a key marks it turned to. On window in the capture phase, registered before the key
 * map, so a key press marks the page before the key's own share
 * @param {ReturnType<typeof createShare>} share
 */
export function listenTurns(share) {
  const claim = () => {
    if (document.visibilityState !== 'visible') return;
    share.turn();
    share.soon(true);
  };
  const turn = () => share.turn();
  window.addEventListener('focus', claim);
  document.addEventListener('visibilitychange', claim);
  window.addEventListener('pointerdown', turn, { capture: true });
  window.addEventListener('keydown', turn, { capture: true });
  return () => {
    window.removeEventListener('focus', claim);
    document.removeEventListener('visibilitychange', claim);
    window.removeEventListener('pointerdown', turn, { capture: true });
    window.removeEventListener('keydown', turn, { capture: true });
  };
}
