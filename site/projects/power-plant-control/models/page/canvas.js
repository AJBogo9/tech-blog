// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the canvas: one system's SVG moved by a CSS transform; drag pans and coasts on release, the
// wheel and pinches zoom about the pointer; each system keeps its view for the session

import { zoomAbout, fit, release, coast, place, tooltipAt, boxHits, pinAt, ringAround, CHANGE_FRAME, frameWidth, wheelZooms, wheelFactor, zoomHint, TWO_FINGERS } from './view.js';
import { typeset } from './math.js';
import { MAC } from './commands.js';

// asked when a drag ends, not when the module loads
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// a press that moves less than this is a click
const CLICK_SLOP = 4;
// slower releases stop where they are
const MIN_COAST = 40;
// the transform hint stays this long after the last change, then the text is drawn crisp again
const CRISP_AFTER = 150;
// below this zoom only frames, names and lines are drawn
const LOW_ZOOM = 0.5;
// a pointer resting this long on a block or line gets its readout
const HOVER_DELAY = 150;
// a hint over the canvas stays this long
const HINT_FOR = 1500;
// a finger that scrolled the page past a frame says how to move the diagram at most this often
const TWO_FINGERS_EVERY = 30000;
const SVG = 'http://www.w3.org/2000/svg';

const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.zoom === b.zoom;
/**
 * the drawing's elements a selector finds, as SVG elements (its groups carry data-sid, data-src)
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {SVGElement[]}
 */
const all = (root, selector) => /** @type {SVGElement[]} */ ([...root.querySelectorAll(selector)]);

export class Canvas {
  constructor(element, { onSelect, onOpen, describe, onHover, onView, onPoint, onLine, framed = () => false }) {
    this.element = element;
    this.sheet = document.createElement('div');
    this.sheet.className = 'sheet';
    element.append(this.sheet);
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.tip.hidden = true;
    element.append(this.tip);
    this.onSelect = onSelect;
    this.onLine = onLine;
    this.onOpen = onOpen;
    this.describe = describe;
    this.onHover = onHover;
    this.onView = onView;
    this.onPoint = onPoint;
    // in a frame of a page that scrolls past it: the wheel and one finger are that page's
    this.framed = framed;
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.hidden = true;
    element.append(this.hint);
    this.toldFingers = -Infinity;
    this.changes = {};
    this.hovered = null;
    this.selection = new Set();
    // the rings over the drawing: the selection's, and the hovered block's
    this.selRings = [];
    this.hovRing = null;
    this.ringZoom = null;
    this.pinned = null;
    this.dimmed = null;
    this.id = null;
    this.box = { x: 0, y: 0, width: 100, height: 50 };
    this.state = { x: 0, y: 0, zoom: 1 };
    this.views = new Map();
    this.past = [];
    this.future = [];
    this.pointers = new Map();
    this.samples = [];
    this.dragging = false;
    this.swallowClick = false;
    this.frame = null;

    element.addEventListener('pointerdown', (e) => this.down(e));
    element.addEventListener('pointermove', (e) => this.move(e));
    element.addEventListener('pointerup', (e) => this.up(e));
    element.addEventListener('pointercancel', (e) => {
      // a finger the page took to scroll past a frame: say how the diagram moves
      if (e.pointerType === 'touch' && this.pointers.size === 1 && this.framed() && e.timeStamp - this.toldFingers > TWO_FINGERS_EVERY) {
        this.toldFingers = e.timeStamp;
        this.say(TWO_FINGERS);
      }
      this.up(e);
    });
    element.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    // two fingers move the diagram in a frame, so the page must not scroll under them; one finger is
    // the page's (touch-action, style.css)
    const twoFingers = (e) => {
      if (e.touches.length > 1 && this.framed()) e.preventDefault();
    };
    element.addEventListener('touchstart', twoFingers, { passive: false });
    element.addEventListener('touchmove', twoFingers, { passive: false });
    // a view still as fitted follows the canvas's size, so one fitted while the canvas had no
    // room (a narrow window, or one not laid out yet) is fitted again once it has
    this.fitView = null;
    new ResizeObserver(() => this.resized()).observe(element);
    this.warmTip();
    element.addEventListener('pointerleave', () => {
      this.pointerAt = null;
      this.unhover();
    });
    element.addEventListener('keydown', () => this.unhover());
    // click selects one block, Shift-click adds or removes one
    element.addEventListener('click', (e) => {
      if (this.swallowClick) {
        this.swallowClick = false;
        return;
      }
      if (e.target.closest('.pin, .notice')) return;
      // a line's hover strip counts as the line
      const target = this.targetOf(e.target);
      const sid = target?.matches('g.blk') ? target.dataset.sid : null;
      // a line plots its signal; Shift puts it in a new plot
      const line = target?.matches('g.ln') ? target : null;
      if (line?.dataset.src) {
        this.onLine?.(line.dataset.src, e.shiftKey);
        return;
      }
      // the canvas marks the selection at once; the app hears of it after
      if (e.shiftKey) {
        if (!sid) return;
        const next = new Set(this.selection);
        if (next.has(sid)) next.delete(sid);
        else next.add(sid);
        this.select([...next]);
        this.onSelect([...next], next.has(sid) ? sid : null);
      } else {
        this.select(sid ? [sid] : []);
        this.onSelect(sid ? [sid] : [], sid);
      }
    });
    element.addEventListener('dblclick', (e) => {
      const block = e.target.closest('g.blk');
      if (block) this.onOpen(block.dataset.sid);
    });
  }

