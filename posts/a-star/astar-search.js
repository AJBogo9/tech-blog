import { ROWS, COLS, key } from "./astar-constants.js";

export function heuristicFn(r1, c1, r2, c2, type) {
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  if (type === "manhattan")       return dr + dc;
  if (type === "euclidean")       return Math.sqrt(dr*dr + dc*dc);
  if (type === "chebyshev")       return Math.max(dr, dc);
  if (type === "zero (Dijkstra)") return 0;
  return dr + dc;
}

export function initSearch(s) {
  const sk = key(s.start.r, s.start.c);
  s.openSet   = [{r: s.start.r, c: s.start.c}];
  s.closedSet = new Set();
  s.cameFrom  = {};
  s.gScore    = {[sk]: 0};
  s.fScore    = {[sk]: (s.weight ?? 1) * heuristicFn(s.start.r, s.start.c, s.end.r, s.end.c, s.heuristic)};
  s.path      = [];
  s.running   = true;
  s.done      = false;
  s.iter      = 0;
  s.status    = "searching…";
}

export function stepOnce(s) {
  if (!s.running || s.done) return;
  if (s.openSet.length === 0) {
    s.running = false; s.done = true; s.status = "no path found"; return;
  }
  let bestIdx = 0;
  for (let i = 1; i < s.openSet.length; i++) {
    const fi = s.fScore[key(s.openSet[i].r,       s.openSet[i].c)]       ?? Infinity;
    const fb = s.fScore[key(s.openSet[bestIdx].r, s.openSet[bestIdx].c)] ?? Infinity;
    if (fi < fb) bestIdx = i;
  }
  const cur = s.openSet.splice(bestIdx, 1)[0];
  const ck  = key(cur.r, cur.c);

  if (cur.r === s.end.r && cur.c === s.end.c) {
    let k = ck;
    while (s.cameFrom[k]) { s.path.push(k); k = s.cameFrom[k]; }
    s.path.push(key(s.start.r, s.start.c));
    s.running = false; s.done = true;
    s.status  = `done — ${s.path.length - 1} steps`;
    return;
  }
  s.closedSet.add(ck);
  s.iter++;

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dr, dc] of dirs) {
    const nr = cur.r + dr, nc = cur.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
    if (s.walls[nr][nc]) continue;
    const nk = key(nr, nc);
    if (s.closedSet.has(nk)) continue;
    const tentG = (s.gScore[ck] ?? Infinity) + 1;
    if (tentG < (s.gScore[nk] ?? Infinity)) {
      s.cameFrom[nk] = ck;
      s.gScore[nk]   = tentG;
      const h        = heuristicFn(nr, nc, s.end.r, s.end.c, s.heuristic);
      s.fScore[nk]   = tentG + (s.weight ?? 1) * h;
      if (!s.openSet.find(n => n.r === nr && n.c === nc))
        s.openSet.push({r: nr, c: nc});
    }
  }
}

export function resetSearch(s) {
  s.openSet = []; s.closedSet = new Set(); s.cameFrom = {};
  s.gScore  = {}; s.fScore   = {};
  s.path    = []; s.running  = false; s.done = false; s.iter = 0; s.status = "idle";
}
