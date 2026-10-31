/*! readlog beacon. Phase 1: measurement layers L0 to L2.
 *
 *  No dependencies, no build step, ES5 syntax so it parses everywhere.
 *  Nothing is written to the reader's device: no cookies, no localStorage,
 *  no sessionStorage, no IndexedDB. That property is what removes the
 *  consent banner, so it is load-bearing and not a detail.
 *
 *  Every path is wrapped so a failure here can never break the page.
 */
(function () {
  "use strict";
  try {
    var script = document.currentScript;
    if (!script) return;

    var endpoint = script.getAttribute("data-endpoint");
    var site = script.getAttribute("data-site");
    if (!endpoint || !site) return;

    // Global Privacy Control is honoured by not beaconing at all, not by
    // sending a flag that says so. Zero requests leave this page.
    if (navigator.globalPrivacyControl === true) return;

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

    function qp(name) {
      try {
        var v = new URLSearchParams(location.search).get(name);
        return v ? v : null;
      } catch (e) { return null; }
    }

    function mq(q) {
      try { return !!(window.matchMedia && window.matchMedia(q).matches); }
      catch (e) { return false; }
    }

    function tz() {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
      catch (e) { return null; }
    }

    function num(v) {
      return (typeof v === "number" && isFinite(v)) ? v : null;
    }

    function send(obj) {
      var body;
      try { body = JSON.stringify(obj); } catch (e) { return false; }
      try {
        if (navigator.sendBeacon) {
          // A text/plain blob is a CORS-simple request, so the browser sends
          // it with no preflight. Declaring application/json would cost an
          // OPTIONS round trip on every single pageview.
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

    var id = hex16();

    // The view id lives in this tab and nowhere else. Phase 2's pulses reuse
    // it to link a reading record to its pageview.
    window.__rl = { vid: id, sent: false };

    window.__rl.sent = send({
      t: "view",
      v: 1,
      sid: site,
      vid: id,
      p: location.pathname,
      ti: document.title || null,
      r: document.referrer || null,
      us: qp("utm_source"),
      um: qp("utm_medium"),
      uc: qp("utm_campaign"),
      uo: qp("utm_content"),
      ut: qp("utm_term"),
      vw: num(window.innerWidth),
      vh: num(window.innerHeight),
      sw: num(window.screen && window.screen.width),
      sh: num(window.screen && window.screen.height),
      dpr: num(window.devicePixelRatio),
      tz: tz(),
      lang: navigator.language || null,
      cs: mq("(prefers-color-scheme: dark)") ? "dark" : "light",
      rm: mq("(prefers-reduced-motion: reduce)"),
      conn: (navigator.connection && navigator.connection.effectiveType) || null,
      wd: navigator.webdriver === true
    });
  } catch (e) { /* never break the page */ }
})();
