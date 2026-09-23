import type { GridEntity } from "../world/grid.js";

/** Decorative furniture blocks movement but cannot be searched. */
export class Furniture implements GridEntity {
  readonly symbol = "F";
  readonly blocksMovement = true;
  constructor(public id: string, public x: number, public y: number, public name: string) {}
}
