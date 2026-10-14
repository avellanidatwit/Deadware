import type { Motion } from '../simulation/movement.js';
import type { GridEntity } from '../world/grid.js';

export class Zombie implements GridEntity {
  public readonly symbol = 'Z';

  public mode?: string;
  public motion?: Motion;
  public speed = 1.2;
  public radius = 0.22;
  public attackReadyAt = 0;
  public health = 100;
  public kills = 0;
  public maxHealth = 100;
  public detectionRange = 5;

  constructor(
    public id: string,
    public x: number,
    public y: number,
    public program = `WHEN count survivor 1 > 0
    ATTACK survivor

WHEN count survivor 5 > 0
    MOVE_TO nearest survivor

OTHERWISE
    EXPLORE`,
  ) {}

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
