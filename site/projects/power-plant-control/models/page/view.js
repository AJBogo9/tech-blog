// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// the canvas's view maths, free of the DOM; a view is { x, y, zoom } in the model's coordinates:
// screen = model * zoom + (x, y), so it stays put when a save moves the drawing's edges

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// zoom by `factor`, keeping the world point under (px, py) where it is; a view already past a
// limit (a fit below 5 %) is not pulled back to it
export function zoomAbout(view, px, py, factor, min = 0.05, max = 20) {
  const zoom = clamp(view.zoom * factor, Math.min(min, view.zoom), Math.max(max, view.zoom));
  const k = zoom / view.zoom;
  return { x: px - (px - view.x) * k, y: py - (py - view.y) * k, zoom };
}

// the whole box visible and centred in width x height, at most `max`
export function fit(box, width, height, margin = 24, max = 2) {
  const room = (size) => Math.max(size - 2 * margin, 1);
  const zoom = Math.min(max, room(width) / Math.max(box.width, 1), room(height) / Math.max(box.height, 1));
  return {
    x: width / 2 - (box.x + box.width / 2) * zoom,
    y: height / 2 - (box.y + box.height / 2) * zoom,
    zoom,
  };
}

// px/s from the pointer samples { t (ms), x, y } of the last 80 ms; zero with fewer than two
export function release(samples, now) {
  const recent = samples.filter((s) => now - s.t <= 80);
  if (recent.length < 2) return { x: 0, y: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

// `dt` seconds of coasting: the velocity decays as exp(-friction t) and the view moves by its
// integral; below 10 px/s it stops
export function coast(view, velocity, dt, friction = 8) {
  const decay = Math.exp(-friction * dt);
  const travel = (1 - decay) / friction;
  let next = { x: velocity.x * decay, y: velocity.y * decay };
  if (Math.hypot(next.x, next.y) < 10) next = { x: 0, y: 0 };
  return {
    view: { x: view.x + velocity.x * travel, y: view.y + velocity.y * travel, zoom: view.zoom },
    velocity: next,
  };
}

// `id` when `systems` still has it, else its nearest parent in `last` (the previous outline) that
// `systems` has, else the root
export function keepOrParent(systems, last, id) {
  const now = new Set(systems.map((s) => s.id));
  const before = new Map(last.map((s) => [s.id, s.parent]));
  for (let at = id, steps = 0; at != null && steps <= last.length; at = before.get(at), steps++) {
    if (now.has(at)) return at;
  }
  return 'root';
}

// the sheet's transform: the sheet's (0, 0) is the drawing's origin, the model point `origin`
export function place(view, origin) {
  return { x: view.x + origin.x * view.zoom, y: view.y + origin.y * view.zoom, zoom: view.zoom };
}

// a tooltip of `size` beside the pointer: right of and below it by `gap`, flipped at the right
// and bottom edges, and never outside `bounds`
export function tooltipAt(pointer, size, bounds, gap = 12) {
  const along = (p, s, b) => {
    let at = p + gap;
    if (at + s > b) at = p - gap - s;
    return Math.max(0, Math.min(at, b - s));
  };
  return { x: along(pointer.x, size.width, bounds.width), y: along(pointer.y, size.height, bounds.height) };
}

// the blocks a selection box touches, the box drawn in any direction; rects are
// { sid, x, y, width, height } in the box's coordinates
export function boxHits(box, rects) {
  const [x0, x1] = [Math.min(box.x, box.x + box.width), Math.max(box.x, box.x + box.width)];
  const [y0, y1] = [Math.min(box.y, box.y + box.height), Math.max(box.y, box.y + box.height)];
  return rects
    .filter((r) => r.x <= x1 && r.x + r.width >= x0 && r.y <= y1 && r.y + r.height >= y0)
    .map((r) => r.sid);
}

// a note of `size` beside a block's screen rectangle: right of it by `gap`, left of it when it
// would run past the right edge and fits there, and never outside `bounds`
export function pinAt(block, size, bounds, gap = 8) {
  let x = block.x + block.width + gap;
  const left = block.x - gap - size.width;
  if (x + size.width > bounds.width && left >= 0) x = left;
  const inside = (v, s, b) => Math.max(0, Math.min(v, b - s));
  return { x: inside(x, size.width, bounds.width), y: inside(block.y, size.height, bounds.height) };
}

// a change mark's frame width in drawing units, as style.css draws it
export const CHANGE_FRAME = { added: 2, changed: 2, moved: 1.5 };

// a block's frame width: its change mark's (`change` is added, changed, moved or none), else the
// stored `stroke-width` attribute, else 1
export function frameWidth(stored, change) {
  return CHANGE_FRAME[change] ?? (Number(stored) || 1);
}

// the ring round a block's body at `zoom`: `width` screen px wide and `gap` screen px outside a
// frame `frame` drawing units wide, which scales with the drawing; a rectangle or circle grows by
// that much, a body without area (a line) gets the rectangle round its ends. Shapes are
// { kind: 'rect', x, y, width, height }, { kind: 'circle', cx, cy, r }, { kind: 'line', points };
// `stroke` is the ring's width in drawing units
export function ringAround(body, zoom, frame = 1, width = 2, gap = 2) {
  const grow = frame / 2 + (gap + width / 2) / zoom;
  const stroke = width / zoom;
  if (body.kind === 'circle') return { kind: 'circle', cx: body.cx, cy: body.cy, r: body.r + grow, stroke };
  let { x, y, width: w, height: h } = body;
  if (body.kind === 'line') {
    const xs = body.points.map((p) => p.x);
    const ys = body.points.map((p) => p.y);
    [x, y] = [Math.min(...xs), Math.min(...ys)];
    [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y];
  }
  return { kind: 'rect', x: x - grow, y: y - grow, width: w + 2 * grow, height: h + 2 * grow, stroke };
}

// in a frame of a page that scrolls past it, the wheel is that page's: it zooms with Ctrl or Cmd held,
// and a trackpad's pinch comes as a wheel with Ctrl
export const wheelZooms = (framed, { ctrlKey, metaKey }) => !framed || ctrlKey || metaKey;

// a trackpad's pinch comes as wheel events with Ctrl and steps of a few px; a wheel's notch with Ctrl held
// (how a frame zooms) moves 40 px or more, a line of Firefox's 16 px times three among them
const PINCH_STEP = 40;

/**
 * how much one wheel event zooms: a pinch's small steps at a pinch's rate, any other step, Ctrl held
 * or not, as a wheel's notch
 * @param {number} delta the step in px, down positive
 * @param {boolean} ctrlKey
 */
export function wheelFactor(delta, ctrlKey) {
  const rate = ctrlKey && Math.abs(delta) < PINCH_STEP ? 0.01 : 0.0015;
  return Math.exp(-delta * rate);
}

// what a wheel that scrolled the page past the frame says, Cmd on a Mac
export const zoomHint = (mac) => `${mac ? 'Cmd' : 'Ctrl'} + scroll to zoom`;

// what a finger that scrolled the page past the frame says
export const TWO_FINGERS = 'Use two fingers to move the diagram';