  // draw a system: the same system keeps its view, one seen before gets its view back, a new
  // one is fitted; returns the selected blocks that are now of another type (another model
  // copied over the file), which are no longer the blocks the person selected
  show(id, text) {
    // a reload of the open system keeps a coast going; another system stops it
    if (id !== this.id) {
      this.stop();
      this.unpin();
    }
    const typeOf = () => new Map(all(this.sheet, 'g.blk').map((g) => [g.dataset.sid, g.dataset.type]));
    const before = id === this.id ? typeOf() : new Map();
    this.sheet.innerHTML = text;
    const after = typeOf();
    const changed = [...this.selection].filter((sid) => before.has(sid) && after.has(sid) && before.get(sid) !== after.get(sid));
    // a system with nothing in it says so
    this.blank?.remove();
    this.blank = null;
    if (!this.sheet.querySelector('g.blk, g.ann')) {
      this.blank = document.createElement('div');
      this.blank.className = 'message blank';
      this.blank.textContent = 'This system is empty';
      this.element.append(this.blank);
    }
    // the view box in model coordinates; the view stays in them, so a save that moves the
    // drawing's edges moves nothing on screen
    const box = this.sheet.querySelector('svg')?.viewBox.baseVal;
    this.box =
      box && box.width > 0 && box.height > 0
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : { x: 0, y: 0, width: 100, height: 50 };
    if (id !== this.id) {
      this.id = id;
      this.past = [];
      this.future = [];
      // a view kept as fitted is fitted again, to the canvas's size now
      const kept = this.views.get(id);
      this.state = kept && !kept.fit ? { x: kept.x, y: kept.y, zoom: kept.zoom } : this.fitted();
      this.fitView = kept && !kept.fit ? null : { ...this.state };
      this.record();
    }
    this.addHits();
    this.drawAnnotations();
    typeset(this.sheet);
    this.apply();
    // marks the changes and draws the selection's rings round the frames they widen
    this.mark(this.changes);
    this.dim(this.dimmed ? [...this.dimmed] : null);
    return changed;
  }

  // the views kept across reloads of this tab under `key`, so a reload shows what was shown
  keep(key) {
    try {
      for (const [id, view] of JSON.parse(sessionStorage.getItem(key) ?? '[]')) this.views.set(id, view);
    } catch {
      // nothing kept, or storage blocked: systems are fitted
    }
    addEventListener('pagehide', () => {
      try {
        sessionStorage.setItem(key, JSON.stringify([...this.views]));
      } catch {
        // not kept
      }
    });
  }

