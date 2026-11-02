// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the page's actions in one list (design 4.2): each command's words, the keys that reach it (as
// keys.js names them), the group it is listed under, when it applies and what it does, through the
// operations the page gives it. The key map, search and the tooltips read this list

/**
 * the page as the commands see it: what they read to decide whether they apply
 * @typedef {object} Context
 * @property {boolean} embedded inside VS Code, where a tab is one file
 * @property {boolean} site a static copy (`slxkit export`), with no server to run, share or keep
 * @property {boolean} pickable another model can be opened here: not in VS Code, and a static copy
 *   holds more than one
 * @property {boolean} framed in a frame of a page that scrolls past it, such as a website's
 * @property {boolean} running a run goes
 * @property {boolean} selected blocks are selected
 * @property {boolean} openable the primary block is a subsystem or a Model block
 * @property {boolean} below the open system has a parent
 * @property {boolean} picking a plot picks an input line
 * @property {boolean} sheet the key sheet is open
 * @property {boolean} menu a menu is open (menu.js)
 * @property {boolean} withheld the selection is withheld from Claude
 * @property {boolean} follow Claude's show requests move the view
 * @property {boolean} textOn the text view is open
 * @property {number} whatifs what-if values are tried
 * @property {boolean} asked Claude was asked to apply them
 * @property {(id: string) => boolean} provided a shown component provides this action
 */

/**
 * the page's operations, one per command; each answers false when it did nothing, and anything else
 * when it acted
 * @typedef {Record<string, (...args: any[]) => boolean | void>} Page
 */

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {string} label what it does, in the words search and the key sheet list it by
 * @property {string} [short] its button's text, where it has a button
 * @property {string[]} synonyms other words search finds it by
 * @property {string[]} keys the keys that reach it, as keyName gives them; Escape is decided by layers
 * @property {string} group where the key sheet lists it
 * @property {boolean} [palette] false: search never offers it
 * @property {string} [layer] what Escape closes with it, for the key sheet
 * @property {boolean} [server] it needs the server of `slxkit view`: a static copy never offers it
 * @property {(c: Context) => boolean} [when] where it applies; always when absent
 * @property {(c: Context) => string} [why] why it does not apply, for a menu's disabled item
 * @property {(c: Context) => boolean} [checked] a setting's state, for a menu's checkbox item
 * @property {(p: Page) => boolean | void} run
 */

/**
 * a command a shown component provides (the dock, its first plot): offered while it is provided
 * @param {string} id
 * @param {Omit<Command, 'id' | 'run' | 'when'>} words
 * @returns {Command}
 */
const provided = (id, words) => ({ id, ...words, server: true, when: (c) => c.provided(id), run: (p) => p.provided(id) === true });

