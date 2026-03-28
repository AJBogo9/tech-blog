import { ROWS, COLS } from "./astar-constants.js";

export function appState() {
  return {
    walls:     Array.from({length: ROWS}, () => new Array(COLS).fill(false)),
    start:     {r: 1, c: 1},
    end:       {r: ROWS - 2, c: COLS - 2},
    openSet:   [],
    closedSet: new Set(),
    cameFrom:  {}, gScore: {}, fScore: {},
    path:      [],
    running:   false, done: false, iter: 0, status: "idle",
    heuristic: "zero (Dijkstra)",
    weight:    1,
    animating: false, animTimer: null,
  };
}
