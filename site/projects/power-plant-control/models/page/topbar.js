// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the top bar (design 4.1): on the left the mark, the crumbs and the status (the file's state, the
// scripts' problems, the changes since reviewed), each a dot and a word with the rest on hover; on
// the right the Claude control and Run in fixed slots, so a selection or a run moves nothing there

import { html } from './vendor/htm-preact.js';
import { keysOf, short, tipParts } from './commands.js';
import { Menu } from './menu.js';

/** @param {string} text */
export const oneLine = (text) => text.replace(/\s*\n\s*/g, ' ');
/** @param {string} file */
const base = (file) => file.split(/[\\/]/).pop() ?? file;
// the problems the tooltip lists; the log lists them all
const TIP_LINES = 20;

/**
 * @typedef {object} Status
 * @property {string} word what it is, one short phrase
 * @property {'' | 'warn' | 'bad'} tone its dot's colour, and the word's where it is bad
 * @property {string} tip the rest, on hover
 */

/**
 * the file's state: saved, Claude's unsaved edits, or what went wrong, and what the canvas shows
 * instead; a stale or ended Claude session can be put away (`dismiss`) until its state changes
 * @param {{ link: string, status: any, putAway: string | null }} page
 * @returns {Status & { dismiss: string | null }}
 */
export function fileState({ link, status, putAway }) {
  const live = status?.live;
  const say = (/** @type {string} */ word, /** @type {Status['tone']} */ tone, /** @type {string[]} */ tip, dismiss = null) => ({
    word,
    tone,
    tip: tip.filter(Boolean).join('\n'),
    dismiss,
  });
  if (link === 'token') return say('Server restarted', 'bad', ['slxkit view started again with a new token: open the URL it printed, here in this tab']);
  if (link === 'lost')
    return say('Not connected', 'bad', ['Showing the last version. slxkit view does not answer: if it started again, open the URL it printed, here in this tab']);
  if (status?.error) {
    const lost = status.problem === 'gone' || status.problem === 'unreadable';
    const shown = live && !live.stale && !live.orphan ? "Claude's unsaved edits" : lost ? 'the last version' : 'the last good version';
    const word = status.problem === 'gone' ? 'File gone' : status.problem === 'unreadable' ? 'File unreadable' : 'File damaged';
    return say(word, 'bad', [`Showing ${shown}`, status.error]);
  }
  const key = live?.orphan || live?.stale ? JSON.stringify(live) : null;
  if (live && !(key && key === putAway)) {
    const batches = (live.batches ?? []).map((/** @type {{ label: string, why?: string }} */ b) => (b.why ? `${b.label}: ${b.why}` : b.label));
    if (live.orphan) return say("Claude's session ended", 'warn', ["Claude's session ended with unsaved edits", ...batches], key);
    if (live.stale) return say('File changed outside', 'warn', ["Claude's edits started from an older file", ...batches], key);
    const n = batches.length;
    return say(`Claude: ${n} unsaved edit${n === 1 ? '' : 's'}`, 'warn', ["Claude's edits, one per edit call, not saved to the file yet", ...batches]);
  }
  return say('Saved', '', ['The model as its file holds it']);
}

/**
 * the scripts' lines that did not run and the project file's errors as one count; the tooltip says
 * how many lines each script did not run and the first problems, the log lists them all; null when
 * every script ran
 * @param {any[] | undefined} scripts the outline's script status
 * @returns {(Status & { count: number, lines: string[], bad: boolean }) | null}
 */