/** @type {Command[]} */
export const COMMANDS = [
  {
    id: 'fit',
    label: 'Fit the system to the canvas',
    synonyms: ['zoom to fit', 'whole system', 'overview'],
    keys: ['F'],
    group: 'Canvas',
    run: (p) => p.fit(),
  },
  { id: 'actual', label: 'Zoom to 100 %', synonyms: ['actual size', 'reset zoom', 'one to one'], keys: ['0'], group: 'Canvas', run: (p) => p.actual() },
  { id: 'zoomBack', label: 'Zoom back', synonyms: ['previous zoom', 'undo zoom'], keys: ['['], group: 'Canvas', run: (p) => p.zoomBack() },
  { id: 'zoomForward', label: 'Zoom forward', synonyms: ['next zoom', 'redo zoom'], keys: [']'], group: 'Canvas', run: (p) => p.zoomForward() },
  {
    id: 'open',
    label: 'Open the selected subsystem or model',
    synonyms: ['enter', 'go into', 'descend', 'model block'],
    keys: ['Enter'],
    group: 'Go',
    when: (c) => c.openable,
    run: (p) => p.open(),
  },
  {
    id: 'up',
    label: 'Go up to the parent system',
    synonyms: ['parent', 'out', 'leave the subsystem'],
    keys: ['Backspace'],
    group: 'Go',
    when: (c) => c.below,
    run: (p) => p.up(),
  },
  { id: 'back', label: 'Back to the previous place', synonyms: ['history', 'previous'], keys: ['Alt+ArrowLeft'], group: 'Go', run: (p) => p.back() },
  { id: 'forward', label: 'Forward to the next place', synonyms: ['history', 'next'], keys: ['Alt+ArrowRight'], group: 'Go', run: (p) => p.forward() },
  { id: 'search', label: 'Search the model', synonyms: ['find', 'commands'], keys: ['/', 'Ctrl+K'], group: 'Go', palette: false, run: (p) => p.search() },
  {
    id: 'pick',
    label: 'Open another model',
    synonyms: ['picker', 'file', 'switch model', 'models'],
    keys: [],
    group: 'Go',
    when: (c) => c.pickable,
    run: (p) => p.pick(),
  },
  { id: 'run', label: 'Run the model', short: 'Run', synonyms: ['simulate', 'start', 'execute'], keys: ['Ctrl+Enter'], group: 'Run', server: true, run: (p) => p.run() },
  {
    id: 'stop',
    label: 'Stop the run',
    short: 'Stop',
    synonyms: ['cancel', 'abort', 'halt'],
    keys: ['Escape'],
    group: 'Run',
    layer: 'a run',
    server: true,
    when: (c) => c.running,
    run: (p) => p.stop(),
  },
  {
    id: 'cancelPick',
    label: 'Cancel the input pick',
    synonyms: ['linear input'],
    keys: ['Escape'],
    group: 'Run',
    layer: 'an input pick',
    server: true,
    when: (c) => c.picking,
    run: (p) => p.cancelPick(),
  },
  {
    id: 'plot',
    label: "Plot the selected block's outputs",
    synonyms: ['signal', 'scope', 'graph', 'chart', 'trace'],
    keys: [],
    group: 'Results',
    server: true,
    when: (c) => c.selected,
    run: (p) => p.plot(),
  },
  provided('results', { label: 'Show or hide the results', synonyms: ['dock', 'plots', 'bottom panel'], keys: [], group: 'Results' }),
  provided('history', {
    label: 'History: the runs of this model, to pin and compare',
    short: 'History',
    synonyms: ['runs', 'previous runs', 'pin a run'],
    keys: [],
    group: 'Results',
  }),
  provided('table', { label: 'Table: the plotted signals as numbers', short: 'Table', synonyms: ['values', 'samples', 'data'], keys: [], group: 'Results' }),
  provided('auto', {
    label: 'Auto: run again by itself after a quick model change',
    short: 'Auto',
    synonyms: ['auto run', 'automatic', 'rerun on change'],
    keys: [],
    group: 'Results',
  }),
  provided('log', { label: "Log: the scripts' problems, then the last run's warnings and errors", short: 'Log', synonyms: ['warnings', 'errors', 'messages'], keys: [], group: 'Results' }),
  provided('scriptProblems', {
    label: "Show the scripts' problems in the log",
    synonyms: ['script errors', 'lines not run', 'project file'],
    keys: [],
    group: 'Results',
  }),
  provided('wholeRun', { label: 'Show the whole run', short: 'Whole run', synonyms: ['zoom out', 'unzoom', 'full time range'], keys: [], group: 'Results' }),
  provided('compare', {
    label: 'A − B: the latest run minus the compared run',
    short: 'A − B',
    synonyms: ['difference', 'minus', 'compare runs', 'delta'],
    keys: [],
    group: 'Results',
  }),
  provided('step', {
    label: "Step: the step metrics of the plot's first signal",
    short: 'Step',
    synonyms: ['overshoot', 'rise time', 'settling time'],
    keys: [],
    group: 'Results',
  }),
  provided('linear', {
    label: "Linear: the linear model to the plot's first signal, with poles, Bode and step",
    short: 'Linear',
    synonyms: ['linearize', 'linearise', 'bode', 'frequency response', 'poles', 'transfer function'],
    keys: [],
    group: 'Results',
  }),
  provided('export', {
    label: 'Export the plot as SVG, PNG or CSV',
    short: 'Export',
    synonyms: ['save', 'download', 'image', 'figure'],
    keys: [],
    group: 'Results',
  }),
  provided('clearCursor', {
    label: "Clear the plots' cursors",
    synonyms: ['time cursor', 'interval'],
    keys: ['Escape'],
    group: 'Results',
    layer: "the plots' cursors",
  }),
  {
    id: 'reviewed',
    label: 'Mark the changes reviewed',
    synonyms: ['review', 'accept', 'baseline', 'seen'],
    keys: ['R'],
    group: 'Changes',
    server: true,
    run: (p) => p.reviewed(),
  },
  {
    id: 'follow',
    label: 'Follow Claude: let its show requests move the view',
    short: 'Follow Claude',
    synonyms: ['track claude', 'show requests'],
    keys: [],
    group: 'Claude',
    server: true,
    checked: (c) => c.follow,
    run: (p) => p.follow(),
  },
  {
    id: 'withhold',
    label: 'Withhold the selection from Claude, or share it again',
    short: 'Share the selection with Claude',
    synonyms: ['share', 'hide from claude', 'privacy'],
    keys: [],
    group: 'Claude',
    server: true,
    checked: (c) => !c.withheld,
    run: (p) => p.withhold(),
  },
  {
    id: 'copyRef',
    label: 'Copy a reference to the selection for Claude',
    short: 'Copy reference',
    synonyms: ['reference', 'cite', 'mention', 'token'],
    keys: ['Alt+K'],
    group: 'Claude',
    server: true,
    when: (c) => c.selected,
    why: () => 'Select blocks first: the reference names them',
    run: (p) => p.copyRef(),
  },
  {
    id: 'askClaude',
    label: 'Ask Claude to apply the what-if values',
    short: 'Ask Claude to apply',
    synonyms: ['apply what-if', 'request', 'set values'],
    keys: [],
    group: 'Claude',
    server: true,
    when: (c) => c.whatifs > 0 && !c.asked,
    why: (c) => (c.asked ? 'Asked: Claude sees the request in its view' : 'Try a what-if value first'),
    run: (p) => p.askClaude(),
  },
  {
    id: 'text',
    label: 'Text view: the open system as Claude reads it',
    short: 'Text view',
    synonyms: ['text twin', 'listing', 'what claude reads'],
    keys: [],
    group: 'Claude',
    checked: (c) => c.textOn,
    run: (p) => p.text(),
  },
  {
    id: 'outline',
    label: 'Show or hide the outline',
    synonyms: ['tree', 'systems', 'hierarchy', 'left panel'],
    keys: ['O'],
    group: 'Panels',
    run: (p) => p.side('outline'),
  },
  {
    id: 'inspector',
    label: 'Show or hide the inspector',
    synonyms: ['parameters', 'properties', 'block details', 'right panel'],
    keys: ['I'],
    group: 'Panels',
    run: (p) => p.side('inspector'),
  },
  {
    id: 'putAway',
    label: 'Put the slid-in panels away',
    synonyms: [],
    keys: ['Escape'],
    group: 'Panels',
    layer: 'a slid-in panel',
    palette: false,
    run: (p) => p.putAway(),
  },
  {
    id: 'fullScreen',
    label: 'Show the page full screen, or back in its frame',
    short: 'Full screen',
    synonyms: ['maximize', 'expand', 'bigger', 'new tab'],
    keys: [],
    group: 'Panels',
    when: (c) => c.framed,
    run: (p) => p.fullScreen(),
  },
  {
    id: 'sheet',
    label: 'Show or hide the keys',
    synonyms: ['shortcuts', 'help', 'keyboard', 'hotkeys', 'key sheet'],
    keys: ['?'],
    group: 'Panels',
    run: (p) => p.sheet(),
  },
  {
    id: 'closeMenu',
    label: 'Close the menu',
    synonyms: [],
    keys: ['Escape'],
    group: 'Panels',
    layer: 'a menu',
    palette: false,
    when: (c) => c.menu,
    run: (p) => p.closeMenu(),
  },
  {
    id: 'closeSheet',
    label: 'Close the key sheet',
    synonyms: [],
    keys: ['Escape'],
    group: 'Panels',
    layer: 'the key sheet',
    palette: false,
    when: (c) => c.sheet,
    run: (p) => p.closeSheet(),
  },
  {
    id: 'endSearch',
    label: 'End the search',
    synonyms: [],
    keys: ['Escape'],
    group: 'Go',
    layer: 'the search',
    palette: false,
    run: (p) => p.endSearch(),
  },
  {
    id: 'deselect',
    label: 'Clear the selection',
    synonyms: ['deselect', 'select none', 'unselect'],
    keys: ['Escape'],
    group: 'Canvas',
    layer: 'the selection',
    when: (c) => c.selected,
    run: (p) => p.deselect(),
  },
];

