import { ItemContainer } from "./container.js";
import type { Item } from "./item.js";
import type { GridEntity } from "../world/grid.js";

/** The trunk is searchable; the second tile is only a solid car body. */
export class Car extends ItemContainer {
  readonly body: GridEntity;
  constructor(id: string, x: number, y: number, items: Item[], public readonly orientation: "vertical" | "horizontal" = "vertical") {
    super(id, x, y, "Car", items);
    this.body = { id: `${id}-body`, x: x + (orientation === "horizontal" ? 1 : 0),
      y: y + (orientation === "vertical" ? 1 : 0), symbol: "V", blocksMovement: true };
  }
}
