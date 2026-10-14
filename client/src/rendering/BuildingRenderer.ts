import type { ViewCell } from '../../../shared/src/types/world.js';
import { diamond, polygon } from './SpriteManager.js';
import { cellKey } from './scene.js';
/** Adjacent known wall tiles share their silhouette; no outlines on internal joins. */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cell: ViewCell,
  cells: ReadonlyMap<string, ViewCell>,
  x: number,
  y: number,
  transparent: boolean,
) {
  const door = cell.tileType === 'door' || cell.tileType === 'openDoor',
    open = cell.tileType === 'openDoor',
    h = door ? 27 : 32;
  const connected = (dx: number, dy: number) => {
    const n = cells.get(cellKey(cell.x + dx, cell.y + dy));
    return n?.explored && ['buildingWall', 'door', 'openDoor'].includes(n.tileType);
  };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.globalAlpha = cell.visible ? (transparent ? 0.3 : 1) : 0.34;
  if (open) {
    polygon(
      ctx,
      [
        [-25, -10],
        [-21, -12],
        [-21, -38],
        [-25, -36],
      ],
      '#b2a088',
    );
    polygon(
      ctx,
      [
        [20, 10],
        [24, 8],
        [24, -18],
        [20, -16],
      ],
      '#a29174',
    );
    polygon(
      ctx,
      [
        [-25, -36],
        [-21, -39],
        [24, -18],
        [20, -15],
      ],
      '#c0b195',
    );
    polygon(
      ctx,
      [
        [-20, -11],
        [-10, -16],
        [-10, -39],
        [-20, -34],
      ],
      '#6f624f',
    );
  } else {
    polygon(
      ctx,
      [
        [-32, 0],
        [0, 16],
        [0, 16 - h],
        [-32, -h],
      ],
      door ? '#66543f' : '#606b61',
    );
    polygon(
      ctx,
      [
        [0, 16],
        [32, 0],
        [32, -h],
        [0, 16 - h],
      ],
      door ? '#8d795a' : '#7b8270',
    );
    diamond(ctx, 0, -h);
    ctx.fillStyle = door ? '#a18f6a' : '#a19e87';
    ctx.fill();
    // Brick courses continue across tiles; their stagger is coordinate-derived.
    ctx.strokeStyle = door ? '#4c493c' : '#46544b55';
    ctx.lineWidth = 1;
    for (let i = 8; i < h; i += 8) {
      ctx.beginPath();
      ctx.moveTo(-31, -i);
      ctx.lineTo(0, 16 - i);
      ctx.lineTo(31, -i);
      ctx.stroke();
    }
    if (door) {
      ctx.fillStyle = '#d0b778';
      ctx.fillRect(17, -6, 3, 2);
    }
    if (!connected(1, 0)) {
      ctx.strokeStyle = '#48584b';
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(32, 0);
      ctx.stroke();
    }
    if (!connected(0, 1)) {
      ctx.strokeStyle = '#3c4b43';
      ctx.beginPath();
      ctx.moveTo(-32, 0);
      ctx.lineTo(0, 16);
      ctx.stroke();
    }
  }
  ctx.restore();
}
