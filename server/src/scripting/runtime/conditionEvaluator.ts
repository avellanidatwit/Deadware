import type { Condition, ComparisonOperator } from "../language/types.js";
import type { ScriptContext } from "./context.js";
import { searchTargets } from "../../world/perception.js";
import { spatialDistance } from "../../world/perception.js";
import { resolveTargets } from "./targetResolver.js";
import { Survivor } from "../../entities/survivor.js";
export function evaluateCondition(
  condition: Condition,
  context: ScriptContext
): boolean {
  switch (condition.type) {
    case "or": return condition.conditions.some(part => evaluateCondition(part, context));
    case "not": return !evaluateCondition(condition.condition, context);
    case "stat": return context.survivor instanceof Survivor && compareNumbers(context.survivor[condition.stat], condition.operator, condition.value);
    case "hasItem": return context.survivor instanceof Survivor && context.survivor.inventory.some(item => item.type === condition.itemType);
    case "equipped": return context.survivor instanceof Survivor && context.survivor.equippedItem?.type === condition.itemType;
    case "remembered": return context.survivor instanceof Survivor && context.survivor.memory[condition.slot] !== undefined;
    case "count": return compareNumbers(resolveTargets(condition.target, context).length, condition.operator, condition.value);
    case "visible": return resolveTargets(condition.target, context).length > 0;
    case "distance": {
      const target = resolveTargets(condition.target, context)[0];
      return target !== undefined && compareNumbers(spatialDistance(context.survivor, target), condition.operator, condition.value);
    }
    case "and":
      return condition.conditions.every(part => evaluateCondition(part, context));
    case "nearbydoor":
      return "findNearbyDoors" in context.survivor && context.survivor.findNearbyDoors(context.grid).length > 0;
    case "inventorySpace":
      return "inventory" in context.survivor && context.survivor.inventory.length < context.survivor.inventoryCapacity;
    case "inventoryFull":
      return "inventory" in context.survivor && context.survivor.inventory.length >= context.survivor.inventoryCapacity;
    case "itemsOnFloor":
      return "lookAtFloor" in context.survivor && context.survivor.lookAtFloor(context.grid).length > 0;
    case "containerNearby":
      return "findContainers" in context.survivor && context.survivor.findContainers(context.grid, condition.range ?? 1)
        .some(container => container.contents.length > 0);
    case "always":
      return true;

    case "zombieNearby":
      return isZombieNearby(context, condition.range ?? 5);

    case "survivorNearby":
      return resolveTargets({ type: "survivor", selector: "nearest", range: condition.range ?? context.detectionRange ?? 5 }, context).length > 0;

    case "healthComparison":
      return compareNumbers(
        context.survivor.health,
        condition.operator,
        condition.value
      );
  }
}

// ======================================================
// ZOMBIE DETECTION
// ======================================================

function isZombieNearby(
  context: ScriptContext,
  range = 5
): boolean {
  return searchTargets(context.grid, context.survivor, context.zombies, {
    range: "sightRange" in context.survivor ? Math.min(range, context.survivor.sightRange) : range,
    predicate: zombie => zombie.id !== context.survivor.id && zombie.isAlive(),
  }).length > 0;
}

// ======================================================
// COMPARISON
// ======================================================

export function compareNumbers(
  left: number,
  operator: ComparisonOperator,
  right: number
): boolean {
  switch (operator) {
    case "<":
      return left < right;

    case ">":
      return left > right;

    case "<=":
      return left <= right;

    case ">=":
      return left >= right;

    case "==":
      return left === right;

    case "!=":
      return left !== right;
  }
}
