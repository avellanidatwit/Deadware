import type { Grid, GridEntity } from "../world/grid.js";
import { ItemContainer } from "./container.js";
import type { Item, ItemType } from "./item.js";
import { searchEntities, searchCells, hasLineOfSight, spatialDistance } from "../world/perception.js";
import type { MemorySlot } from "../scripting/language/selectors.js";

export class Survivor implements GridEntity {
  public readonly symbol = "S";

  public health = 100;
  public maxHealth = 100;
  public hunger = 0;
  public thirst = 0;
  public stamina = 100;
  public ammo = 0;
  public equippedItemId?: string;
  /** Position snapshots never track unseen entities. */
  readonly memory: Partial<Record<MemorySlot, { x: number; y: number }>> = {};
  get equippedItem(): Item | undefined { return this.inventory.find(item => item.id === this.equippedItemId); }

  updateNeeds(): void {
    if (!this.isAlive()) return;
    this.hunger = Math.min(100, this.hunger + 0.15);
    this.thirst = Math.min(100, this.thirst + 0.25);
    if (this.hunger >= 100 || this.thirst >= 100) this.takeDamage(1);
  }

  useItem(type: ItemType): boolean {
    if (!this.isAlive()) return false;
    const index = this.carriedItems.findIndex(item => item.type === type);
    if (index < 0) return false;
    if (type === "food") this.hunger = Math.max(0, this.hunger - 40);
    else if (type === "water") this.thirst = Math.max(0, this.thirst - 50);
    else if (type === "bandage") this.health = Math.min(this.maxHealth, this.health + 30);
    else if (type === "ammo" && this.equippedItem?.type === "gun" && this.ammo < 6) this.ammo = 6;
    else return false;
    this.carriedItems.splice(index, 1);
    return true;
  }

  equip(type: ItemType): boolean {
    if (!this.isAlive() || !["weapon", "gun"].includes(type)) return false;
    const item = this.carriedItems.find(item => item.type === type);
    if (!item) return false;
    this.equippedItemId = item.id;
    return true;
  }

  dropItem(grid: Grid, type: ItemType): boolean {
    const cell = grid.getCell(this.x, this.y);
    const index = this.carriedItems.findIndex(item => item.type === type);
    if (!this.isAlive() || !cell || index < 0) return false;
    const [item] = this.carriedItems.splice(index, 1);
    if (item.id === this.equippedItemId) this.equippedItemId = undefined;
    if (item.type === "gun") this.ammo = 0;
    cell.items.push(item);
    return true;
  }
  readonly sightRange = 8;
  private exploredTiles = new Set<string>();
  private visibleTiles = new Set<string>();
  hasExplored(x: number, y: number): boolean { return this.exploredTiles.has(`${x},${y}`); }
  canSee(x: number, y: number): boolean { return this.visibleTiles.has(`${x},${y}`); }

  updateVision(grid: Grid): void {
    this.visibleTiles.clear();
    if (!this.isAlive()) return;
    for (let y = Math.max(0, this.y - this.sightRange); y <= Math.min(grid.height - 1, this.y + this.sightRange); y++) {
      for (let x = Math.max(0, this.x - this.sightRange); x <= Math.min(grid.width - 1, this.x + this.sightRange); x++) {
        if (hasLineOfSight(grid, this, { x, y }, { range: this.sightRange })) {
          this.visibleTiles.add(`${x},${y}`);
          this.exploredTiles.add(`${x},${y}`);
        }
      }
    }
  }

  /** Route across revealed terrain toward the nearest edge of unexplored space. */
  explore(grid: Grid): boolean {
    this.updateVision(grid);
    if (!this.isAlive()) return false;
    const offsets = [[0, -1], [0, 1], [1, 0], [-1, 0]];
    const queue: { x: number; y: number; first?: { x: number; y: number } }[] = [{ x: this.x, y: this.y }];
    const seen = new Set([`${this.x},${this.y}`]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      const frontier = offsets.some(([dx, dy]) => grid.isValidPosition(current.x + dx, current.y + dy) &&
        !this.hasExplored(current.x + dx, current.y + dy));
      if (frontier && current.first) {
        const moved = grid.moveEntity(this, current.first.x, current.first.y);
        this.updateVision(grid);
        return moved;
      }
      for (const [dx, dy] of offsets) {
        const next = { x: current.x + dx, y: current.y + dy }, key = `${next.x},${next.y}`;
        if (!seen.has(key) && this.hasExplored(next.x, next.y) && grid.isWalkable(next.x, next.y)) {
          seen.add(key);
          queue.push({ ...next, first: current.first ?? next });
        }
      }
    }
    return false;
  }

