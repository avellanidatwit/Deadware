import type { SurvivorAction } from './language/types.js';
import type { ScriptContext } from './runtime/context.js';
import { resolveTargets } from './runtime/targetResolver.js';
import { spatialDistance } from '../world/perception.js';
import type { Survivor } from '../entities/survivor.js';
import { Zombie } from '../entities/zombie.js';
import type { Grid } from '../world/grid.js';
import { runSurvivorProgram } from './runtime/interpreter.js';
import type { SurvivorProgram } from './language/types.js';

const offsets = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};
type Position = { x: number; y: number };
const distance = spatialDistance;

export function runZombieTick(
  zombie: Zombie,
  program: SurvivorProgram,
  grid: Grid,
  survivors: Survivor[],
  zombies: Zombie[],
  tick?: number,
): void {
  const context = {
    grid,
    survivor: zombie,
    survivors,
    zombies,
    detectionRange: zombie.detectionRange,
    tick,
  };
  executeZombieAction(runSurvivorProgram(program, context), context);
}

export function executeZombieAction(action: SurvivorAction, context: ScriptContext): string {
  const { survivor: zombie, grid, tick } = context;
  if (!(zombie instanceof Zombie) || !zombie.isAlive()) return 'Zombie cannot act.';
  if (action.type === 'setMode') {
    zombie.mode = action.mode;
    zombie.motion = undefined;
    return `Mode: ${action.mode}.`;
  }
  if (action.type === 'wait') return 'Zombie: action.';
  if (action.type === 'targeted' && action.verb === 'ATTACK') {
    const target = resolveTargets(
      { ...action.target, range: Math.min(action.target.range ?? 1, 1) },
      context,
    )[0] as Survivor | undefined;
    if (!target) return 'Action unavailable: target out of reach.';
    {
      const beforeHealth = target.health;
      target.takeDamage(20);
      context.onCombat?.({
        attacker: zombie,
        target,
        damage: beforeHealth - target.health,
        weapon: 'melee',
        killed: !target.isAlive(),
      });
      target.recordEvent(tick ?? 0, 'Attacked by a zombie for 20 damage.');
      if (!target.isAlive()) {
        zombie.kills++;
        grid.removeEntity(target.id);
      }
    }
    return 'Zombie: action.';
  }
  if (action.type === 'move') {
    const offset = offsets[action.direction];
    grid.moveEntity(zombie, zombie.x + offset.x, zombie.y + offset.y);
  } else if (
    action.type === 'targeted' &&
    ['MOVE_TO', 'FOLLOW', 'MOVE_AWAY'].includes(action.verb)
  ) {
    const target = resolveTargets(action.target, context)[0];
    if (!target) return 'Action unavailable: target not visible.';
    if (action.verb === 'MOVE_AWAY') {
      const choices = Object.values(offsets)
        .map((d) => ({ x: zombie.x + d.x, y: zombie.y + d.y }))
        .filter((p) => grid.isWalkable(p.x, p.y));
      choices.sort((a, b) => distance(b, target) - distance(a, target));
      if (choices[0]) grid.moveEntity(zombie, choices[0].x, choices[0].y);
      return 'Zombie: MOVE_AWAY.';
    }
    if (distance(zombie, target) <= 1) return 'Zombie: action.';
    // Breadth-first search routes around walls and through doors, one tile per tick.
    const queue: { position: Position; first?: Position }[] = [{ position: zombie }];
    const visited = new Set([`${zombie.x},${zombie.y}`]);
    for (let index = 0; index < queue.length; index++) {
      const { position, first } = queue[index];
      if (distance(position, target) <= 1 && first) {
        grid.moveEntity(zombie, first.x, first.y);
        return 'Zombie: action.';
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
  } else if (action.type === 'explore') {
    const moves = Object.values(offsets)
      .map((offset) => ({ x: zombie.x + offset.x, y: zombie.y + offset.y }))
      .filter((position) => grid.isWalkable(position.x, position.y));
    const next = moves[Math.floor(Math.random() * moves.length)];
    if (next) grid.moveEntity(zombie, next.x, next.y);
  }
  return 'Zombie: action.';
}