/**
 * @typedef {object} Gesture
 * @property {string} id
 * @property {string} label what it does, as the key sheet lists it
 * @property {string[]} how what the hand does, each as the sheet shows it
 * @property {string} [hint] the words a readout or an empty place says about it
 * @property {boolean} [server] it needs the server of `slxkit view`
 */

// what the mouse and fingers do (VO-12): one list for the key sheet's Mouse group and the hints
/** @type {Gesture[]} */
export const GESTURES = [
  { id: 'pan', label: 'Move the diagram', how: ['Drag'] },
  { id: 'zoom', label: 'Zoom about the pointer', how: ['Wheel', 'Pinch'] },
  { id: 'readout', label: "A block's parameters, or a line's ends", how: ['Rest the pointer'] },
  { id: 'select', label: 'Select a block; Shift adds it or takes it out', how: ['Click', 'Shift+Click'] },
  { id: 'box', label: 'Select the blocks in a box', how: ['Shift+Drag'] },
  { id: 'enter', label: 'Open a subsystem', how: ['Double-click'] },
  {
    id: 'plotLine',
    label: "Plot a line's signal; Shift puts it in a new plot",
    how: ['Click a line', 'Shift+Click'],
    hint: 'Click to plot, Shift-click for a new plot',
    server: true,
  },
  { id: 'zoomPlots', label: 'Zoom every plot in time', how: ['Drag a plot'], server: true },
  { id: 'measure', label: 'Two cursors: delta, min, max, mean, RMS', how: ['Shift+Drag a plot'], server: true },
  { id: 'wholeRun', label: 'The whole run again', how: ['Double-click a plot'], server: true },
];

