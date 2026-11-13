
// --- Enhancer registry (the public extension hook) ---------------------------
// An *enhancer* is `fn(root)` that decorates freshly-mounted DOM. An extension's
// JS opts in with `window.taliEnhancers.register(fn)`; the registered fn then runs
// after every (re)mount in the live preview, on DOMContentLoaded in the static
// build, and once immediately if it registers after the page is already mounted
// (an extension script loaded in `include-after-body`). Enhancers MUST be
// idempotent — guard with a data-attribute — since they re-run on every change.
// The built-in copy-button / etc. below (and mermaid, in its own
// mermaid.js) register through the exact same API, so a third-party enhancer is
// indistinguishable from core's.
(function () {
  if (window.taliEnhancers) return;
  /** @type {Array<(root: ParentNode) => void>} */
  var list = [];
  var mounted = false;
  /** @param {(root: ParentNode) => void} fn @param {ParentNode | null} [root] */
  function run1(fn, root) {
    try { fn(root || document); } catch (e) { console.error('[taliesin] enhancer failed', e); }
  }
  window.taliEnhancers = {
    register: function (fn) {
      if (typeof fn === 'function') {
        list.push(fn);
        if (mounted) run1(fn, document); // late registration: catch up on existing DOM
      }
      return this;
    },
    run: function (root) {
      mounted = true;
      for (var i = 0; i < list.length; i++) run1(list[i], root);
    },
  };
  var enh = window.taliEnhancers; // captured non-undefined for the entry-point closure
  // The single entry point every caller uses (live client, static build, reveal).
  window.taliEnhanceCode = function (root) { enh.run(root); };
})();

// Shared clipboard helper: navigator.clipboard in a secure context, with a hidden-textarea
// execCommand fallback for insecure contexts (file://, plain http). Never throws;
// calls onOk on success, onFail (optional) on total failure.
/** @param {string} text @param {() => void} onOk @param {() => void} [onFail] */
function taliCopyText(text, onOk, onFail) {
  function legacy() {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var done = document.execCommand('copy'); document.body.removeChild(ta);
      return done;
    } catch (e) { return false; }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onOk, function () { if (legacy()) onOk(); else if (onFail) onFail(); });
  } else if (legacy()) { onOk(); }
  else if (onFail) { onFail(); }
}

// Visible focusable descendants of `container`, in DOM order, for the modal trap below. The
// `el === document.activeElement` clause keeps a zero-size element that currently holds focus.
var TALI_FOCUS_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** @param {Element} container @returns {HTMLElement[]} */
function taliFocusables(container) {
  return /** @type {HTMLElement[]} */ ([].slice.call(container.querySelectorAll(TALI_FOCUS_SEL))).filter(function (el) {
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
  });
}

// Shared modal focus trap: while a modal is open, confine Tab/Shift+Tab to `container`, mark it
// aria-modal, and (on release) restore focus to the opener IF focus is still inside (a keyboard
// or programmatic close) — not when the user clicked elsewhere. Used, via this global, by the
// Cmd-K palette in search.js and the book's chapter drawer. Returns release().
window.taliFocusTrap = window.taliFocusTrap || function (container, initial) {
  var prev = /** @type {HTMLElement | null} */ (document.activeElement);
  container.setAttribute('aria-modal', 'true');
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key !== 'Tab') return;
    var f = taliFocusables(container);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!container.contains(a)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey) { if (a === first) { e.preventDefault(); last.focus(); } }
    else if (a === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  try { /** @type {HTMLElement} */ (initial || taliFocusables(container)[0] || container).focus(); } catch (e) {}
  return function () {
    document.removeEventListener('keydown', onKey, true);
    container.removeAttribute('aria-modal');
    if (container.contains(document.activeElement) && prev && prev.focus) {
      try { prev.focus(); } catch (e) {}
    }
  };
};