  // values at the time cursor and spec marks, written beside each line's source (viewing design
  // 5.2, 5.5); kept across redraws of the system
  annotate(values, badges) {
    this.annotations = { values, badges };
    this.drawAnnotations();
  }

  drawAnnotations() {
    const svg = this.sheet.querySelector('svg');
    svg?.querySelector('g.values')?.remove();
    const { values, badges } = this.annotations ?? {};
    if (!svg || (!values && !badges)) return;
    const NS = 'http://www.w3.org/2000/svg';
    const layer = document.createElementNS(NS, 'g');
    layer.setAttribute('class', 'values');
    for (const line of this.lines) {
      const src = line.dataset.src;
      const value = values?.[src];
      const badge = badges?.[src];
      if (value === undefined && badge === undefined) continue;
      const seg = /** @type {SVGPolylineElement | null} */ (line.querySelector('polyline.seg'));
      if (!seg || seg.points.numberOfItems === 0) continue;
      const p = seg.points.getItem(0);
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('class', badge === false ? 'lv fail' : 'lv');
      text.setAttribute('x', String(p.x + 4));
      text.setAttribute('y', String(p.y - 4));
      // the mark is a second channel to the colour
      text.textContent = [badge === undefined ? '' : badge ? '✓' : '✗', value ?? ''].filter(Boolean).join(' ');
      layer.append(text);
    }
    svg.append(layer);
  }

  // lines are drawn 1 px wide: an 8 px invisible stroke under the blocks makes each easy to
  // hover, and a block still wins where the two meet
  addHits() {
    const svg = this.sheet.querySelector('svg');
    const blocks = svg?.querySelector('g.blocks');
    this.lines = svg ? all(svg, 'g.ln') : [];
    if (!blocks) return;
    const hits = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hits.setAttribute('class', 'hits');
    this.lines.forEach((line, i) => {
      for (const seg of line.querySelectorAll('polyline.seg')) {
        const hit = /** @type {SVGElement} */ (seg.cloneNode(false));
        hit.setAttribute('class', 'hit');
        hit.dataset.line = String(i);
        hits.append(hit);
      }
    });
    blocks.before(hits);
  }

  // the block or line an element belongs to
  targetOf(node) {
    if (node?.classList?.contains('hit')) return this.lines[Number(node.dataset.line)] ?? null;
    return node?.closest?.('g.blk, g.ln') ?? null;
  }

  // a redraw or new marks make a shown readout old: hide it and read again under the pointer
  rearm() {
    const at = this.pointerAt;
    this.unhover();
    if (!at) return;
    const under = document.elementFromPoint(at.clientX, at.clientY);
    if (under && this.sheet.contains(under)) this.hover({ target: under, clientX: at.clientX, clientY: at.clientY });
  }

  // the changes since reviewed, as classes on their blocks
  mark(changes) {
    this.changes = changes ?? {};
    for (const g of all(this.sheet, 'g.blk')) {
      g.classList.remove('chg-added', 'chg-changed', 'chg-moved');
      const kind = this.changes[g.dataset.sid];
      if (kind) g.classList.add(`chg-${kind}`);
    }
    // a change mark widens the frame: the rings move out with it
    this.select(this.selection);
    this.rearm();
  }

  // a readout for the block or line under a resting pointer
  hover(e) {
    this.pointerAt = { clientX: e.clientX, clientY: e.clientY };
    const target = this.targetOf(e.target);
    const p = this.local(e);
    if (target !== this.hovered?.target) {
      this.unhover();
      if (!target) return;
      this.hovered = { target, p };
      this.hoverRing(target);
      this.onPoint?.(target);
      this.hoverTimer = setTimeout(() => this.showTip(target), HOVER_DELAY);
    } else if (this.hovered) {
      this.hovered.p = p;
      if (!this.tip.hidden) this.placeTip();
    }
  }

  async showTip(target) {
    const start = performance.now();
    const content = await this.describe(target);
    if (this.hovered?.target !== target || !content) return;
    this.tip.replaceChildren(content);
    this.tip.hidden = false;
    this.placeTip();
    this.onHover?.(performance.now() - start);
  }

