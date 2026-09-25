import type { SurvivorAction, Direction } from "../language/types.js";
import type { ScriptContext } from "./context.js";
import { Survivor } from "../../entities/survivor.js";
import { Zombie } from "../../entities/zombie.js";
import { ItemContainer } from "../../entities/container.js";
import { spatialDistance, type Position } from "../../world/perception.js";
import { resolveTargets } from "./targetResolver.js";
import { isMovement } from "../language/actions.js";
import type { Target } from "../language/selectors.js";

export const offsets: Record<Direction, Position> = {
  north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
};
const fleeHistory = new WeakMap<Survivor, { from: Position; to: Position; direction: Direction; tick?: number }>();
const patrols = new WeakMap<Survivor, { destination: string; returning: boolean }>();

/** Pathfinding is limited to terrain this survivor has revealed. */
function approach(context: ScriptContext, target: Position, adjacent: boolean): boolean {
  const { grid, survivor } = context;
  if (!(survivor instanceof Survivor)) return false;
  survivor.updateVision(grid);
  const queue: { x: number; y: number; first?: Position }[] = [{ x: survivor.x, y: survivor.y }];
  const seen = new Set([`${survivor.x},${survivor.y}`]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (spatialDistance(current, target) <= (adjacent ? 1 : 0)) {
      return current.first ? grid.moveEntity(survivor, current.first.x, current.first.y) : false;
    }
    for (const delta of Object.values(offsets)) {
      const next = { x: current.x + delta.x, y: current.y + delta.y }, key = `${next.x},${next.y}`;
      if (!seen.has(key) && survivor.hasExplored(next.x, next.y) && grid.isWalkable(next.x, next.y)) {
        seen.add(key);
        queue.push({ ...next, first: current.first ?? next });
      }
    }
  }
  return false;
}

function flee(context: ScriptContext, target: Position): boolean {
  const { grid, survivor } = context;
  if (!(survivor instanceof Survivor)) return false;
  const moves = (Object.entries(offsets) as [Direction, Position][]).map(([direction, delta]) =>
    ({ x: survivor.x + delta.x, y: survivor.y + delta.y, direction })).filter(move => grid.isWalkable(move.x, move.y));
  if (!moves.length) return false;
  const safest = Math.max(...moves.map(move => spatialDistance(move, target)));
  let candidates = moves.filter(move => spatialDistance(move, target) === safest);
  const previous = fleeHistory.get(survivor);
  if (previous && previous.to.x === survivor.x && previous.to.y === survivor.y &&
      (context.tick === undefined || previous.tick === context.tick - 2)) {
    const forward = candidates.filter(move => move.x !== previous.from.x || move.y !== previous.from.y);
    if (forward.length) candidates = forward;
    const continuing = candidates.find(move => move.direction === previous.direction);
    if (continuing) candidates = [continuing];
  }
  const best = candidates[Math.floor(Math.random() * candidates.length)];
  const from = { x: survivor.x, y: survivor.y };
  if (!grid.moveEntity(survivor, best.x, best.y)) return false;
  fleeHistory.set(survivor, { from, to: best, direction: best.direction, tick: context.tick });
  return true;
}