export function scriptProblems(scripts) {
  const lines = [];
  const parts = [];
  let bad = false;
  for (const s of scripts ?? []) {
    for (const p of s.project ?? []) {
      lines.push(`${base(s.file)}: ${p.message} (line ${p.line})`);
      bad = true;
    }
    const failed = s.failed ?? [];
    const skipped = s.skipped ?? [];
    if (!s.error && failed.length === 0 && skipped.length === 0) continue;
    const name = s.label || base(s.file);
    bad ||= !!s.error;
    if (s.unreadable) {
      lines.push(`${name}: ${s.error.message}`);
      parts.push(`${name}: cannot read it`);
      continue;
    }
    if (s.error) lines.push(`${name}:${s.error.line}:${s.error.col}: ${s.error.message}; the rest did not run`);
    for (const f of failed) lines.push(`${name}:${f.line}:${f.col}: ${f.message}; ${f.name} has no value`);
    if (skipped.length > 0)
      lines.push(`${name}: line${skipped.length === 1 ? '' : 's'} ${skipped.join(', ')} skipped, ${skipped.length === 1 ? 'it assigns' : 'they assign'} nothing`);
    // the server counts every line an error stopped
    const count = s.not_run?.length ?? new Set([...failed.map((/** @type {{ line: number }} */ f) => f.line), ...skipped]).size + (s.error ? 1 : 0);
    parts.push(`${name}: ${count} line${count === 1 ? '' : 's'} not run`);
  }
  if (lines.length === 0) return null;
  const more = lines.length > TIP_LINES ? [`and ${lines.length - TIP_LINES} more`] : [];
  const tip = [parts.join(', '), ...lines.slice(0, TIP_LINES), ...more].filter(Boolean).join('\n');
  const n = lines.length;
  return { word: `Scripts: ${n} problem${n === 1 ? '' : 's'}`, tone: bad ? 'bad' : 'warn', tip, count: n, lines, bad };
}

/**
 * what the Claude control says Claude sees: the primary block and how many more, the open system
 * with nothing selected, nothing when sharing fails, or that the selection is withheld; the count of
 * blocks Claude sees for a narrow page; the dot's tone, accent while following and bad when sharing
 * fails; the whole label, and why sharing failed, for the tooltip
 * @param {{ count: number, withheld: boolean, error: string | null, primary: string | null, system: string, follow: boolean }} share
 * @returns {{ label: string, count: number, tone: '' | 'accent' | 'bad', tip: string }}
 */
export function claudeSees({ count, withheld, error, primary, system, follow }) {
  const label = error
    ? 'Claude sees nothing'
    : withheld
      ? 'Withheld from Claude'
      : count === 0
        ? `Claude sees ${system}`
        : primary === null
          ? `Claude sees ${count} block${count === 1 ? '' : 's'}`
          : count === 1
            ? `Claude sees ${primary}`
            : `Claude sees ${primary} and ${count - 1} more`;
  return { label, count: error || withheld ? 0 : count, tone: error ? 'bad' : follow ? 'accent' : '', tip: error ? `${label}\n${error}` : label };
}

/**
 * the systems from the root down to `id`
 * @param {{ id: string, name: string, parent: string | null }[]} systems
 * @param {string} id
 */
function chain(systems, id) {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const out = [];
  for (let s = byId.get(id); s && out.length <= systems.length; s = byId.get(s.parent ?? '')) out.unshift(s);
  return out;
}

/**
 * a status item: its dot and its word; the word is hidden on a narrow page, where the tooltip says it
 * @param {{ item: { word: string } }} props
 */
const dotAndWord = ({ item }) => html`<span class="dot" aria-hidden="true"></span><span class="word">${item.word}</span>`;

/**
 * the top bar
 * @param {object} props
 * @param {any} props.model
 * @param {string} props.system the open system
 * @param {{ blocks: Record<string, string>, deleted: unknown[] }} props.changes since reviewed
 * @param {Status & { dismiss: string | null }} props.state the file's state (fileState)
 * @param {ReturnType<typeof scriptProblems>} props.problems
 * @param {Parameters<typeof claudeSees>[0]} props.share what Claude sees
 * @param {import('./commands.js').MenuItem[]} props.menu the Claude control's items
 * @param {boolean} props.running
 * @param {boolean} props.pickable the mark opens the picker: not in VS Code, where the tab is the file,
 *   nor in a static copy of one model
 * @param {boolean} [props.site] a static copy (`slxkit export`): what needs the server is not shown
 * @param {boolean} [props.framed] in a frame of a website: the full-screen button
 * @param {boolean} [props.full] shown full screen
 * @param {(id: string) => unknown} props.run a command
 * @param {(id: string) => void} props.open a system, as a person opens it
 * @param {(key: string) => void} props.dismiss a stale or ended session's state
 */
