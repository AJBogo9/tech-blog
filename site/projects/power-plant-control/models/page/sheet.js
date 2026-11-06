// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the key sheet (`?`, viewing design 5.10): every command with a key, by group, and what Escape
// closes, all read from the command list (commands.js); keys keep working while it is open

import { html, useEffect, useRef } from './vendor/htm-preact.js';
import { keySheet, tipParts } from './commands.js';

/** @param {{ keys: string[] }} props */
const Keys = ({ keys }) => html`<span class="keys">${keys.map((k, i) => html`${i > 0 && ' or '}<kbd>${k}</kbd>`)}</span>`;

/**
 * @param {{ onClose: () => void, site?: boolean, framed?: boolean }} props a static copy's sheet
 *   leaves out what needs the server; in a frame the wheel zooms with Ctrl
 */
export function Sheet({ onClose, site = false, framed = false }) {
  const box = useRef(/** @type {HTMLElement | null} */ (null));
  // a press outside closes it, and goes on to what it hit
  useEffect(() => {
    /** @param {Event} e */
    const down = (e) => {
      if (!box.current?.contains(/** @type {Node} */ (e.target))) onClose();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, []);
  const { groups, escape, search, mouse } = keySheet(undefined, { site, framed });
  return html`<section class="keysheet" role="dialog" aria-label="Keys" ref=${box}>
    <div class="keysheet-head">
      <h2>Keys</h2>
      <button class="quiet icon close" data-command="closeSheet" aria-label=${tipParts('closeSheet').label} onClick=${onClose}>×</button>
    </div>
    ${groups.map(
      (g) => html`<div class="group" key=${g.name}>
        <h3>${g.name}</h3>
        ${g.rows.map((r) => html`<div class="row" key=${r.id}><span>${r.label}</span><${Keys} keys=${r.keys} /></div>`)}
      </div>`,
    )}
    <div class="group">
      <h3>Mouse</h3>
      ${mouse.map((g) => html`<div class="row" key=${g.id}><span>${g.label}</span><${Keys} keys=${g.how} /></div>`)}
    </div>
    <div class="group">
      <h3>Escape</h3>
      <div class="row"><span>Closes the innermost of ${escape}, or clears the field being edited</span><${Keys} keys=${['Escape']} /></div>
    </div>
    <p class="every">Every command by its name: <${Keys} keys=${search} /></p>
  </section>`;
}
