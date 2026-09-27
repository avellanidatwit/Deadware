import type { GridCell, GridEntity } from '../world/grid.js';
import type { Item } from '../entities/item.js';
export interface PublicActor {
  id: string; kind: 'survivor' | 'zombie'; name: string; ownerName: string;
  health: number; maxHealth: number; kills: number; aliveSeconds: number | null;
}
export interface ViewCell extends Omit<GridCell, 'entities'> {
  visible: boolean; explored: boolean;
  entities: (GridEntity & { name?: string; actor?: PublicActor })[];
}
export interface WorldSnapshot {
  tick: number; width: number; height: number;
  cells: ViewCell[];
  entities: { id: string; kind: 'survivor' | 'zombie'; name: string; health: number }[];
  observer: (PublicActor & { x: number; y: number; sightRange: number; hunger?: number; thirst?: number; stamina?: number; ammo?: number; equippedItemId?: string; inventory?: Item[]; floor?: Item[]; message: string }) | null;
}
