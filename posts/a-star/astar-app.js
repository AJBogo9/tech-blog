import { W, H, CELL, ROWS, COLS } from "./astar-constants.js";
import { appState } from "./astar-state.js";
import { initSearch, stepOnce, resetSearch } from "./astar-search.js";
import { generateMaze } from "./astar-maze.js";
import { draw } from "./astar-draw.js";

// ── persistent state + shared DOM nodes (created once) ───────────────────────
const p = { s: null, canvas: null, ctx: null, redraw: null, stopAnim: null };

export function renderApp() {
  const s = (() => {
    if (p.s) return p.s;

    // ── first-time init ───────────────────────────────────────────────────────
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = `display:block;width:100%;max-width:${W}px;cursor:crosshair`;

    const s = appState();
    Object.assign(p, { s, canvas, ctx: canvas.getContext("2d") });

    generateMaze(s);

    // ── pointer / paint listeners (attached once) ─────────────────────────────
    let painting = false, paintValue = true;

    function cellAt(e) {
      const rect = canvas.getBoundingClientRect(), scale = W / rect.width;
      return {
        r: Math.floor((e.clientY - rect.top) * scale / CELL),
        c: Math.floor((e.clientX - rect.left) * scale / CELL),
      };
    }

    function applyEdit(r, c) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
      if ((r === s.start.r && c === s.start.c) || (r === s.end.r && c === s.end.c)) return;
      if (s.walls[r][c] === paintValue) return;
      s.walls[r][c] = paintValue;
      resetSearch(s); p.redraw();
    }

    canvas.addEventListener("pointerdown", e => {
      p.stopAnim();
      painting = true; canvas.setPointerCapture(e.pointerId);
      const { r, c } = cellAt(e);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
      if ((r === s.start.r && c === s.start.c) || (r === s.end.r && c === s.end.c)) return;
      paintValue = !s.walls[r][c]; applyEdit(r, c);
    });
    canvas.addEventListener("pointermove", e => {
      if (painting) { const { r, c } = cellAt(e); applyEdit(r, c); }
    });
    canvas.addEventListener("pointerup", () => { painting = false; });

    return s;
  })();

  const canvas = p.canvas;
  const ctx = p.ctx;

  // ── buttons ───────────────────────────────────────────────────────────────
  const btnAnimate = document.createElement("button");
  const btnReset = document.createElement("button");
  const btnClear = document.createElement("button");
  const btnMaze = document.createElement("button");
  btnAnimate.textContent = "▶ Animate";
  btnReset.textContent = "Reset";
  btnClear.textContent = "Clear walls";
  btnMaze.textContent = "Gen maze";

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
  btnRow.append(btnAnimate, btnReset, btnClear, btnMaze);

  // ── heuristic select ──────────────────────────────────────────────────────
  const heuristicOptions = ["zero (Dijkstra)", "manhattan"];
  const heuristicLabel = document.createElement("label");
  const heuristicSelect = document.createElement("select");
  heuristicOptions.forEach(opt => {
    const o = document.createElement("option");
    o.value = o.textContent = opt;
    if (opt === s.heuristic) o.selected = true;
    heuristicSelect.append(o);
  });
  heuristicLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:10px";
  heuristicSelect.style.cssText = "color:var(--bs-body-color);background-color:var(--bs-body-bg);border:1px solid var(--bs-border-color);border-radius:4px;padding:2px 4px";
  heuristicLabel.append(
    Object.assign(document.createElement("span"), { textContent: "Heuristic" }),
    heuristicSelect
  );

  // ── weight slider ─────────────────────────────────────────────────────────
  const weightLabel = document.createElement("label");
  const weightSlider = document.createElement("input");
  const weightValueSpan = document.createElement("span");
  weightSlider.type = "range";
  weightSlider.min = "1"; weightSlider.max = "5";
  weightSlider.step = "0.1";
  weightSlider.value = String(s.weight);
  weightValueSpan.textContent = Number(s.weight).toFixed(1);
  weightValueSpan.style.cssText = "min-width:2.5em;text-align:right";
  weightLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:6px";
  weightLabel.append(
    Object.assign(document.createElement("span"), { textContent: "Weight (w)" }),
    weightSlider,
    weightValueSpan
  );

  // ── iterations display ────────────────────────────────────────────────────
  const iterDisplay = document.createElement("div");
  iterDisplay.style.cssText = "margin-top:6px;font-size:0.85em";
  iterDisplay.textContent = "iterations: —";

  // ── layout: canvas top, controls below ───────────────────────────────────
  const root = document.createElement("div");
  root.append(canvas, btnRow, heuristicLabel, weightLabel, iterDisplay);

  // ── helpers ───────────────────────────────────────────────────────────────
  function redraw() {
    draw(s, ctx);
    iterDisplay.textContent = s.done
      ? `iterations: ${s.iter} · ${s.status}`
      : s.iter > 0 ? `iterations: ${s.iter}…` : "iterations: —";
  }

  function stopAnim() {
    s.animating = false;
    if (s.animTimer) { clearTimeout(s.animTimer); s.animTimer = null; }
    btnAnimate.textContent = "▶ Animate";
  }

  p.redraw = redraw;
  p.stopAnim = stopAnim;

  function animTick() {
    if (!s.animating) return;
    if (!s.running && !s.done) initSearch(s);
    stepOnce(s); redraw();
    if (!s.done) s.animTimer = setTimeout(animTick, 50);
    else stopAnim();
  }

  function startAnim() {
    if (s.done) resetSearch(s);
    s.animating = true;
    btnAnimate.textContent = "⏸ Pause";
    animTick();
  }

  // ── control handlers ──────────────────────────────────────────────────────
  btnAnimate.onclick = () => s.animating ? stopAnim() : startAnim();
  btnReset.onclick = () => { stopAnim(); resetSearch(s); redraw(); };
  btnClear.onclick = () => {
    stopAnim();
    s.walls = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    resetSearch(s); redraw();
  };
  btnMaze.onclick = () => { stopAnim(); generateMaze(s); redraw(); };

  heuristicSelect.oninput = () => {
    s.heuristic = heuristicSelect.value;
    stopAnim(); resetSearch(s); redraw();
  };

  weightSlider.oninput = () => {
    s.weight = parseFloat(weightSlider.value);
    weightValueSpan.textContent = s.weight.toFixed(1);
    stopAnim(); resetSearch(s); redraw();
  };

  redraw();
  return root;
}
