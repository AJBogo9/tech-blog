// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// where the page runs: inside a VS Code editor tab (`?host=vscode`), whose webview holds it in a
// frame, sends the colour theme and places to open, and writes what the page copies; as a static
// copy (`slxkit export`), whose index.html marks it with `data-site`; inside a frame of another
// page, such as a website's iframe

// read through globalThis so that a node test can import the page's modules
const here = globalThis.location;
const params = new URLSearchParams(here?.search ?? '');
const asked = params.get('theme');
const inFrame = globalThis.window !== undefined && window.parent !== window;
const vscode = params.get('host') === 'vscode' && inFrame;

export const host = {
  embedded: vscode,
  // a static copy: no server, so nothing runs and nothing is shared
  site: globalThis.document?.documentElement?.hasAttribute('data-site') ?? false,
  // a frame of a page that scrolls past it: the wheel and one finger scroll that page
  framed: inFrame && !vscode,
  theme: asked === 'dark' || asked === 'light' ? asked : null,
};
// the webview's origin, where copies go and the only one listened to
const parentOrigin = here?.ancestorOrigins?.[0] ?? null;

// put `text` on the clipboard: the browser's, or in VS Code the extension's, since a frame in a
// webview may not write it; false when neither can
export async function copyText(text) {
  if (host.embedded) {
    window.parent.postMessage({ slxkit: 'copy', text: String(text) }, parentOrigin ?? '*');
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// the webview's theme and place messages, from the parent window only
export function onHost(handler) {
  if (!host.embedded) return () => {};
  const listen = (e) => {
    if (e.source !== window.parent || (parentOrigin && e.origin !== parentOrigin)) return;
    const data = e.data;
    if (data && (data.slxkit === 'theme' || data.slxkit === 'place')) handler(data);
  };
  window.addEventListener('message', listen);
  return () => window.removeEventListener('message', listen);
}
