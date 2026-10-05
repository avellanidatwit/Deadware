export interface Item { id: string; type: 'food' | 'weapon' | 'bandage' | 'water' | 'gun' | 'ammo' | 'armor'; name: string; catalogKey: string }
export type TileType = 'empty' | 'road' | 'buildingWall' | 'buildingFloor' | 'door' | 'openDoor';
export interface MotionSample { time: number; x: number; y: number }
export interface GridEntity {
  motion?: MotionSample[]; id: string; x: number; y: number; symbol: string; blocksMovement?: boolean }
export interface GridCell { x: number; y: number; tileType: TileType; entities: GridEntity[]; items: Item[] }
export interface PublicActor {
  id: string; kind: 'survivor' | 'zombie'; name: string; ownerName: string;
  health: number; maxHealth: number; kills: number; aliveSeconds: number | null;
}
export interface ViewCell extends Omit<GridCell, 'entities'> {
  visible: boolean; explored: boolean;
  entities: (GridEntity & { name?: string; actor?: PublicActor })[];
}
export interface WorldSnapshot {
  time?: number; tick: number; width: number; height: number;
  cells: ViewCell[];
  zombieObservers?: (PublicActor & { x: number; y: number; sightRange: number; message: string })[];
  entities: { id: string; kind: 'survivor' | 'zombie'; name: string; health: number }[];
  observer: (PublicActor & { x: number; y: number; sightRange: number; hunger?: number; thirst?: number; stamina?: number; ammo?: number; equippedItemId?: string; equippedArmorId?: string; combat?: { baseDamage: number; weaponBonus: number; damage: number; meleeDamage: number; armor: number; magazineCapacity: number; attackRange: number }; inventory?: Item[]; floor?: Item[]; history?: { tick: number; message: string }[]; message: string }) | null;
}