  public program: string;
  readonly inventoryCapacity = 5;
  private carriedItems: Item[] = [];
  get inventory(): readonly Item[] { return this.carriedItems.map(item => ({ ...item })); }

  pickUpItems(grid: Grid, type?: ItemType): Item[] {
    const cell = grid.getCell(this.x, this.y);
    if (!this.isAlive() || !cell) return [];
    const items: Item[] = [];
    for (let index = 0; index < cell.items.length && this.carriedItems.length + items.length < this.inventoryCapacity;) {
      if (type === undefined || cell.items[index].type === type) items.push(...cell.items.splice(index, 1));
      else index++;
    }
    this.carriedItems.push(...items);
    return items.map(item => ({ ...item }));
  }

  /** Approach the nearest visible, nonempty container with a walkable route. */
  moveToContainer(grid: Grid, range = 10): boolean {
    if (!this.isAlive()) return false;
    for (const container of this.findContainers(grid, range).filter(container => container.contents.length > 0)) {
      if (spatialDistance(this, container) === 1) return false;
      const queue: { x: number; y: number; first?: { x: number; y: number } }[] = [{ x: this.x, y: this.y }];
      const seen = new Set([`${this.x},${this.y}`]);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (spatialDistance(current, container) === 1 && current.first) {
          return grid.moveEntity(this, current.first.x, current.first.y);
        }
        for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
          const next = { x: current.x + dx, y: current.y + dy };
          const key = `${next.x},${next.y}`;
          if (!seen.has(key) && grid.isWalkable(next.x, next.y)) {
            seen.add(key);
            queue.push({ ...next, first: current.first ?? next });
          }
        }
      }
    }
    return false;
  }

  constructor(
    public id: string,
    public x: number,
    public y: number,
    program = ""
  ) {
    this.program = program;
    this.memory.home = { x, y };
  }

  takeDamage(amount: number): void {
    this.health -= amount;

    if (this.health < 0) {
      this.health = 0;
    }
  }

  isAlive(): boolean {
    return this.health > 0;
  }

  findNearbyDoors(grid: Grid) {
    return searchCells(grid, this, {
      range: 1,
      predicate: cell => cell.tileType === "door" && spatialDistance(this, cell) === 1,
    });
  }

  /** Open one adjacent closed door. Opening consumes an action, without moving. */
  openDoor(grid: Grid): boolean {
    if (!this.isAlive()) return false;
    const door = this.findNearbyDoors(grid)[0];
    if (!door) return false;
    door.tileType = "openDoor";
    return true;
  }

  findContainers(grid: Grid, range = 1): ItemContainer[] {
    return searchEntities(grid, this, { range: Math.min(range, this.sightRange), predicate: entity => entity instanceof ItemContainer })
      .filter((entity): entity is ItemContainer => entity instanceof ItemContainer);
  }

  /** null means out of reach/unavailable; [] means a valid but empty container. */
  searchContainer(grid: Grid, container: ItemContainer): Item[] | null {
    const floor = grid.getCell(this.x, this.y);
    if (!this.isAlive() || !floor || spatialDistance(this, container) !== 1 ||
        !grid.getCell(container.x, container.y)?.entities.includes(container) ||
        !hasLineOfSight(grid, this, container)) return null;
    const items = container.empty();
    floor.items.push(...items);
    return [...items];
  }

  /** Snapshot of the current floor tile. Use filter/find/some to query the result. */
  lookAtFloor(grid: Grid, type?: ItemType): Item[] {
    return (grid.getCell(this.x, this.y)?.items ?? [])
      .filter(item => type === undefined || item.type === type)
      .map(item => ({ ...item }));
  }
}
