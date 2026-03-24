import { ROWS, COLS } from "./astar-constants.js";
import { resetSearch } from "./astar-search.js";

export function generateMaze(s) {
  s.walls = Array.from({length: ROWS}, () => new Array(COLS).fill(true));
  const inMaze    = Array.from({length: ROWS}, () => new Array(COLS).fill(false));
  const cardinals = [[0,2],[0,-2],[2,0],[-2,0]];

  function neighbours(r, c) {
    return cardinals
      .map(([dr, dc]) => [r + dr, c + dc])
      .filter(([nr, nc]) => nr >= 1 && nr < ROWS-1 && nc >= 1 && nc < COLS-1);
  }

  const originR = 1, originC = 1;
  s.walls[originR][originC] = false;
  inMaze[originR][originC]  = true;
  let frontier = neighbours(originR, originC).map(([nr, nc]) => [nr, nc, originR, originC]);

  while (frontier.length) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [r, c, pr, pc] = frontier.splice(idx, 1)[0];
    if (inMaze[r][c]) continue;
    s.walls[r][c] = false;
    s.walls[(r + pr) / 2][(c + pc) / 2] = false;
    inMaze[r][c] = true;
    for (const [nr, nc] of neighbours(r, c))
      if (!inMaze[nr][nc]) frontier.push([nr, nc, r, c]);
  }

  const bfsDirs = [[0,1],[0,-1],[1,0],[-1,0]];
  const dist = Array.from({length: ROWS}, () => new Array(COLS).fill(-1));
  const queue = [[originR, originC]];
  dist[originR][originC] = 0;
  let furthest = [originR, originC];
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of bfsDirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (s.walls[nr][nc] || dist[nr][nc] !== -1) continue;
      dist[nr][nc] = dist[r][c] + 1;
      if (dist[nr][nc] > dist[furthest[0]][furthest[1]]) furthest = [nr, nc];
      queue.push([nr, nc]);
    }
  }

  s.start = { r: originR, c: originC };
  s.end   = { r: furthest[0], c: furthest[1] };
  resetSearch(s);
}