/**
 * the words of a gesture's hint
 * @param {string} id
 */
export const gestureHint = (id) => GESTURES.find((g) => g.id === id)?.hint ?? '';

/**
 * the wheel's part in a frame of a page that scrolls past it: the wheel scrolls that page, and
 * zooms with Ctrl, or Cmd on a Mac
 * @param {boolean} framed
 * @param {boolean} [mac]
 */
export const zoomWith = (framed, mac = MAC) => (framed ? [`${mac ? 'Cmd' : 'Ctrl'}+Wheel`, 'Pinch'] : ['Wheel', 'Pinch']);

// what Escape closes, innermost first (keys.js route decides by these layers)
export const ESCAPE_ORDER = ['closeMenu', 'closeSheet', 'cancelPick', 'endSearch', 'putAway', 'stop', 'clearCursor', 'deselect'];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/**
 * the command applies where the page is: its condition holds, and a static copy has what it needs
 * @param {Command} c
 * @param {Context} context
 */
const applies = (c, context) => !(c.server && context.site) && (!c.when || c.when(context));
// Escape reaches a layer's command in the key map, never one by name
const BY_KEY = new Map(COMMANDS.flatMap((c) => c.keys.filter((k) => k !== 'Escape').map((k) => [k, c.id])));

/**
 * the command a key reaches, by the key's name (keys.js keyName); null for none
 * @param {string} name
 */
export const commandOf = (name) => BY_KEY.get(name) ?? null;

/**
 * what the commands' conditions read, from the page's state; a Model block is known by the search
 * index's block types, once the index is read
 * @param {{ selection: string[], primary?: string | null, system: string, systems: { id: string, parent: string | null }[],
 *   index?: { blocks?: { sid: string, type: string }[] } | null, runState: { state: string } | null, picking: unknown,
 *   sheet?: boolean, withheld?: boolean, follow?: boolean, textOn?: boolean, whatif?: { whatifs: unknown[], asked: unknown } }} state
 * @param {{ embedded: boolean, site?: boolean, pickable?: boolean, framed?: boolean, provided: (id: string) => boolean, menu?: boolean }} extras
 * @returns {Context}
 */
export function contextOf(state, { embedded, site = false, pickable = !embedded, framed = false, provided, menu = false }) {
  const primary = state.primary ?? null;
  return {
    embedded,
    site,
    pickable,
    framed,
    running: state.runState?.state === 'running',
    selected: state.selection.length > 0,
    openable:
      primary !== null &&
      (state.systems.some((s) => s.id === primary) || !!state.index?.blocks?.some((b) => b.sid === primary && b.type === 'ModelReference')),
    below: !!state.systems.find((s) => s.id === state.system)?.parent,
    picking: !!state.picking,
    sheet: !!state.sheet,
    menu,
    withheld: !!state.withheld,
    follow: !!state.follow,
    textOn: !!state.textOn,
    whatifs: state.whatif?.whatifs?.length ?? 0,
    asked: state.whatif?.asked != null,
    provided,
  };
}

// the Claude control's menu (design 4.1), in groups with a rule between them
const CLAUDE_MENU = [
  ['withhold', 'follow', 'text'],
  ['copyRef', 'askClaude'],
];

/**
 * @typedef {{ id: string, label: string, keys: string, checked?: boolean, why: string | null, rule: boolean }} MenuItem
 * a menu's item: its words and keys, its check for a setting, why it does not apply (null when it
 * does), a rule above it
 */

/**
 * the Claude control's items where the page is, from the list
 * @param {Context} context
 * @param {boolean} [mac]
 * @returns {MenuItem[]}
 */
