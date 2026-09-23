import type { GridEntity } from "../world/grid.js";

export class Zombie implements GridEntity {
  public readonly symbol = "Z";

  public health = 100;
  public maxHealth = 100;
  public detectionRange = 5;

  constructor(
    public id: string,
    public x: number,
    public y: number,
    public program = 
`WHEN survivorNearby 1
    ATTACK survivor

WHEN survivorNearby
    CHASE survivor

OTHERWISE
    WANDER`) {}

  takeDamage(amount: number): void {
    this.health -= amount;

    if (this.health < 0) {
      this.health = 0;
    }
  }

  isAlive(): boolean {
    return this.health > 0;
  }
}
