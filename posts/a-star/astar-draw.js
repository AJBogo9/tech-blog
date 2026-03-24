import { COLS, ROWS, CELL, W, H, key, getColors } from "./astar-constants.js";

export function draw(s, ctx) {
  const C = getColors();

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const openKeys = new Set(s.openSet.map(n => key(n.r, n.c)));
  const pathSet  = new Set(s.path);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = r * CELL, k = key(r, c);
      const isStart  = r === s.start.r && c === s.start.c;
      const isEnd    = r === s.end.r   && c === s.end.c;
      const isWall   = s.walls[r][c];
      const isPath   = pathSet.has(k)     && !isStart && !isEnd;
      const isOpen   = openKeys.has(k)    && !isStart && !isEnd;
      const isClosed = s.closedSet.has(k) && !isStart && !isEnd;

      if      (isWall)   ctx.fillStyle = C.wall;
      else if (isStart)  ctx.fillStyle = C.start;
      else if (isEnd)    ctx.fillStyle = C.end;
      else if (isPath)   ctx.fillStyle = C.path;
      else if (isOpen)   ctx.fillStyle = C.open;
      else if (isClosed) ctx.fillStyle = C.closed;
      else               ctx.fillStyle = C.empty;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

      if (isOpen)   { ctx.strokeStyle = C.openBdr; ctx.lineWidth = 0.5; ctx.strokeRect(x+1,y+1,CELL-2,CELL-2); }
      if (isClosed) { ctx.strokeStyle = C.clsBdr;  ctx.lineWidth = 0.5; ctx.strokeRect(x+1,y+1,CELL-2,CELL-2); }
      if (isPath)   { ctx.strokeStyle = C.pathBdr; ctx.lineWidth = 1;   ctx.strokeRect(x+1,y+1,CELL-2,CELL-2); }

      if (isStart || isEnd) {
        ctx.fillStyle = C.text;
        ctx.font = `bold ${CELL * 0.38}px monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(isStart ? "S" : "E", x + CELL / 2, y + CELL / 2);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      }
    }
  }

  ctx.strokeStyle = C.grid; ctx.lineWidth = 0.4;
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*CELL); ctx.lineTo(W, r*CELL); ctx.stroke(); }
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL, 0); ctx.lineTo(c*CELL, H); ctx.stroke(); }
}