export function claudeMenu(context, mac = MAC) {
  return CLAUDE_MENU.flatMap((group, g) =>
    group.map((id, i) => {
      const c = /** @type {Command} */ (BY_ID.get(id));
      return {
        id,
        label: short(id),
        keys: keysOf(id, mac),
        checked: c.checked?.(context),
        why: applies(c, context) ? null : (c.why?.(context) ?? 'Not here'),
        rule: g > 0 && i === 0,
      };
    }),
  );
}

/**
 * a command run where it applies; true when it acted
 * @param {string} id
 * @param {Page} page
 * @param {Context} context
 */
export function runCommand(id, page, context) {
  const c = BY_ID.get(id);
  if (!c || !applies(c, context)) return false;
  return c.run(page) !== false;
}

/**
 * the commands search offers where the page is, in the order of the list, each with its words and
 * its keys as people read them
 * @param {Context} context
 * @param {boolean} [mac]
 * @returns {{ id: string, label: string, synonyms: string[], key: string }[]}
 */
export function palette(context, mac = MAC) {
  return COMMANDS.filter((c) => c.palette !== false && applies(c, context)).map(({ id, label, synonyms }) => ({
    id,
    label,
    synonyms,
    key: keysOf(id, mac),
  }));
}

// a Mac names Ctrl's place Cmd (keyName takes either)
export const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
const ARROWS = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' };

/**
 * a key as people read it: 'Alt+Left' for Alt+ArrowLeft, 'Cmd+K' for Ctrl+K on a Mac
 * @param {string} name keyName's
 * @param {boolean} [mac]
 */
export function keyLabel(name, mac = MAC) {
  const parts = name.split('+');
  const key = parts.pop() || '+';
  const mods = parts.map((m) => (m === 'Ctrl' && mac ? 'Cmd' : m));
  return [...mods, ARROWS[/** @type {keyof typeof ARROWS} */ (key)] ?? key].join('+');
}

/**
 * the keys of a command as people read them, 'O' or '/ or Ctrl+K'; '' for none
 * @param {string} id
 * @param {boolean} [mac]
 */
export function keysOf(id, mac = MAC) {
  return (BY_ID.get(id)?.keys ?? []).map((k) => keyLabel(k, mac)).join(' or ');
}

/**
 * a command's words and its keys apart, for the tooltip (tip.js), which sets the keys in ink-3
 * @param {string} id
 * @param {boolean} [mac]
 * @returns {{ label: string, keys: string }}
 */
export const tipParts = (id, mac = MAC) => ({ label: BY_ID.get(id)?.label ?? id, keys: keysOf(id, mac) });

/**
 * a command's words and keys in one line, for a name read aloud
 * @param {string} id
 * @param {boolean} [mac]
 */
export function tip(id, mac = MAC) {
  const { label, keys } = tipParts(id, mac);
  return keys ? `${label} (${keys})` : label;
}

/**
 * a command's button text
 * @param {string} id
 */
export const short = (id) => BY_ID.get(id)?.short ?? BY_ID.get(id)?.label ?? id;

/**
 * the key sheet (`?`): every command with a key, by group in the order of the list, with its keys as
 * people read them; what Escape closes, innermost first; the keys of search, which finds every
 * command by name; and what the mouse does. A static copy's sheet leaves out what needs the server,
 * and in a frame the wheel zooms with Ctrl
 * @param {boolean} [mac]
 * @param {{ site?: boolean, framed?: boolean }} [where]
 */
export function keySheet(mac = MAC, { site = false, framed = false } = {}) {
  /** @type {{ name: string, rows: { id: string, label: string, keys: string[] }[] }[]} */
  const groups = [];
  for (const c of COMMANDS) {
    if (site && c.server) continue;
    const keys = c.keys.filter((k) => k !== 'Escape').map((k) => keyLabel(k, mac));
    if (keys.length === 0) continue;
    let group = groups.find((g) => g.name === c.group);
    if (!group) groups.push((group = { name: c.group, rows: [] }));
    group.rows.push({ id: c.id, label: c.label, keys });
  }
  const escape = ESCAPE_ORDER.filter((id) => !(site && BY_ID.get(id)?.server))
    .map((id) => BY_ID.get(id)?.layer)
    .join(', ');
  const mouse = GESTURES.filter((g) => !(site && g.server)).map(({ id, label, how }) => ({
    id,
    label,
    how: id === 'zoom' ? zoomWith(framed, mac) : how,
  }));
  return { groups, escape, search: (BY_ID.get('search')?.keys ?? []).map((k) => keyLabel(k, mac)), mouse };
}
