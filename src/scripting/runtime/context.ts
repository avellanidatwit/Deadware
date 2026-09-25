import type { Grid } from "../../world/grid.js";
import type { Survivor } from "../../entities/survivor.js";
import type { Zombie } from "../../entities/zombie.js";
export interface ScriptContext {
  grid: Grid;
  survivor: Survivor | Zombie;
  zombies: Zombie[];
  survivors?: Survivor[];
  detectionRange?: number;
  /** Skip movement rules while on cooldown, allowing later non-movement rules. */
  canMove?: boolean;
  tick?: number;
}