// Skip-to-content link: a visually-hidden-until-focused link that jumps keyboard /
// screen-reader users past the chrome to the content. Build + site pages now emit the
// link + a focusable `<main id="tali-main" tabindex="-1">` SERVER-SIDE (page.rs), so it
// works with JS off; this only enhances. The live `#tali-root` mount has no server `<main>`,
// so the pair is synthesized there. Read-only, idempotent.
function taliInitSkipLink() {
  if (window.__taliSkipLink) return;
  // `const` (not `var`) so the null-narrowing below survives into the deferred
  // focus closure; the element is mutated in place, never reassigned.
  const main = /** @type {HTMLElement | null} */ (
    document.querySelector('main') ||
    document.getElementById('tali-root') ||
    document.querySelector('[data-block-id]')
  );
  if (!main) return;
  window.__taliSkipLink = true;
  if (!main.id) main.id = 'tali-main';
  main.setAttribute('tabindex', '-1');
  // Move focus (not just scroll) so a keyboard reader continues from the content. Wire
  // this onto the server-rendered link too (it ships as a plain anchor), so this path
  // enhances both the server-emitted and the JS-synthesized link.
  var focusMain = function () { setTimeout(function () { main.focus(); }, 0); };
  var existing = document.querySelector('.tali-skip');
  if (existing) { existing.addEventListener('click', focusMain); return; }
  var a = document.createElement('a');
  a.className = 'tali-skip';
  a.href = '#' + main.id;
  a.textContent = 'Skip to content';
  a.addEventListener('click', focusMain);
  document.body.insertBefore(a, document.body.firstChild);
}

// --- Built-in enhancers (registered through the same public API) -------------

// Code blocks are highlighted server-side; the client only adds a copy button.
/** @param {ParentNode | null} [root] */
function taliCopyButtons(root) {
  var blocks = /** @type {NodeListOf<HTMLElement>} */ (
    (root || document).querySelectorAll('pre > code')
  );
  blocks.forEach(function (code) {
    const pre = code.parentElement; // const so the null-guard survives into the scroll closure
    if (!pre || pre.dataset.enhanced) return;
    pre.dataset.enhanced = '1';
    // (Code is highlighted server-side; the client only adds the copy button.)
    // GitHub/Claude-style copy glyph (Octicons copy), swapping to a check on success.
    var copyIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
    var checkIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L1.22 8.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>';
    var btn = document.createElement('button');
    btn.className = 'tali-copy';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = copyIcon;
    btn.addEventListener('click', function () {
      // Secure context → navigator.clipboard; file:// / plain http → execCommand fallback.
      taliCopyText(code.innerText, function () {
        btn.innerHTML = checkIcon;
        btn.classList.add('tali-copied');
        btn.setAttribute('aria-label', 'Copied');
        setTimeout(function () { btn.innerHTML = copyIcon; btn.classList.remove('tali-copied'); btn.setAttribute('aria-label', 'Copy code'); }, 1200);
      });
    });
    pre.appendChild(btn);
    // The button is absolutely positioned inside the <pre>, which is the horizontal
    // scroll container, so it would scroll away with the code. Counter-translate it by
    // the scroll offset to keep it pinned to the visible top-right corner.
    pre.addEventListener('scroll', function () {
      btn.style.transform = pre.scrollLeft ? 'translateX(' + pre.scrollLeft + 'px)' : '';
    }, { passive: true });
  });
}

// Register the built-ins through the public API.
var reg = window.taliEnhancers;
if (reg) {
  reg.register(taliCopyButtons);
  reg.register(function () { taliInitSkipLink(); });
}

