import type { ViewCell } from '../../../shared/src/types/world.js';
import { cellKey } from './scene.js';
import { noise } from './renderConfig.js';
import { polygon } from './SpriteManager.js';
/** Edges use known neighbors only; no decoration exposes an unknown road or building. */
export function terrainTransitions(
  ctx: CanvasRenderingContext2D,
  cell: ViewCell,
  cells: ReadonlyMap<string, ViewCell>,
  x: number,
  y: number,
) {
  const corners = [
      [-32, 0],
      [0, -16],
      [32, 0],
      [0, 16],
    ],
    neighbors = [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ];
  if (cell.tileType !== 'road' && cell.tileType !== 'buildingFloor') return;
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 4; i++) {
    const n = cells.get(cellKey(cell.x + neighbors[i][0], cell.y + neighbors[i][1]));
    if (!n?.explored || n.tileType !== 'empty') continue;
    const a = corners[i],
      b = corners[(i + 1) % 4];
    polygon(
      ctx,
      [a, b, [b[0] * 0.82, b[1] * 0.82], [a[0] * 0.82, a[1] * 0.82]],
      cell.tileType === 'road' ? '#69735988' : '#a4a18a',
    );
    ctx.fillStyle = '#89907599';
    const jitter = noise(cell.x, cell.y, i) % 5;
    ctx.fillRect(Math.round((a[0] + b[0]) * 0.42) + jitter, Math.round((a[1] + b[1]) * 0.42), 3, 2);
  }
  ctx.restore();
}