  placeTip() {
    const at = tooltipAt(
      this.hovered.p,
      { width: this.tip.offsetWidth, height: this.tip.offsetHeight },
      { width: this.element.clientWidth, height: this.element.clientHeight },
    );
    this.tip.style.transform = `translate(${at.x}px, ${at.y}px)`;
  }

  // the first readout's styles and fonts cost about 10 ms to set up: pay that while the page
  // loads, not on the person's first hover
  warmTip() {
    const sample = document.createElement('div');
    for (const [tag, cls] of [['strong', ''], ['div', 'muted'], ['div', 'change'], ['div', 'mono']]) {
      const line = document.createElement(tag);
      if (cls) line.className = cls;
      line.textContent = 'Gain = 1';
      sample.append(line);
    }
    this.tip.style.visibility = 'hidden';
    this.tip.replaceChildren(sample);
    this.tip.hidden = false;
    void this.tip.offsetWidth;
    this.tip.hidden = true;
    this.tip.replaceChildren();
    this.tip.style.visibility = '';
  }

  // content grew after it was shown
  replaceTip() {
    if (this.hovered && !this.tip.hidden) this.placeTip();
  }

  unhover() {
    clearTimeout(this.hoverTimer);
    const had = this.hovered;
    this.hovered = null;
    this.hoverRing(null);
    this.tip.hidden = true;
    if (had) this.onPoint?.(null);
  }

  // what the text twin points at: blocks, and the line leaving the port `from`; none clears
  highlight(sids = [], from = null) {
    const want = new Set(sids);
    for (const g of all(this.sheet, 'g.blk')) g.classList.toggle('hl', want.has(g.dataset.sid));
    for (const g of all(this.sheet, 'g.ln')) g.classList.toggle('hl', from !== null && g.dataset.src === from);
  }

  // the ports the drawn lines leave from ("4.y2"), one per line
  lineSources() {
    return all(this.sheet, 'g.ln').map((g) => g.dataset.src ?? null);
  }

  select(sids) {
    this.selection = new Set(sids ?? []);
    for (const r of this.selRings) r.el.remove();
    this.selRings = [];
    for (const g of all(this.sheet, 'g.blk')) {
      const on = this.selection.has(g.dataset.sid);
      g.classList.toggle('sel', on);
      const ring = on ? this.ring(g, 'sel') : null;
      if (ring) this.selRings.push(ring);
    }
    // a hovered block once selected wears the selection's ring only
    if (this.hovRing && this.selection.has(this.hovRing.el.dataset.sid)) this.hoverRing(null);
  }

  // the hovered block's ring in ink-3; none for a line, the paper or a selected block
  hoverRing(target) {
    this.hovRing?.el.remove();
    const block = target?.matches?.('g.blk') && !this.selection.has(target.dataset.sid) ? target : null;
    this.hovRing = block ? this.ring(block, 'hov') : null;
  }

  // a ring round block `g`'s body, in one layer over the drawing so no neighbour covers it; the
  // frame keeps its own colour and width (3.2)
  ring(g, kind) {
    const body = g.querySelector(':scope > .body');
    const svg = this.sheet.querySelector('svg');
    if (!body || !svg) return null;
    let layer = svg.querySelector(':scope > g.rings');
    if (!layer) {
      layer = document.createElementNS(SVG, 'g');
      layer.setAttribute('class', 'rings');
      svg.append(layer);
    }
    const n = (name) => Number(body.getAttribute(name));
    const points = () =>
      (body.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => {
        const [x, y] = p.split(',').map(Number);
        return { x, y };
      });
    const shape =
      body.tagName === 'circle'
        ? { kind: 'circle', cx: n('cx'), cy: n('cy'), r: n('r') }
        : body.tagName === 'rect'
          ? { kind: 'rect', x: n('x'), y: n('y'), width: n('width'), height: n('height') }
          : { kind: 'line', points: points() };
    const el = /** @type {SVGElement} */ (document.createElementNS(SVG, shape.kind === 'circle' ? 'circle' : 'rect'));
    const match = this.dimmed?.has(g.dataset.sid) ? ' match' : '';
    el.setAttribute('class', `ring ${kind}${match}`);
    el.dataset.sid = g.dataset.sid;
    // the frame's width from its change mark, not a style read: one per ring would recalc styles
    const change = Object.keys(CHANGE_FRAME).find((k) => g.classList.contains(`chg-${k}`));
    const ring = { el, shape, frame: frameWidth(body.getAttribute('stroke-width'), change) };
    this.placeRing(ring);
    layer.append(el);
    return ring;
  }

