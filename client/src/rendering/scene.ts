import type { ViewCell, GridEntity } from '../../../shared/src/types/world.js';
import type { Point } from './renderConfig.js';
export type VisualEntity = ViewCell['entities'][number];
export const cellKey = (x: number, y: number) => `${x},${y}`;
export const isActor = (entity: GridEntity) => entity.symbol === 'S' || entity.symbol === 'Z';
export function permittedPosition(cells: ReadonlyMap<string, ViewCell>, position: Point): boolean {
  return cells.get(cellKey(Math.round(position.x), Math.round(position.y)))?.visible === true;
}
export interface DepthEntry {
  x: number;
  y: number;
  layer: number;
  id: string;
}
/** Ground-foot depth, not sprite tops. Deterministic ties prevent flicker. */
export function compareDepth(a: DepthEntry, b: DepthEntry): number {
  return a.x + a.y - b.x - b.y || a.layer - b.layer || a.x - b.x || a.id.localeCompare(b.id);
}
/** Retain last SEEN terrain, not unseen current door changes in later snapshots. */
export function rememberTerrain(
  incoming: readonly ViewCell[],
  previous: ReadonlyMap<string, ViewCell>,
): Map<string, ViewCell> {
  const cells = new Map<string, ViewCell>();
  for (const cell of incoming) {
    const old = previous.get(cellKey(cell.x, cell.y));
    cells.set(cellKey(cell.x, cell.y), {
      ...cell,
      tileType: !cell.visible && cell.explored && old?.explored ? old.tileType : cell.tileType,
      entities: cell.visible ? cell.entities : [],
      items: cell.visible ? cell.items : [],
    });
  }
  return cells;
}
