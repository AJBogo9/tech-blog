export const COLS = 29, ROWS = 17, CELL = 28;
export const W = COLS * CELL, H = ROWS * CELL;
export const key = (r, c) => `${r},${c}`;

export function getColors() {
  const s = getComputedStyle(document.documentElement);
  const v = name => s.getPropertyValue(name).trim();
  return {
    bg:      v("--bs-body-bg")           || "#212529",
    grid:    v("--bs-border-color")      || "#495057",
    empty:   v("--bs-body-bg")           || "#212529",
    wall:    v("--bs-gray-700")          || "#495057",
    start:   v("--bs-primary")           || "#375a7f",
    end:     v("--bs-danger")            || "#e74c3c",
    open:    v("--bs-info-bg-subtle")    || "#0d2a4a",
    openBdr: v("--bs-info")              || "#3498db",
    closed:  v("--bs-success-bg-subtle") || "#0a2318",
    clsBdr:  v("--bs-success")           || "#00bc8c",
    path:    "#f0e130",
    pathBdr: "#f0e130",
    text:    v("--bs-body-color")        || "#dee2e6",
  };
}