  // the rings at the zoom now, unless they are there already
  placeRings() {
    if (this.state.zoom === this.ringZoom) return;
    this.ringZoom = this.state.zoom;
    for (const ring of [...this.selRings, this.hovRing]) if (ring) this.placeRing(ring);
  }

  // 2 px wide and 2 px outside the frame at the zoom now
  placeRing({ el, shape, frame }) {
    const { kind, stroke, ...at } = ringAround(shape, this.state.zoom, frame);
    for (const [name, value] of Object.entries(at)) el.setAttribute(name, String(value));
    el.setAttribute('stroke-width', String(stroke));
  }

  // while a search runs: the open system's blocks and notes that match nothing are dimmed; null
  // undims
  dim(sids) {
    this.dimmed = sids ? new Set(sids) : null;
    this.sheet.classList.toggle('dim', this.dimmed !== null);
    for (const g of all(this.sheet, 'g.blk, g.ann')) {
      g.classList.toggle('match', this.dimmed !== null && this.dimmed.has(g.dataset.sid));
    }
    for (const ring of [...this.selRings, this.hovRing]) {
      ring?.el.classList.toggle('match', this.dimmed !== null && this.dimmed.has(ring.el.dataset.sid));
    }
  }

  // the SIDs of the drawn blocks, each once, for a request that names blocks this version may lack
  drawn(sids) {
    const present = new Set(all(this.sheet, 'g.blk').map((g) => g.dataset.sid));
    return [...new Set(sids)].filter((sid) => present.has(sid));
  }

  // what the canvas shows, in model coordinates
  region() {
    const { x, y, zoom } = this.state;
    return { x: -x / zoom, y: -y / zoom, width: this.element.clientWidth / zoom, height: this.element.clientHeight / zoom };
  }

  // the screen rectangles of blocks, relative to the canvas; named ones may be notes too
  rects(sids) {
    const r0 = this.element.getBoundingClientRect();
    const wanted = sids ? new Set(sids) : null;
    return all(this.sheet, sids ? 'g.blk, g.ann' : 'g.blk')
      .filter((g) => !wanted || wanted.has(g.dataset.sid))
      .map((g) => {
        const r = (g.querySelector('.body') ?? g).getBoundingClientRect();
        return { sid: g.dataset.sid, x: r.left - r0.left, y: r.top - r0.top, width: r.width, height: r.height };
      });
  }

  // pan the blocks into view when any of them is outside it; the zoom stays
  reveal(sids) {
    const rects = this.rects(sids);
    if (rects.length === 0) return;
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    const x1 = Math.max(...rects.map((r) => r.x + r.width));
    const y1 = Math.max(...rects.map((r) => r.y + r.height));
    const { clientWidth: w, clientHeight: h } = this.element;
    if (x0 >= 0 && y0 >= 0 && x1 <= w && y1 <= h) return;
    this.stop();
    this.state.x += w / 2 - (x0 + x1) / 2;
    this.state.y += h / 2 - (y0 + y1) / 2;
    this.apply();
    this.record();
  }

  // Claude's note beside a block, until it is closed or another system opens
  pin(sid, text) {
    this.unpin();
    const pin = document.createElement('div');
    pin.className = 'pin';
    const words = document.createElement('span');
    words.textContent = text;
    const close = document.createElement('button');
    close.className = 'quiet icon close';
    close.dataset.tip = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', () => this.unpin());
    pin.append(words, close);
    this.element.append(pin);
    this.pinned = { sid, element: pin };
    this.placePin();
  }

  unpin() {
    this.pinned?.element.remove();
    this.pinned = null;
  }