function targeted(verb: string, target: Target, context: ScriptContext): boolean {
  const { grid, survivor } = context;
  if (!(survivor instanceof Survivor)) return false;
  const range = verb === "ATTACK" || verb === "OPEN" || verb === "SEARCH" ? Math.min(target.range ?? 1, 1) : target.range;
  const resolved = resolveTargets({ ...target, range }, context)[0];
  if (!resolved) return false;
  if (verb === "MOVE_AWAY") return flee(context, resolved);
  if (verb === "PATROL") {
    const home = survivor.memory.home;
    if (!home) return false;
    const destination = `${resolved.x},${resolved.y}`;
    let state = patrols.get(survivor);
    if (!state || state.destination !== destination) { state = { destination, returning: false }; patrols.set(survivor, state); }
    let goal = state.returning ? home : resolved;
    if (spatialDistance(survivor, goal) === 0) { state.returning = !state.returning; goal = state.returning ? home : resolved; }
    return approach(context, goal, false);
  }
  if (["MOVE_TO", "FOLLOW", "RETURN", "PATROL"].includes(verb)) {
    return approach(context, resolved, ["zombie", "survivor", "container", "car", "door"].includes(target.type) || !grid.isWalkable(resolved.x, resolved.y));
  }
  if (verb === "OPEN") {
    const cell = grid.getCell(resolved.x, resolved.y);
    if (!cell || spatialDistance(survivor, resolved) !== 1 || cell.tileType !== "door") return false;
    cell.tileType = "openDoor";
    return true;
  }
  if (verb === "SEARCH") {
    if (resolved instanceof ItemContainer) return survivor.searchContainer(grid, resolved) !== null;
    return false;
  }
  if ((verb === "ATTACK" || verb === "SHOOT") && resolved instanceof Zombie) {
    if (verb === "SHOOT") {
      if (survivor.equippedItem?.type !== "gun" || survivor.ammo <= 0) return false;
      survivor.ammo--;
    }
    resolved.takeDamage(verb === "SHOOT" ? 40 : survivor.equippedItem?.type === "weapon" ? 40 : 25);
    if (!resolved.isAlive()) grid.removeEntity(resolved.id);
    return true;
  }
  return false;
}

/** Execute one selected action. A failed action still consumes the tick. */
export function executeSurvivorAction(action: SurvivorAction, context: ScriptContext): string {
  const { grid, survivor } = context;
  if (!(survivor instanceof Survivor) || !survivor.isAlive()) return "Survivor cannot act.";
  const moving = isMovement(action);
  if (moving && (context.canMove === false || survivor.stamina < 2)) return "Survivor rests before moving.";
  const before = { x: survivor.x, y: survivor.y };
  let success = false;
  switch (action.type) {
    case "move": {
      const delta = offsets[action.direction];
      success = grid.moveEntity(survivor, survivor.x + delta.x, survivor.y + delta.y); break;
    }
    case "explore": case "wander": success = survivor.explore(grid); break;
    case "moveAway": success = targeted("MOVE_AWAY", { type: "zombie", selector: "nearest" }, context); break;
    case "moveToContainer": success = targeted("MOVE_TO", { type: "container", selector: "nearest", range: action.range }, context); break;
    case "attack": success = targeted("ATTACK", { type: "zombie", selector: "nearest" }, context); break;
    case "openDoor": success = survivor.openDoor(grid); break;
    case "pickUpItems": success = survivor.pickUpItems(grid).length > 0; break;
    case "searchContainer": success = targeted("SEARCH", { type: "container", selector: "nearest" }, context); break;
    case "lookFloor":
      survivor.stamina = Math.min(100, survivor.stamina + 3);
      return survivor.lookAtFloor(grid, action.itemType).map(item => item.name).join(", ") || "No matching floor items.";
    case "item":
      if (action.verb === "PICK_UP") success = survivor.pickUpItems(grid, action.itemType).length > 0;
      else if (action.verb === "DROP") success = survivor.dropItem(grid, action.itemType);
      else if (action.verb === "EQUIP") success = survivor.equip(action.itemType);
      else success = survivor.useItem(action.itemType);
      break;
    case "reload": success = survivor.useItem("ammo"); break;
    case "remember": {
      const position = action.target === "position" ? survivor : resolveTargets(action.target, context)[0];
      if (position) { survivor.memory[action.slot] = { x: position.x, y: position.y }; success = true; }
      break;
    }
    case "targeted":
      if (action.verb === "SEARCH" && action.target.type !== "container") {
        // Search for an item means approach a visible floor pile, never inspect hidden loot.
        if (context.canMove === false || survivor.stamina < 2) break;
        const found = resolveTargets(action.target, context)[0];
        success = found ? approach(context, found, false) : survivor.explore(grid);
      } else success = targeted(action.verb, action.target, context);
      break;
    case "wait": success = true; break;
    case "chase": break;
  }
  if (survivor.x !== before.x || survivor.y !== before.y) survivor.stamina = Math.max(0, survivor.stamina - 2);
  else survivor.stamina = Math.min(100, survivor.stamina + 3);
  survivor.updateVision(grid);
  return success ? `Survivor: ${action.type === "targeted" || action.type === "item" ? action.verb : action.type}.` : "Action unavailable: check target, reach, or inventory.";
}
