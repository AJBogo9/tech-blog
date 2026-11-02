// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's requests to its server: the token and the model in headers, errors as the server
// words them (`{error, code}` with the status kept), one hook for a request that belongs to an
// effect, and the two error sinks

import { useEffect, useState } from './vendor/htm-preact.js';

// a request the server refused, or one it never answered (status 0)
export class ApiError extends Error {
  /**
   * @param {number} status the HTTP status, 0 when the server did not answer
   * @param {string} code the server's word for the error, '' when it gave none
   * @param {string} message the sentence the page shows
   * @param {any} [data] the whole JSON body, when there is one
   */
  constructor(status, code, message, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const UNREACHABLE = 'slxkit view does not answer';

/**
 * the error a refused answer carries: the server's `{error, code}`, or its text as it is (a test
 * that fakes the answer, a proxy)
 * @param {number} status
 * @param {string} text
 */
export function errorOf(status, text) {
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: the text is the sentence
  }
  if (body && typeof body.error === 'string') return new ApiError(status, typeof body.code === 'string' ? body.code : '', body.error, body);
  return new ApiError(status, '', text, body);
}

/** @param {any} e */
export const isAbort = (e) => e?.name === 'AbortError';

// a failed request in words: the server's own, or that it does not answer
/** @param {unknown} e */
export const plain = (e) => (e instanceof ApiError ? e.message : UNREACHABLE);

/**
 * the page's request function: the token and the model it shows in headers, never cached
 * @param {{ token: string | null, modelPath: string | null, fetch?: typeof fetch }} options
 * @returns {(path: string, init?: RequestInit) => Promise<Response>}
 */
export function createApi({ token, modelPath, fetch: send = (path, init) => fetch(path, init) }) {
  return async (path, init = {}) => {
    let response;
    try {
      response = await send(path, {
        ...init,
        headers: {
          'X-Slxkit-Token': token ?? '',
          ...(modelPath ? { 'X-Slxkit-Model': encodeURIComponent(modelPath) } : {}),
          ...(init.headers ?? {}),
        },
        cache: 'no-store',
      });
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ApiError(0, 'unreachable', UNREACHABLE);
    }
    if (!response.ok) throw errorOf(response.status, await response.text());
    return response;
  };
}

// the page's own, set by start() once it has read the token and the model from the address
let current = createApi({ token: null, modelPath: null });

/** @param {{ token: string | null, modelPath: string | null, fetch?: typeof fetch }} options */
export function configureApi(options) {
  current = createApi(options);
}

/** @type {(path: string, init?: RequestInit) => Promise<Response>} */
export const api = (path, init) => current(path, init);

/**
 * the error sink of an action the person took: a notice that says what failed and why, in the
 * server's words; a request the page dropped (aborted) says nothing
 * @param {(text: string) => void} say
 * @param {string} what "Cannot stop the run"
 * @returns {(e: unknown) => void}
 */
export const failed = (say, what) => (e) => {
  if (!isAbort(e)) say(`${what}: ${plain(e)}`);
};

/**
 * the error sink of a request the page made by itself (a list read again, the view kept): the
 * console only, since the top bar already says when the server does not answer
 * @param {string} what "reading the runs"
 * @returns {(e: unknown) => void}
 */
export const quiet = (what) => (e) => {
  if (!isAbort(e)) console.warn(`slxkit: ${what}: ${plain(e)}`);
};

/**
 * @typedef {object} RequestOptions
 * @property {RequestInit} [init] the method, headers and body
 * @property {'json' | 'text'} [read] how the answer is read
 * @property {number} [delay] ms to wait before sending; a change within it sends nothing
 * @property {() => void} [onSend] the request goes out (after the delay)
 */

/**
 * one request of an effect: sent at once or after `delay`, aborted by the function returned;
 * `done(error, data, ms)` is called unless it was aborted, `ms` counted from the call. As in the
 * page's effects before, an exception thrown by `done` with the data comes back to it as the error
 * @param {(path: string, init?: RequestInit) => Promise<Response>} fetcher
 * @param {string} path
 * @param {RequestOptions} options
 * @param {(error: any, data: any, ms: number) => void} done
 * @param {() => number} [now]
 * @returns {() => void}
 */
export function request(fetcher, path, { init = {}, read = 'json', delay = 0, onSend } = {}, done, now = () => performance.now()) {
  const controller = new AbortController();
  const start = now();
  const send = () => {
    onSend?.();
    fetcher(path, { ...init, signal: controller.signal })
      .then((r) => r[read]())
      .then((data) => controller.signal.aborted || done(null, data, now() - start))
      .catch((error) => controller.signal.aborted || isAbort(error) || done(error, null, now() - start));
  };
  const timer = delay > 0 ? setTimeout(send, delay) : null;
  if (delay <= 0) send();
  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}

const NOTHING = { data: null, error: null };

/**
 * a request that belongs to a component: sent when `deps` change, aborted when they change again
 * or the component goes. `path` null sends nothing. The hook holds the answer (`hold`, the
 * default): the last answer stays while a new request is out, a refusal clears it unless `keep`,
 * and a null path clears it; `onData` and `onError` hear the current request only
 * @param {string | null} path
 * @param {readonly unknown[]} deps
 * @param {RequestOptions & { hold?: boolean, keep?: boolean, onData?: (data: any, ms: number) => void, onError?: (error: any) => void }} [options]
 * @returns {{ data: any, error: any }}
 */
export function useApi(path, deps, { hold = true, keep = false, onData, onError, ...options } = {}) {
  const [held, setHeld] = useState(NOTHING);
  useEffect(() => {
    if (path === null) {
      if (hold) setHeld(NOTHING);
      return undefined;
    }
    return request(api, path, options, (error, data, ms) => {
      if (error) {
        if (hold) setHeld((h) => ({ data: keep ? h.data : null, error }));
        onError?.(error);
      } else {
        if (hold) setHeld({ data, error: null });
        onData?.(data, ms);
      }
    });
  }, deps);
  return held;
}
