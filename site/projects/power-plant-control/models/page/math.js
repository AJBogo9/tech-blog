// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Andreas Bogossian
// @ts-check

// maths in notes: MATLAB saves an equation in a rich-text note as `<math>$...$</math>`, and the
// drawing marks its LaTeX as `tspan.tex` and the note's box as `data-box`. KaTeX, loaded on first
// use, typesets such a note in that box; the drawn source stays when KaTeX cannot

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';
const DELIMITERS = [
  ['$$', '$$'],
  ['$', '$'],
  ['\\(', '\\)'],
  ['\\[', '\\]'],
];

/**
 * the LaTeX inside one pair of delimiters, which KaTeX takes without them
 * @param {string} text
 */
export function texSource(text) {
  const s = text.trim();
  for (const [open, close] of DELIMITERS) {
    if (s.length >= open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
      return s.slice(open.length, s.length - close.length);
    }
  }
  return s;
}

/**
 * the runs of a drawn line of text, each where it sits: a tspan's `dy` moves the baseline, down for
 * a subscript and up for a superscript, and the run after it moves it back
 * @param {[string, number][]} parts each run's text and its dy
 * @returns {[string, '' | 'sub' | 'sup'][]}
 */
export function scriptRuns(parts) {
  let shift = 0;
  /** @type {[string, '' | 'sub' | 'sup'][]} */
  const runs = [];
  for (const [text, dy] of parts) {
    shift += dy;
    if (text) runs.push([text, shift > 0 ? 'sub' : shift < 0 ? 'sup' : '']);
  }
  return runs;
}

// MATLAB breaks lines with \\ in display style, which LaTeX ignores and KaTeX warns about
/** @param {string} code */
const strict = (code) => (code === 'newLineInDisplayMode' ? 'ignore' : 'warn');

/** @type {Promise<any> | null} */
let loading = null;

