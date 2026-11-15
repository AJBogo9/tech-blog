/*! readlog ask: one line on a post; a press loads r.js for this page view.
 *  es5 like b.js; before the press it reads nothing from the device and sends nothing;
 *  every path wrapped so the page never breaks.
 */
(function () {
  "use strict";
  try {
    var script = document.currentScript;
    if (!script) return;

    var site = script.getAttribute("data-site");
    var endpoint = script.getAttribute("data-endpoint");
    var reader = script.getAttribute("data-reader");
    if (!site || !endpoint || !reader) return;

    // gpc: the ask is never shown
    if (navigator.globalPrivacyControl === true) return;
    // a framed copy of a post is not a page someone opened
    if (window.self !== window.top) return;

    // taliesin's title block, else the first heading's parent
    var anchor = document.querySelector("header.tali-title-block");
    if (!anchor) {
      var h1 = document.querySelector("h1");
      anchor = h1 && h1.parentNode;
    }
    if (!anchor || !anchor.parentNode) return;

    var line = document.createElement("p");
    line.className = "rl-ask";
    line.setAttribute("aria-live", "polite");
    line.style.color = "var(--tali-muted, #6b6b6b)";
    line.style.fontSize = "inherit";

    // a button that looks like a link, with a 24 x 24 px hit area
    function linkButton(text, onPress) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      var s = b.style;
      s.font = "inherit";
      s.color = "inherit";
      s.background = "none";
      s.border = "0";
      s.margin = "0";
      s.padding = "0";
      s.minWidth = "24px";
      s.minHeight = "24px";
      s.textDecoration = "underline";
      s.cursor = "pointer";
      b.addEventListener("click", onPress);
      return b;
    }

    function show(before, button, after) {
      while (line.firstChild) line.removeChild(line.firstChild);
      line.appendChild(document.createTextNode(before));
      if (button) line.appendChild(button);
      if (after) line.appendChild(document.createTextNode(after));
    }

    var started = false;

    function start() {
      try {
        // one reader per page view
        if (started || window.__rlRead) return;
        started = true;
        var stopButton = linkButton("Stop", stop);
        show("Thanks, sharing how you read this page. ", stopButton, "");
        stopButton.focus();
        var s = document.createElement("script");
        s.src = reader;
        s.setAttribute("data-site", site);
        s.setAttribute("data-endpoint", endpoint);
        document.body.appendChild(s);
      } catch (e) { /* never break the page */ }
    }

    function stop() {
      try {
        if (window.__rlRead) {
          window.__rlRead.stop();
        } else {
          // r.js has not run yet: the guard keeps it from starting
          window.__rlRead = { stop: function () {} };
        }
        show("Sharing stopped. Thanks for your help.", null, "");
      } catch (e) { /* never break the page */ }
    }

    show("Help me improve this post: ", linkButton("share how you read it", start),
      ". Nothing is stored on your device.");
    anchor.parentNode.insertBefore(line, anchor.nextSibling);
  } catch (e) { /* never break the page */ }
})();
