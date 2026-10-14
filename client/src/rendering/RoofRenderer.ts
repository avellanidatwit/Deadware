import type { ViewCell } from '../../../shared/src/types/world.js';
import type { Point } from './renderConfig.js';
import { cellKey } from './scene.js';
import { worldToIso } from './IsometricCamera.js';
import { diamond, polygon } from './SpriteManager.js';
export interface RoofGroup {
  tiles: ViewCell[];
  keys: Set<string>;
}
const building = (c: ViewCell | undefined) =>
  c &&
  (c.explored || c.visible) &&
  ['buildingFloor', 'buildingWall', 'door', 'openDoor'].includes(c.tileType);
/** No bounding-box inference: roofs cover only known building cells. */
export function roofGroups(cells: ReadonlyMap<string, ViewCell>): RoofGroup[] {
  const seen = new Set<string>(),
    groups: RoofGroup[] = [];
  for (const [key, cell] of cells) {
    if (seen.has(key) || !building(cell)) continue;
    const group: RoofGroup = { tiles: [], keys: new Set() },
      queue = [cell];
    seen.add(key);
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i],
        k = cellKey(c.x, c.y);
      group.tiles.push(c);
      group.keys.add(k);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nextKey = cellKey(c.x + dx, c.y + dy),
          next = cells.get(nextKey);
        if (!seen.has(nextKey) && building(next)) {
          seen.add(nextKey);
          queue.push(next!);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}
export function roofCutaway(
  group: RoofGroup,
  inspection: Point | null,
  actors: Iterable<Point>,
): boolean {
  if (inspection && group.keys.has(cellKey(Math.round(inspection.x), Math.round(inspection.y))))
    return true;
  if (group.tiles.some((c) => c.visible && c.tileType === 'buildingFloor')) return true;
  for (const p of actors)
    if (group.keys.has(cellKey(Math.round(p.x), Math.round(p.y)))) return true;
  return false;
}
export function drawRoof(ctx: CanvasRenderingContext2D, cell: ViewCell, group: RoofGroup) {
  const p = worldToIso(cell),
    h = 41;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y) - h);
  ctx.globalAlpha = 1;
  diamond(ctx);
  ctx.fillStyle = cell.visible ? ((cell.x + cell.y) % 2 ? '#5e6966' : '#65706b') : '#3d4b4b';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = cell.visible ? '#87908755' : '#6a787055';
  ctx.lineWidth = 1;
  for (let x = -32; x < 33; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, -16);
    ctx.lineTo(x + 32, 16);
    ctx.stroke();
  }
  ctx.restore();
  if (!group.keys.has(cellKey(cell.x + 1, cell.y)))
    polygon(
      ctx,
      [
        [0, 16],
        [32, 0],
        [32, 5],
        [0, 21],
      ],
      '#374640',
    );
  if (!group.keys.has(cellKey(cell.x, cell.y + 1)))
    polygon(
      ctx,
      [
        [-32, 0],
        [0, 16],
        [0, 21],
        [-32, 5],
      ],
      '#46544b',
    );
  ctx.restore();
}