  // beside its block and inside the canvas; hidden while the block is out of view
  placePin() {
    if (!this.pinned) return;
    const [r] = this.rects([this.pinned.sid]);
    const { clientWidth: w, clientHeight: h } = this.element;
    const pin = this.pinned.element;
    pin.hidden = !r || r.x + r.width < 0 || r.x > w || r.y + r.height < 0 || r.y > h;
    if (pin.hidden) return;
    const at = pinAt(r, { width: pin.offsetWidth, height: pin.offsetHeight }, { width: w, height: h });
    pin.style.transform = `translate(${at.x}px, ${at.y}px)`;
  }

  view() {
    return { ...this.state };
  }

  fitted() {
    return fit(this.box, this.element.clientWidth, this.element.clientHeight);
  }

  // F
  fit() {
    this.stop();
    this.state = this.fitted();
    this.fitView = { ...this.state };
    this.apply(true);
    this.record();
  }

  // a new size: a view the person has not moved since it was fitted is fitted again, in place of
  // the old fit in [ and ]
  resized() {
    if (!this.fitView || !same(this.state, this.fitView)) return;
    const last = this.past.length - 1;
    this.state = this.fitted();
    if (same(this.past[last], this.fitView)) this.past[last] = { ...this.state };
    this.fitView = { ...this.state };
    this.apply();
  }

  // 0: 100 % about the centre
  actual() {
    this.stop();
    const { clientWidth: w, clientHeight: h } = this.element;
    this.state = zoomAbout(this.state, w / 2, h / 2, 1 / this.state.zoom);
    this.apply(true);
    this.record();
  }

  // [ and ]; a wheel zoom not recorded yet is the view they step from
  back() {
    clearTimeout(this.wheelEnd);
    this.record();
    if (this.past.length < 2) return;
    this.stop();
    this.future.push(this.past.pop());
    this.state = { ...this.past[this.past.length - 1] };
    this.apply(true);
  }

  forward() {
    clearTimeout(this.wheelEnd);
    this.record();
    const next = this.future.pop();
    if (!next) return;
    this.stop();
    this.past.push(next);
    this.state = { ...next };
    this.apply(true);
  }

  // a view worth going back to: the end of each interaction
  record() {
    if (!same(this.past[this.past.length - 1], this.state)) {
      this.past.push({ ...this.state });
      if (this.past.length > 100) this.past.shift();
      this.future = [];
    }
  }

  // `person` when the person moved the view, not a redraw or Claude
  apply(person = false) {
    const { x, y, zoom } = place(this.state, this.box);
    this.sheet.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    // a jump places the rings at once; in a motion they scale with the drawing until it rests
    if (!this.element.classList.contains('moving')) this.placeRings();
    this.element.classList.toggle('low', zoom < LOW_ZOOM);
    this.element.classList.add('moving');
    clearTimeout(this.crisp);
    this.crisp = setTimeout(() => {
      this.element.classList.remove('moving');
      this.placeRings();
    }, CRISP_AFTER);
    if (this.id !== null) this.views.set(this.id, { ...this.state, fit: !!same(this.state, this.fitView) });
    this.placePin();
    this.onView?.(person);
  }