// --- Keyboard-scrollable overflow (WCAG 2.1.1) -------------------------------
// A wide `<pre>` or `<table>` is a horizontal scroll container, but a mouse-only
// scroll region is a keyboard trap for content: a keyboard user can't reach the
// clipped columns. Making the container focusable (`tabindex="0"`) lets the arrow
// keys scroll it, and on a `<pre>` `role="region"` + a name announces it. We only tag
// containers that ACTUALLY overflow (so non-wide blocks don't clutter the tab order or
// the landmark list), and re-evaluate on resize. Idempotent: keyed on data-scroll-a11y.
//
// The role goes on the `<pre>` ONLY. An explicit `role` REPLACES an element's implicit
// one, and `<pre>` has none worth keeping (`generic`), while `<table>` has `table`: the
// context role its own `<tr>`/`<th>`/`<td>` descendants require. `role="region"` on the
// table therefore announced "scrollable table region" and then handed over flat text,
// with no row/column count, no header association and no table-navigation keys, on
// exactly the wide tables where a reader needs them most (live on the guide's
// front-matter reference). The affordance a keyboard user actually needs is the
// `tabindex`, and a table already announces itself as a table, so nothing is lost by
// leaving its role alone.
(function () {
  if (!window.taliEnhancers) return;
  /** @param {Element} el */
  function isTable(el) {
    return el.tagName === 'TABLE';
  }
  /** @param {Element} el */
  function label(el) {
    return isTable(el) ? 'Scrollable table' : 'Scrollable code';
  }
  /** @param {Element} el */
  function sync(el) {
    var overflows = el.scrollWidth - el.clientWidth > 1;
    var tagged = el.hasAttribute('data-scroll-a11y');
    if (overflows && !tagged) {
      // Don't clobber an author/runtime tabindex or role already present.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!isTable(el) && !el.hasAttribute('role')) el.setAttribute('role', 'region');
      // Never over a `<caption>` either: an `aria-label` OUTRANKS the caption in the
      // accessible-name computation, so labelling a captioned table would replace the
      // author's own "Table 1: ..." with a scroll affordance. A caption only names the
      // table once the `table` role survives, which is why this guard arrives with the
      // one above and not before it.
      if (!el.hasAttribute('aria-label') && !(isTable(el) && el.querySelector(':scope > caption'))) {
        el.setAttribute('aria-label', label(el));
      }
      el.setAttribute('data-scroll-a11y', '');
    } else if (!overflows && tagged) {
      // Shrunk back within its box: undo only what we added.
      if (el.getAttribute('tabindex') === '0') el.removeAttribute('tabindex');
      if (el.getAttribute('role') === 'region') el.removeAttribute('role');
      if (el.getAttribute('aria-label') === label(el)) el.removeAttribute('aria-label');
      el.removeAttribute('data-scroll-a11y');
    }
  }
  /** @type {string[]} */
  var roots = [];
  /** @param {ParentNode | null} [root] */
  function scan(root) {
    (root || document).querySelectorAll('pre, table').forEach(function (el) {
      // A mermaid diagram gets its own `overflow-x: auto` in base.css and is skipped
      // here to avoid double-tagging it; only tag the actual scroll box.
      if (el.classList && el.classList.contains('mermaid')) return;
      sync(el);
    });
  }
  var raf = 0;
  function onResize() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; scan(document); });
  }
  /** @param {ParentNode | null} [root] */
  function enhance(root) {
    scan(root);
    if (roots.indexOf('resize') === -1) {
      roots.push('resize');
      window.addEventListener('resize', onResize, { passive: true });
    }
  }
  window.taliEnhancers.register(enhance);
})();

