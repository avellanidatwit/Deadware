import type { GridEntity } from "../world/grid.js";
import { randomizeItems, type Item } from "./item.js";

export class ItemContainer implements GridEntity {
  readonly symbol = "C";
  readonly blocksMovement = true;
  private items: Item[];

  constructor(public id: string, public x: number, public y: number,
    public name = "Cabinet", items: Item[] = randomizeItems()) {
    this.items = [...items];
  }

  get contents(): readonly Item[] { return [...this.items]; }

  empty(): Item[] {
    const items = this.items;
    this.items = [];
    return items;
  }
}
