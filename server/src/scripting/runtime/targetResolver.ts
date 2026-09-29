import type { ScriptContext } from "./context.js";
import type { Target, MemorySlot } from "../language/selectors.js";
import { searchTargets, searchCells, searchEntities, spatialDistance, type Position } from "../../world/perception.js";
import { ItemContainer } from "../../entities/container.js";
import { Car } from "../../entities/car.js";
import { Survivor } from "../../entities/survivor.js";
import { ITEM_TYPES, type ItemType } from "../../data/itemCatalog.js";

export type ResolvedTarget = Position & { health?: number };

/** All live queries go through LOS and the actor's sight cap. Memory is a snapshot. */
export function resolveTargets(target: Target, context: ScriptContext): ResolvedTarget[] {
  const { grid, survivor: actor } = context;
  if (["home", "target", "lastZombie", "lastContainer"].includes(target.type)) {
    const position = actor instanceof Survivor ? actor.memory[target.type as MemorySlot] : undefined;
    return position ? [{ ...position }] : [];
  }
  const range = Math.min(target.range ?? (actor instanceof Survivor ? actor.sightRange : context.detectionRange ?? 5),
    actor instanceof Survivor ? actor.sightRange : Infinity);
  let candidates: ResolvedTarget[];
  if (target.type === "zombie" || target.type === "survivor") {
    const entities = target.type === "zombie" ? context.zombies : context.survivors ?? [];
    candidates = searchTargets<Survivor | import("../../entities/zombie.js").Zombie>(grid, actor, entities, {
      range, predicate: entity => entity.id !== actor.id && entity.isAlive(),
    });
  } else if (target.type === "container" || target.type === "car") {
    candidates = searchEntities(grid, actor, { range, predicate: entity => target.type === "car" ? entity instanceof Car : entity instanceof ItemContainer && entity.contents.length > 0 });
  } else {
    candidates = searchCells(grid, actor, { range, predicate: cell => {
      if (target.type === "door") return cell.tileType === "door";
      if (target.type === "building") return cell.tileType === "buildingFloor" || cell.tileType === "buildingWall";
      return ITEM_TYPES.includes(target.type as ItemType) && cell.items.some(item => item.type === target.type);
    } });
  }
  if (target.selector === "farthest") candidates.sort((a, b) => spatialDistance(actor, b) - spatialDistance(actor, a));
  if (target.selector === "weakest") candidates.sort((a, b) => (a.health ?? 0) - (b.health ?? 0));
  if (target.selector === "strongest") candidates.sort((a, b) => (b.health ?? 0) - (a.health ?? 0));
  return candidates;
}

export function refreshMemory(context: ScriptContext): void {
  if (!(context.survivor instanceof Survivor)) return;
  for (const [type, slot] of [["zombie", "lastZombie"], ["container", "lastContainer"]] as const) {
    const found = resolveTargets({ type, selector: "nearest" }, context)[0];
    if (found) context.survivor.memory[slot] = { x: found.x, y: found.y };
  }
}
