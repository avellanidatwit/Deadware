import { findNearestTarget } from "../world/perception.js";
import type { Survivor } from "../entities/survivor.js";
import type { Zombie } from "../entities/zombie.js";
import type { Grid } from "../world/grid.js";
import { runSurvivorProgram, type SurvivorProgram } from "./survivorScript.js";

const offsets = {
  north: { x: 0, y: -1 }, south: { x: 0, y: 1 },
  east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
};
type Position = { x: number; y: number };
const distance = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function findNearestSurvivor(zombie: Zombie, survivors: Survivor[], grid: Grid, range = zombie.detectionRange): Survivor | undefined {
  return findNearestTarget(grid, zombie, survivors, { range, predicate: survivor => survivor.isAlive() });
}

export function runZombieTick(zombie: Zombie, program: SurvivorProgram, grid: Grid, survivors: Survivor[], zombies: Zombie[]): void {
  if (!zombie.isAlive()) return;
  const action = runSurvivorProgram(program, {
    grid, survivor: zombie, survivors, zombies, detectionRange: zombie.detectionRange,
  });
  if (action.type === "wait") return;
  if (action.type === "attack" && action.target === "survivor") {
    const target = findNearestSurvivor(zombie, survivors, grid, 1);
    if (target) {
      target.takeDamage(20);
      if (!target.isAlive()) grid.removeEntity(target.id);
    }
    return;
  }
  if (action.type === "move") {
    const offset = offsets[action.direction];
    grid.moveEntity(zombie, zombie.x + offset.x, zombie.y + offset.y);
  } else if (action.type === "chase") {
    const target = findNearestSurvivor(zombie, survivors, grid, action.range);
    if (!target || distance(zombie, target) <= 1) return;
    // Breadth-first search routes around walls and through doors, one tile per tick.
    const queue: { position: Position; first?: Position }[] = [{ position: zombie }];
    const visited = new Set([`${zombie.x},${zombie.y}`]);
    for (let index = 0; index < queue.length; index++) {
      const { position, first } = queue[index];
      if (distance(position, target) <= 1 && first) {
        grid.moveEntity(zombie, first.x, first.y);
        return;
      }
      for (const offset of Object.values(offsets)) {
        const next = { x: position.x + offset.x, y: position.y + offset.y };
        const key = `${next.x},${next.y}`;
        if (!visited.has(key) && grid.isWalkable(next.x, next.y)) {
          visited.add(key);
          queue.push({ position: next, first: first ?? next });
        }
      }
    }
  } else if (action.type === "wander" || action.type === "explore") {
    const moves = Object.values(offsets).map(offset => ({ x: zombie.x + offset.x, y: zombie.y + offset.y }))
      .filter(position => grid.isWalkable(position.x, position.y));
    const next = moves[Math.floor(Math.random() * moves.length)];
    if (next) grid.moveEntity(zombie, next.x, next.y);
  }
}