;
// @ts-check
// Canonical TOC scrollspy: highlights the entry whose section currently sits
// just below the sticky navbar. Shared by two callers so the behaviour matches:
//   - the static build inlines this and lets it auto-init on load;
//   - the live preview rebuilds `#TOC` on every edit, then calls
//     window.taliInitTocSpy() to re-collect against the fresh links.
// Inlined as one <script>; not concatenated into the client.js bundle, but
// type-checked separately (web-client/jsconfig.json).
(function () {
  /** @typedef {{ link: Element, heading: HTMLElement }} TocEntry */
  var raf = 0;
  /** @type {TocEntry[]} in document order */
  var entries = [];
  /** @type {TocEntry | null} */
  var active = null;
  var installed = false;

  // The activation line sits exactly where a clicked TOC link lands, which the browser
  // decides from the heading's own `scroll-margin-top`. Read that, rather than measuring
  // a navbar: `.tali-site-nav` is the WEBSITE chrome and a book emits `.tali-book-topbar`
  // instead, so querying the navbar returned 0 on every book page and the highlight
  // lagged a whole section behind the reader. `scroll-margin-top` is already
  // `--tali-nav-h + 1rem` under both chromes, and 1rem on a standalone page.
  var lineOffset = 16;
  // Sampled here, once per (re)init, not in `update()` — that runs every rAF while
  // scrolling and `getComputedStyle` forces a style flush.
  function sampleLine() {
    var first = entries.length ? entries[0].heading : null;
    var px = first ? parseFloat(getComputedStyle(first).scrollMarginTop) : NaN;
    lineOffset = isNaN(px) ? 16 : px;
  }
  function line() {
    return lineOffset;
  }

  function collect() {
    var toc = document.getElementById("TOC");
    entries = [];
    if (!toc) return;
    toc.querySelectorAll("a[href^='#']").forEach(function (link) {
      var raw = (link.getAttribute("href") || "").slice(1);
      // An id may hold a bare `%` (`{#fifty%off}`), which is no escape at all: decoding it
      // threw, so no entry on the page ever lit up. Such an href IS the id.
      var id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch (e) {}
      var h = id && (document.getElementById(id) || document.getElementById(raw));
      if (h) entries.push({ link: link, heading: h });
    });
    sampleLine();
  }

  function update() {
    var toc = document.getElementById("TOC");
    if (!toc || !entries.length) return;
    var ln = line();
    var doc = document.documentElement;
    // Within one viewport of the bottom the last heading can never reach the
    // line, so pin the final entry — otherwise the last section never lights up.
    var atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
    /** @type {TocEntry | null} */
    var cur = null;
    if (atBottom) {
      cur = entries[entries.length - 1];
    } else {
      for (var i = 0; i < entries.length; i++) {
        // 1px tolerance: scroll offsets are quantized to device pixels, so a heading
        // the reader has just landed on (via a TOC click, a deep link, or resume) can
        // measure a hair BELOW the line and leave the previous entry highlighted —
        // the same visible off-by-one the activation line itself was causing.
        if (entries[i].heading.getBoundingClientRect().top - ln > 1) break;
        cur = entries[i];
      }
    }
    // cur stays null while above the first heading, so nothing is highlighted in
    // the intro (rather than prematurely lighting the first entry).
    if (cur === active) return;
    active = cur;
    entries.forEach(function (e) {
      e.link.classList.toggle("tali-toc-active", e === cur);
      // The highlight is visual only; this is the same fact for assistive tech.
      if (e === cur) e.link.setAttribute("aria-current", "true");
      else e.link.removeAttribute("aria-current");
    });
    // Collapse: expand only the active entry's branch (its <li> and ancestors), so
    // a long TOC shows top-level entries plus the current section's subsections.
    /** @type {Element[]} */
    var open = [];
    // Walk element ancestors (the TOC links only ever nest inside element <li>/<ul>,
    // so `parentElement` is equivalent to `parentNode` here and types cleanly).
    for (var node = cur && cur.link.parentElement; node && node.id !== "TOC"; node = node.parentElement) {
      if (node.tagName === "LI") open.push(node);
    }
    Array.prototype.forEach.call(toc.getElementsByTagName("li"), function (li) {
      li.classList.toggle("tali-toc-expanded", open.indexOf(li) !== -1);
    });
    if (cur) {
      // keep the active link in view when the TOC is its own scroll area
      var lr = cur.link.getBoundingClientRect();
      var tr = toc.getBoundingClientRect();
      if (lr.top < tr.top) toc.scrollTop -= tr.top - lr.top + 8;
      else if (lr.bottom > tr.bottom) toc.scrollTop += lr.bottom - tr.bottom + 8;
    }
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      update();
    });
  }

  function init() {
    if (!document.getElementById("TOC")) return; // no TOC on this page
    collect();
    active = null;
    if (!installed) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      installed = true;
    }
    update();
  }

  window.taliInitTocSpy = init;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