  stop() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.record();
    }
  }

  local(e) {
    const r = this.element.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    this.unhover();
    // a click after a pinch or a cancelled press is a click
    this.swallowClick = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest?.('.pin, .notice')) return;
    // a press that stops a coast only stops it: no click
    if (this.frame !== null) this.swallowClick = true;
    this.stop();
    // Shift-drag on paper draws a selection box instead of panning; the box starts once the press
    // moves, so a Shift-click (on a line: a new plot) stays a click on what is under it
    if (e.shiftKey && !e.target.closest?.('g.blk')) {
      this.boxing = { id: e.pointerId, start: this.local(e), box: null };
      return;
    }
    this.pointers.set(e.pointerId, this.local(e));
    this.start = this.local(e);
    this.samples = [{ t: e.timeStamp, ...this.start }];
    this.pinch = null;
  }

  move(e) {
    if (this.boxing?.id === e.pointerId) {
      const { start } = this.boxing;
      const p = this.local(e);
      if (!this.boxing.box) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < CLICK_SLOP) return;
        this.boxing.box = document.createElement('div');
        this.boxing.box.className = 'box';
        this.element.append(this.boxing.box);
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          // as in beginDrag
        }
      }
      const { box } = this.boxing;
      box.style.transform = `translate(${Math.min(start.x, p.x)}px, ${Math.min(start.y, p.y)}px)`;
      box.style.width = `${Math.abs(p.x - start.x)}px`;
      box.style.height = `${Math.abs(p.y - start.y)}px`;
      return;
    }
    const last = this.pointers.get(e.pointerId);
    if (!last) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') this.hover(e);
      return;
    }
    const p = this.local(e);
    // one finger in a frame scrolls the page, which takes it from the canvas (pointercancel)
    if (e.pointerType === 'touch' && this.pointers.size < 2 && this.framed()) {
      this.pointers.set(e.pointerId, p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const span = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (this.pinch) {
        this.state = zoomAbout(this.state, mid.x, mid.y, span / this.pinch.span);
        this.state.x += mid.x - this.pinch.mid.x;
        this.state.y += mid.y - this.pinch.mid.y;
        this.apply(true);
      }
      this.pinch = { mid, span };
      this.beginDrag(e);
      return;
    }
    if (!this.dragging) {
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < CLICK_SLOP) return;
      this.beginDrag(e);
    }
    this.state.x += p.x - last.x;
    this.state.y += p.y - last.y;
    this.apply(true);
    this.samples.push({ t: e.timeStamp, ...p });
    if (this.samples.length > 20) this.samples.shift();
  }

  // capture only once the press moves, so a plain click and double-click keep their targets
  beginDrag(e) {
    if (this.dragging) return;
    this.dragging = true;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that already ended cannot be captured; the drag goes on without it
    }
    this.element.classList.add('dragging');
  }

  up(e) {
    if (this.boxing?.id === e.pointerId) {
      const { start, box } = this.boxing;
      this.boxing = null;
      // a press that did not move drew no box: its click goes on (on paper the selection stays)
      if (!box) return;
      box.remove();
      const p = this.local(e);
      this.swallowClick = true;
      const hits = boxHits({ x: start.x, y: start.y, width: p.x - start.x, height: p.y - start.y }, this.rects());
      this.select(hits);
      this.onSelect(hits, hits[hits.length - 1] ?? null);
      return;
    }
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size > 0) {
      // one finger of a pinch lifted: carry on panning with the other
      this.pinch = null;
      const [p] = this.pointers.values();
      this.samples = [{ t: e.timeStamp, ...p }];
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    this.swallowClick = true;
    this.element.classList.remove('dragging');
    const velocity = release(this.samples, e.timeStamp);
    if (!reducedMotion() && Math.hypot(velocity.x, velocity.y) >= MIN_COAST) {
      this.coast(velocity);
    } else {
      this.record();
    }
  }

  coast(velocity) {
    let before = performance.now();
    const step = (now) => {
      const dt = Math.min((now - before) / 1000, 0.05);
      before = now;
      const next = coast(this.state, velocity, dt);
      this.state = next.view;
      velocity = next.velocity;
      this.apply(true);
      if (velocity.x !== 0 || velocity.y !== 0) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = null;
        this.record();
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  // a short hint in the middle of the canvas
  say(text) {
    this.hint.textContent = text;
    this.hint.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => (this.hint.hidden = true), HINT_FOR);
  }

  wheel(e) {
    // in a frame the page scrolls past the canvas, and says how it zooms
    if (!wheelZooms(this.framed(), e)) {
      this.say(zoomHint(MAC));
      return;
    }
    this.hint.hidden = true;
    e.preventDefault();
    this.unhover();
    this.stop();
    // lines and pages count as 16 px and a screen height
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.element.clientHeight : 1;
    const p = this.local(e);
    this.state = zoomAbout(this.state, p.x, p.y, wheelFactor(e.deltaY * unit, e.ctrlKey));
    this.apply(true);
    clearTimeout(this.wheelEnd);
    this.wheelEnd = setTimeout(() => this.record(), 300);
  }
}