export function TopBar({ model, system, changes, state, problems, share, menu, running, pickable, site = false, framed = false, full = false, run, open, dismiss }) {
  const crumbs = model ? chain(model.systems, system) : [];
  // a deep system: the root, an ellipsis for the levels between, and the open system with the two
  // above it
  const hidden = crumbs.length > 4 ? crumbs.slice(1, -3) : [];
  const shown = hidden.length > 0 ? [crumbs[0], null, ...crumbs.slice(-3)] : crumbs;
  const changed = Object.keys(changes.blocks).length + changes.deleted.length;
  const reviewed = tipParts('reviewed');
  const sees = claudeSees(share);
  // the key sheet's button: at the right end, after Run; first on the right in a static copy
  const keys = html`<button class="quiet icon keys" data-command="sheet" aria-label=${tipParts('sheet').label} onClick=${() => run('sheet')}>?</button>`;
  return html`<header class=${site ? 'top site' : 'top'}>
    ${pickable
      ? html`<button class="quiet icon mark" data-command="pick" aria-label=${tipParts('pick').label} onClick=${() => run('pick')}>
          <span class="glyph"></span>
        </button>`
      : html`<span class="mark" aria-hidden="true"><span class="glyph"></span></span>`}
    <nav class="crumbs">
      ${shown.map((s, i) =>
        s === null
          ? html`<span class="sep">/</span>
              <button class="link more" data-tip=${hidden.map((h) => oneLine(h.name)).join('\n')} aria-label=${hidden.map((h) => oneLine(h.name)).join(' / ')}
                onClick=${() => open(hidden[hidden.length - 1].id)}>
                …
              </button>`
          : html`${i > 0 && html`<span class="sep">/</span>`}
              <button class="link" data-file=${i === 0 && model.file ? base(model.file) : undefined} data-tip=${i === 0 ? model.file ?? undefined : undefined}
                onClick=${() => open(s.id)}>${oneLine(s.name)}</button>`,
      )}
    </nav>
    ${!site &&
    html`<span class=${`status file-state ${state.tone}`} role="status" data-tip=${state.tip}>
      <${dotAndWord} item=${state} />
      ${state.dismiss &&
      html`<button class="quiet icon close" data-tip="Dismiss" aria-label="Dismiss" onClick=${() => state.dismiss && dismiss(state.dismiss)}>×</button>`}
    </span>`}
    ${!site &&
    problems &&
    html`<button class=${`quiet status scripts ${problems.tone}`} data-command="scriptProblems" data-tip=${problems.tip} onClick=${() => run('scriptProblems')}>
      <${dotAndWord} item=${problems} />
    </button>`}
    ${!site &&
    changed > 0 &&
    html`<span class="status changed warn" data-tip=${`${changed} block${changed === 1 ? '' : 's'} changed since reviewed. ${reviewed.label}`} data-keys=${reviewed.keys}>
      <${dotAndWord} item=${{ word: `${changed} changed`, tone: 'warn', tip: '' }} />
    </span>`}
    ${site && keys}
    ${framed &&
    html`<button class="quiet icon full" data-command="fullScreen" aria-label=${full ? 'Leave full screen' : tipParts('fullScreen').label}
      onClick=${() => run('fullScreen')}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
        <path d=${full ? 'M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5' : 'M2.5 6V2.5H6M10 2.5h3.5V6M2.5 10v3.5H6M13.5 10v3.5H10'} />
      </svg>
    </button>`}
    ${!site &&
    html`<${Menu} box="claude-control" className=${`claude ${sees.tone}`} label="Claude" tip=${sees.tip} items=${menu} onRun=${run}>
      <span class="dot" aria-hidden="true"></span><span class="word">${sees.label}</span><span class="count" aria-hidden="true">${sees.count}</span>
    </${Menu}>`}
    ${site
      ? null
      : running
        ? html`<button class="primary run" data-command="stop" onClick=${() => run('stop')}>
            <span class="progress" aria-hidden="true"></span>${short('stop')}<kbd aria-hidden="true">${keysOf('stop')}</kbd>
          </button>`
        : html`<button class="primary run" data-command="run" onClick=${() => run('run')}>
            ${short('run')}<kbd aria-hidden="true">${keysOf('run')}</kbd>
          </button>`}
    ${!site && keys}
  </header>`;
}
