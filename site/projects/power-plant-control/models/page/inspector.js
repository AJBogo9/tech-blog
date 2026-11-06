// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the inspector: the selected block in one line, the parameters the text view lists, every other
// parameter one click away (viewing design 5.4), and a what-if row under each parameter tried (V9)

import { html, useState, useEffect } from './vendor/htm-preact.js';
import { systemPath } from './search.js';
import { WhatIfRow, keyOf, sameTarget } from './whatif.js';
import { rendered } from './marks.js';

const base = (file) => file.split(/[\\/]/).pop();
const oneLine = (text) => text.replace(/\s*\n\s*/g, ' ');

// a model name as a reference token writes it: plain when it is letters, digits, "_", "." and
// "-", else in double quotes, so "my model (v2) #1" cannot run into the "#SID" after it
const refName = (name) => (/^[\w.-]+$/.test(name) ? name : JSON.stringify(name));
// the token Claude reads as block `sid` of model `name`
export const reference = (name, sid) => `@${refName(name)}#${sid}`;

// which what-if rows show: a tried target's unless "try" hid it, another's once "try" opened it
export const NO_ROWS = { opened: [], hidden: [] };
export const rowShown = (rows, key, tried) => !rows.hidden.includes(key) && (tried || rows.opened.includes(key));

// "try" on a parameter: its targets' rows hide when all of them show, else they all show
export function toggleRows(rows, keys, shown) {
  const without = (list) => list.filter((k) => !keys.includes(k));
  return keys.every(shown)
    ? { opened: without(rows.opened), hidden: [...without(rows.hidden), ...keys] }
    : { opened: [...without(rows.opened), ...keys], hidden: without(rows.hidden) };
}

// one parameter's targets whose rows show, each target once in the block (P = Kp and I = Kp/Ti both name
// Kp: its row goes under the first); `placed` holds the keys that have a row already
export function placeRows(offered, shown, placed) {
  const out = offered.filter((t) => shown(keyOf(t)) && !placed.has(keyOf(t)));
  for (const t of out) placed.add(keyOf(t));
  return out;
}

// `copyText` is the page's clipboard helper, handed in so this module needs no browser globals to load
function Copy({ text, label = 'copy', copyText }) {
  const [done, setDone] = useState(null);
  if (!copyText) return null;
  const copy = async () => {
    setDone((await copyText(text)) ? 'copied' : 'copy failed');
    setTimeout(() => setDone(null), 1500);
  };
  return html`<button class="quiet copy" data-tip=${`Copy ${text}`} onClick=${copy}>${done ?? label}</button>`;
}

// the block: what it is in one line, the parameters the text view lists (what is set), and the
// rest one click away (viewing design 5.4); `on` holds the what-if callbacks, null for none;
// `onOpen` opens the subsystem or model the block holds, which a finger cannot double-click once
// the inspector slides over the block
export function Inspector({ model, block, whatifs = [], on = null, onOpen = null }) {
  rendered('Inspector');
  // the rows "try" opened or hid in this block
  const [rows, setRows] = useState(NO_ROWS);
  useEffect(() => setRows(NO_ROWS), [block?.sid]);
  if (!block) return html`<p class="empty">Select a block</p>`;
  const inside = block.system !== 'root' && systemPath(model.systems, block.system);
  const tried = (t) => whatifs.find((w) => sameTarget(w, t)) ?? null;
  const triedKeys = new Set(whatifs.map(keyOf));
  const toggle = (keys) => setRows((r) => toggleRows(r, keys, (k) => rowShown(r, k, triedKeys.has(k))));
  const placed = new Set();
  // the scrub's words go beside the row being dragged only
  const hintOf = (t) => (on?.hint && on.hint.key === keyOf(t) ? on.hint.text : null);
  // one parameter: the dialog's label, the file's name on hover, the value, what it evaluates to in
  // the scripts, where its variables are defined, and with `editors` its what-if rows; `marked`
  // marks the set ones among defaults
  const row = (p, marked, editors) => {
    const origins = p.origins ?? [];
    const offered = on && editors ? (p.whatif ?? []) : [];
    const main = html`<tr class=${marked && p.default === false ? 'set' : ''}>
      <th title=${p.name}>${p.label ?? p.name}</th>
      <td>
        ${p.value}${p.evaluated != null && html` <span class="evaluated">= ${p.evaluated}</span>`}${p.unit != null && ` ${p.unit}`}
        ${offered.length > 0 &&
        html`<button class="link try" data-key=${keyOf(offered[0])} data-tip="Try other values here (what-if); the model is not changed"
          onClick=${() => toggle(offered.map(keyOf))}>try</button>`}
        ${origins.length > 0 &&
        html`<small class="origin">
          ${origins.map((o) =>
            o.mask !== undefined
              ? html`<span title=${`#${o.sid}`}>${o.name}: mask of ${oneLine(o.mask)} </span>`
              : o.missing
                ? html`<span class="missing" title=${o.missing}>${o.name} has no value (${o.label ?? base(o.file)}:${o.line}) </span>`
                : html`<span title=${o.file}>${o.name}: ${o.label ?? base(o.file)}:${o.line} </span>`,
          )}
        </small>`}
      </td>
    </tr>`;
    const open = placeRows(offered, (k) => rowShown(rows, k, triedKeys.has(k)), placed);
    return [main, ...open.map((t) => html`<${WhatIfRow} key=${keyOf(t)} target=${t} whatif=${tried(t)} on=${on} hint=${hintOf(t)} />`)];
  };
  const shown = block.params.filter((p) => p.shown);
  const count = block.params.length;
  return html`
    <h2>${block.name}</h2>
    <p class="kind">
      ${block.kind}${inside && html` in <span class="name" title=${inside}>${inside}</span>`} · #${block.sid}
      <${Copy} text=${reference(model.name, block.sid)} label="copy ref" copyText=${on?.copy} />
      ${onOpen && (block.opens || block.model?.found) && html`<button class="link open" data-command="open" onClick=${onOpen}>Open</button>`}
    </p>
    ${block.sealed && html`<p class="empty">What a ${block.kind} block holds is not shown</p>`}
    ${shown.length > 0
      ? html`<table class="params shown">${shown.flatMap((p) => row(p, false, true))}</table>`
      : html`<p class="empty">Every parameter at its default</p>`}
    <details class="all">
      <summary>All parameters <span class="count">${count}</span></summary>
      <table class="params">${block.params.flatMap((p) => row(p, true, !p.shown))}</table>
    </details>
    ${block.geometry.length > 0 &&
    html`<details><summary>Geometry <span class="count">${block.geometry.length}</span></summary><table class="params">${block.geometry.flatMap((p) => row(p, true, false))}</table></details>`}
  `;
}
