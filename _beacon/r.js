/*! readlog reader: how one post is read, loaded by the ask (a.js) after a press.
 *  es5 like b.js; nothing stored on the device; cumulative records, one row per read id;
 *  every path wrapped so the page never breaks.
 */
(function () {
  "use strict";
  try {
    // one reader per page view
    if (window.__rlRead) return;

    var script = document.currentScript;
    if (!script) return;
    var endpoint = script.getAttribute("data-endpoint");
    var site = script.getAttribute("data-site");
    if (!endpoint || !site) return;
    if (navigator.globalPrivacyControl === true) return;
    if (window.self !== window.top) return;

    var main = document.querySelector("main");
    if (!main || !window.IntersectionObserver || !window.performance) return;

    var TICK_MS = 1000;
    var IDLE_MS = 5000;
    var SLICE_CAP_MS = 10000;
    var FLUSH_MS = 15000;
    var MAX_EVENTS = 200;
    var MAX_BLOCKS = 2000;
    var MAX_BODY = 16384;
    var DEMO = ".tali-js-cell, .tali-input, figure canvas";

    function hex16() {
      var b = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(b);
      } else {
        for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
      }
      var s = "";
      for (var i = 0; i < b.length; i++) s += (b[i] + 0x100).toString(16).slice(1);
      return s;
    }

    function now() { return performance.now(); }

    // listeners, timers and the observer run outside the outer try
    function safe(fn) {
      return function (e) { try { fn(e); } catch (x) { /* never break the page */ } };
    }

    function clip(s, n) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n); }

    // body blocks: outermost [data-block-id] in main, minus taliesin's own
    // (back link, title block, references)
    var blocks = [];
    var byId = Object.create(null);
    var all = main.querySelectorAll("[data-block-id]");
    var sectionId = "tali-title-block";
    var sectionLabel = "Intro";
    for (var i = 0; i < all.length && blocks.length < MAX_BLOCKS; i++) {
      var el = all[i];
      var id = el.getAttribute("data-block-id");
      var outer = el.parentElement;
      while (outer && outer !== main && !outer.hasAttribute("data-block-id")) outer = outer.parentElement;
      if (!id || id.indexOf("tali-") === 0 || (outer && outer !== main)) continue;
      var tag = el.tagName.toLowerCase();
      // a heading starts its own section
      if (tag === "h2" || tag === "h3" || tag === "h4") {
        sectionId = id;
        sectionLabel = clip(el.textContent, 80);
      }
      var rec = { el: el, id: id, ord: blocks.length, kind: tag, section: sectionId,
        label: sectionLabel, on: false, vis: 0, enters: 0, first: null };
      blocks.push(rec);
      byId[id] = rec;
    }
    var lastBlock = blocks[blocks.length - 1];

    var t0 = now();
    var rid = hex16();
    var ref = document.referrer ? document.referrer.slice(0, 1024) : null;
    var eng = 0, unf = 0, dn = 0, dms = 0;
    var maxRec = null, lastRec = null, end = false;
    var pending = [];
    var demoUsed = Object.create(null);
    var manifestSent = false;
    var manifestDropped = false;
    var lastKey = "";
    var stopped = false;

    // attention: visible, focused, and input in the last 5 s (the press counts)
    var lastInput = t0;
    var lastSample = t0;
    var attended = false;
    var unfocused = false;

    function sample() {
      var t = now();
      // each counted slice is capped, so a sleeping phone adds at most 10 s
      var slice = Math.min(Math.max(t - lastSample, 0), SLICE_CAP_MS);
      if (attended) credit(slice, lastSample - t0);
      else if (unfocused) unf += slice;
      lastSample = t;
      var visible = document.visibilityState === "visible";
      var focus = document.hasFocus();
      attended = visible && focus && t - lastInput < IDLE_MS;
      unfocused = visible && !focus;
    }

    // engaged time, and block time weighted by the share of the viewport
    function credit(slice, sliceStart) {
      eng += slice;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (!vh) return;
      var demoInView = false;
      var deepest = null;
      for (var k = 0; k < blocks.length; k++) {
        var b = blocks[k];
        if (!b.on) continue;
        var r = b.el.getBoundingClientRect();
        var h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
        if (h <= 0) continue;
        b.vis += slice * Math.min(h / vh, 1);
        if (b.first === null) b.first = Math.round(sliceStart);
        if (!demoInView && (b.el.matches(DEMO) || b.el.querySelector(DEMO))) demoInView = true;
        deepest = b;
      }
      if (demoInView) dms += slice;
      if (deepest) {
        lastRec = deepest;
        if (!maxRec || deepest.ord > maxRec.ord) maxRec = deepest;
        if (deepest === lastBlock) end = true;
      }
    }

    var io = new IntersectionObserver(safe(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        var b = byId[entries[k].target.getAttribute("data-block-id")];
        if (!b) continue;
        if (entries[k].isIntersecting && !b.on) b.enters++;
        b.on = entries[k].isIntersecting;
      }
    }), { threshold: [0, 0.25, 0.5, 0.75, 1] });
    for (var n = 0; n < blocks.length; n++) io.observe(blocks[n].el);

    // the outermost block around an element, or null outside any block
    function blockIdOf(node) {
      var found = null;
      for (var p = node; p && p.getAttribute; p = p.parentElement) {
        if (p.hasAttribute("data-block-id")) found = p.getAttribute("data-block-id");
      }
      return found;
    }

    function addEvent(kind, blockId, host) {
      pending.push([Math.round(now() - t0), kind, blockId, host]);
    }

    function onInput() {
      lastInput = now();
      if (!attended) sample();
    }

    function onDemo(e) {
      var d = e.target && e.target.closest ? e.target.closest(DEMO) : null;
      if (!d) return;
      dn++;
      var blockId = blockIdOf(d);
      if (!demoUsed[blockId]) {
        demoUsed[blockId] = true;
        addEvent("demo", blockId, null);
      }
    }

    // onward clicks; a jump within this page is not one
    function onClick(e) {
      if (e.type === "auxclick" && e.button !== 1) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || typeof a.href !== "string") return;
      var here = location.href.split("#")[0];
      if (a.href.indexOf("#") !== -1 && a.href.split("#")[0] === here) return;
      var kind = "outbound";
      if (a.closest(".tali-references")) kind = "reference";
      else if (a.protocol === location.protocol && a.host === location.host) kind = "internal";
      addEvent(kind, blockIdOf(a), a.hostname || null);
    }

    function send(body) {
      try {
        if (navigator.sendBeacon) {
          // text/plain keeps the request CORS-simple: no preflight
          var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
          if (navigator.sendBeacon(endpoint, blob)) return true;
        }
      } catch (e) { /* fall through to fetch */ }
      try {
        fetch(endpoint, {
          method: "POST",
          body: body,
          keepalive: true,
          credentials: "omit",
          headers: { "Content-Type": "text/plain;charset=UTF-8" }
        });
        return true;
      } catch (e) { return false; }
    }

    function flush(seen, periodic) {
      if (stopped) return;
      sample();
      var b = [];
      for (var k = 0; k < blocks.length; k++) {
        var rec = blocks[k];
        var vis = Math.round(rec.vis);
        if (vis > 0) b.push([rec.id, vis, rec.enters, rec.first]);
      }
      var msg = {
        t: "read", v: 1, sid: site, rid: rid, p: location.pathname, r: ref,
        eng: Math.round(eng), unf: Math.round(unf),
        maxb: maxRec ? maxRec.id : null, lastb: lastRec ? lastRec.id : null,
        end: end, seen: seen, dn: dn, dms: Math.round(dms), b: b
      };
      // a background or unfocused tab must not spend the rate limit on repeats;
      // unfocused time alone rides with the next flush that goes
      var key = JSON.stringify([msg.eng, msg.maxb, msg.lastb, msg.end, msg.dn, msg.dms, b]);
      if (periodic && key === lastKey && !pending.length && manifestSent) return;
      if (!manifestSent && !manifestDropped) {
        msg.m = [];
        for (var j = 0; j < blocks.length; j++) {
          var x = blocks[j];
          var text = String(x.el.innerText || x.el.textContent || "").trim();
          msg.m.push([x.id, x.kind, x.ord, text ? text.split(/\s+/).length : 0, x.section, x.label]);
        }
      }
      // fewer events, then no manifest, when the body would pass the server's size cap
      var count = Math.min(pending.length, MAX_EVENTS);
      var body;
      for (;;) {
        msg.ev = pending.slice(0, count);
        body = JSON.stringify(msg);
        if (new Blob([body]).size <= MAX_BODY) break;
        if (count > 0) {
          count = count >> 1;
        } else if (msg.m) {
          // a refused flush loses the read; the manifest is not retried
          delete msg.m;
          manifestDropped = true;
          count = Math.min(pending.length, MAX_EVENTS);
        } else {
          break;
        }
      }
      if (send(body)) {
        pending.splice(0, count);
        manifestSent = true;
        lastKey = key;
      }
    }

    var bound = [];
    function on(target, type, fn, capture) {
      var handler = safe(fn);
      target.addEventListener(type, handler, capture ? { capture: true, passive: true } : false);
      bound.push([target, type, handler, !!capture]);
    }

    var inputs = ["scroll", "pointerdown", "pointermove", "keydown", "touchstart"];
    for (var q = 0; q < inputs.length; q++) on(document, inputs[q], onInput, true);
    on(document, "pointerdown", onDemo, true);
    on(document, "input", onDemo, true);
    on(document, "click", onClick, true);
    on(document, "auxclick", onClick, true);
    on(window, "focus", sample, false);
    on(window, "blur", sample, false);
    on(document, "visibilitychange", function () {
      if (document.visibilityState === "hidden") flush(false, false);
      else sample();
    }, false);
    // the final flush; no unload listener, so the page stays bfcache-able
    on(window, "pagehide", function () { flush(true, false); }, false);

    var tickTimer = setInterval(safe(sample), TICK_MS);
    var flushTimer = setInterval(safe(function () { flush(false, true); }), FLUSH_MS);
    sample();

    function stop() {
      try {
        if (stopped) return;
        flush(true, false);
        stopped = true;
        clearInterval(tickTimer);
        clearInterval(flushTimer);
        io.disconnect();
        for (var k = 0; k < bound.length; k++) {
          bound[k][0].removeEventListener(bound[k][1], bound[k][2], bound[k][3]);
        }
        bound = [];
      } catch (e) { /* never break the page */ }
    }

    window.__rlRead = { stop: stop };
  } catch (e) { /* never break the page */ }
})();
