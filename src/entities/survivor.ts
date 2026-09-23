import type { Grid, GridEntity } from "../world/grid.js";
import { ItemContainer } from "./container.js";
import type { Item, ItemType } from "./item.js";
import { searchEntities, searchCells, hasLineOfSight, spatialDistance } from "../world/perception.js";

export class Survivor implements GridEntity {
  public readonly symbol = "S";

  public health = 100;
  public maxHealth = 100;

  public program: string;
  readonly inventoryCapacity = 5;
  private carriedItems: Item[] = [];
  get inventory(): readonly Item[] { return this.carriedItems.map(item => ({ ...item })); }

  pickUpItems(grid: Grid): Item[] {
    const cell = grid.getCell(this.x, this.y);
    if (!this.isAlive() || !cell) return [];
    const items = cell.items.splice(0, this.inventoryCapacity - this.carriedItems.length);
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
    return searchEntities(grid, this, { range, predicate: entity => entity instanceof ItemContainer })
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