// KaTeX's script and stylesheet, once; a failed load is tried again at the next drawing
function load() {
  loading ??= Promise.all([
    new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('./vendor/katex/katex.min.css', import.meta.url).href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    }),
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/katex/katex.min.js', import.meta.url).href;
      script.onload = () => resolve(/** @type {any} */ (window).katex);
      script.onerror = reject;
      document.head.append(script);
    }),
  ]).then(
    ([, katex]) => katex,
    (e) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

/**
 * the colour a drawn text is in: its own fill, else the one the stylesheet gives what a lean
 * drawing left to it (`drawing_css` in tokens.css)
 * @param {Element | null | undefined} text
 * @param {(el: Element) => { fill: string }} [computed]
 * @returns {string}
 */
export function drawnFill(text, computed = (el) => getComputedStyle(el)) {
  if (!text) return '';
  return text.getAttribute('fill') ?? computed(text).fill ?? '';
}

/**
 * typeset the maths of every marked note under `root`
 * @param {ParentNode} root
 */
export async function typeset(root) {
  const notes = /** @type {SVGGElement[]} */ ([...root.querySelectorAll('g.ann.note[data-box]')]);
  const blocks = /** @type {SVGGElement[]} */ ([...root.querySelectorAll('g.blk[data-tex]')]);
  if (notes.length === 0 && blocks.length === 0) return;
  let katex;
  try {
    katex = await load();
  } catch {
    return;
  }
  // every colour read before the first foreignObject goes in: one style pass, not one per note or caption
  const pending = (/** @type {SVGGElement} */ g) => g.isConnected && !g.classList.contains('typeset');
  /** @type {Map<SVGGElement, string>} */
  const inks = new Map();
  for (const g of notes.filter(pending)) inks.set(g, drawnFill(g.querySelector('text.note')));
  for (const g of blocks.filter(pending)) inks.set(g, captionInk(g));
  typesetNotes(notes, katex, inks);
  typesetCaptions(blocks, katex, inks);
}

/**
 * the colour a block's typeset caption takes: its drawn caption's; without one, its frame's stroke
 * attribute, else the page's ink (a computed stroke may be a change mark's)
 * @param {SVGGElement} g
 * @returns {string}
 */
function captionInk(g) {
  const caption = g.querySelector('text.caption');
  return caption ? drawnFill(caption) : (g.querySelector('rect.body')?.getAttribute('stroke') ?? '');
}

/**
 * each note's lines, its maths typeset, in the box MATLAB sized for it
 * @param {SVGGElement[]} notes
 * @param {any} katex
 * @param {Map<SVGGElement, string>} inks each note's colour, read before any note is typeset
 */
function typesetNotes(notes, katex, inks) {
  for (const g of notes) {
    if (!g.isConnected || g.classList.contains('typeset')) continue;
    const lines = [...g.querySelectorAll('text.note')];
    if (lines.length === 0) continue;
    const [x, y, width, height] = g.dataset.box.split(' ');
    const [h, v] = (g.dataset.align ?? 'left top').split(' ');
    const object = document.createElementNS(SVG, 'foreignObject');
    object.setAttribute('class', 'math');
    for (const [name, value] of Object.entries({ x, y, width, height })) object.setAttribute(name, value);
    const box = /** @type {HTMLDivElement} */ (document.createElementNS(HTML, 'div'));
    box.className = `math-note h-${h} v-${v}`;
    box.style.fontSize = `${lines[0].getAttribute('font-size') ?? 10}px`;
    box.style.color = inks.get(g) ?? '';
    for (const text of lines) {
      const row = document.createElementNS(HTML, 'div');
      for (const node of text.childNodes) {
        if (node instanceof Element && node.classList.contains('tex')) {
          const span = /** @type {HTMLSpanElement} */ (document.createElementNS(HTML, 'span'));
          try {
            // MATLAB draws equations in display style: the boxes R2026a gives the learning models'
            // equations match KaTeX's display style within 3 %, and its text style not at all
            katex.render(texSource(node.textContent ?? ''), span, { displayMode: true, output: 'html', strict });
          } catch (e) {
            // the source with KaTeX's reason; KaTeX's own error text sets a style attribute, which
            // the page's CSP refuses
            span.className = 'tex-error';
            span.title = String(e?.message ?? e);
            span.textContent = node.textContent;
          }
          row.append(span);
        } else {
          row.append(node.textContent ?? '');
        }
      }
      // an empty line keeps a line's height, as HTML's <p><br></p>
      if (!row.hasChildNodes()) row.append(document.createElementNS(HTML, 'br'));
      box.append(row);
    }
    object.append(box);
    g.append(object);
    g.classList.add('typeset');
  }
}

/**
 * a block's parameters typeset in place of its caption (`data-tex`), scaled to fit its frame as the
 * drawn caption is; the drawn caption stays when KaTeX cannot
 * @param {SVGGElement[]} blocks
 * @param {any} katex
 * @param {Map<SVGGElement, string>} inks each caption's colour, read before any caption is typeset
 */
function typesetCaptions(blocks, katex, inks) {
  const placed = [];
  for (const g of blocks) {
    if (!g.isConnected || g.classList.contains('typeset')) continue;
    const body = g.querySelector('rect.body');
    if (!body) continue;
    const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((a) => Number(body.getAttribute(a)));
    if (!(width > 0 && height > 0)) continue;
    const caption = g.querySelector('text.caption');
    const span = /** @type {HTMLSpanElement} */ (document.createElementNS(HTML, 'span'));
    try {
      katex.render(g.dataset.tex, span, { displayMode: true, output: 'html', strict });
    } catch {
      continue;
    }
    const object = document.createElementNS(SVG, 'foreignObject');
    // `caption` hides it below the zoom at which the drawn captions go
    object.setAttribute('class', 'caption math-caption');
    for (const [name, value] of Object.entries({ x, y, width, height })) object.setAttribute(name, String(value));
    const box = /** @type {HTMLDivElement} */ (document.createElementNS(HTML, 'div'));
    box.className = 'math-caption-box';
    box.style.fontSize = `${caption?.getAttribute('font-size') ?? 10}px`;
    box.style.color = inks.get(g) ?? '';
    box.append(span);
    object.append(box);
    g.append(object);
    placed.push({ g, span, width, height });
  }
  // measured after all are placed, so the layout is read once; 0.9 of the frame, as a drawn caption
  const sizes = placed.map(({ span }) => [span.offsetWidth, span.offsetHeight]);
  placed.forEach(({ g, span, width, height }, i) => {
    const [w, h] = sizes[i];
    if (w > 0 && h > 0) span.style.transform = `scale(${Math.min(1, (0.9 * width) / w, (0.9 * height) / h)})`;
    g.classList.add('typeset');
  });
}
