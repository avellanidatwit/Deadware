import { itemMatchesCategory } from '../../entities/item.js';
import type { Condition, ComparisonOperator } from '../language/types.js';
import type { ConditionTrace } from '../language/trace.js';
import type { ScriptContext } from './context.js';
import { spatialDistance } from '../../world/perception.js';
import { resolveTargets } from './targetResolver.js';
import { Survivor } from '../../entities/survivor.js';

/** Tracing observes the same evaluation; no extra target queries or hidden branches. */
export function evaluateCondition(
  condition: Condition,
  context: ScriptContext,
  report?: (trace: ConditionTrace) => void,
): boolean {
  const actor = context.survivor;
  const human = actor instanceof Survivor ? actor : undefined;
  let actual: number | string | boolean | null | undefined;
  let matched = false;
  const children: ConditionTrace[] = [];
  const child = (part: Condition) =>
    evaluateCondition(part, context, report ? (trace) => children.push(trace) : undefined);
  switch (condition.type) {
    case 'and':
      matched = condition.conditions.every(child);
      break;
    case 'or':
      matched = condition.conditions.some(child);
      break;
    case 'not':
      matched = !child(condition.condition);
      break;
    case 'stat':
      actual = condition.stat === 'health' ? actor.health : (human?.[condition.stat] ?? null);
      matched = actual !== null && compareNumbers(actual, condition.operator, condition.value);
      break;
    case 'mode':
      actual = actor.mode ?? null;
      matched =
        condition.operator === '==' ? actual === condition.value : actual !== condition.value;
      break;
    case 'itemCount':
      actual = human?.getItemCount(condition.itemType) ?? null;
      matched = actual !== null && compareNumbers(actual, condition.operator, condition.value);
      break;
    case 'hasItem':
      actual = human?.getItemCount(condition.itemType) ?? 0;
      matched = actual > 0;
      break;
    case 'equipped':
      actual =
        !!human &&
        (condition.itemType === 'armor'
          ? !!human.equippedArmor
          : !!human.equippedItem && itemMatchesCategory(human.equippedItem, condition.itemType));
      matched = actual;
      break;
    case 'remembered':
      actual = human?.memory[condition.slot] !== undefined;
      matched = actual;
      break;
    case 'count':
      actual = resolveTargets(condition.target, context).length;
      matched = compareNumbers(actual, condition.operator, condition.value);
      break;
    case 'visible':
      actual = resolveTargets(condition.target, context).length > 0;
      matched = actual;
      break;
    case 'distance': {
      const target = resolveTargets(condition.target, context)[0];
      actual = target ? spatialDistance(actor, target) : null;
      matched = actual !== null && compareNumbers(actual, condition.operator, condition.value);
      break;
    }
    case 'inventorySpace':
      actual = human?.inventory.length ?? null;
      matched = actual !== null && actual < human!.inventoryCapacity;
      break;
    case 'inventoryFull':
      actual = human?.inventory.length ?? null;
      matched = actual !== null && actual >= human!.inventoryCapacity;
      break;
    case 'itemsOnFloor':
      actual = human?.lookAtFloor(context.grid).length ?? 0;
      matched = actual > 0;
      break;
    case 'always':
      actual = true;
      matched = true;
      break;
  }
  report?.({
    condition,
    matched,
    ...(actual === undefined ? {} : { actual }),
    ...(children.length ? { children } : {}),
  });
  return matched;
}

// ======================================================
// COMPARISON
// ======================================================

export function compareNumbers(left: number, operator: ComparisonOperator, right: number): boolean {
  switch (operator) {
    case '<':
      return left < right;

    case '>':
      return left > right;

    case '<=':
      return left <= right;

    case '>=':
      return left >= right;

    case '==':
      return left === right;

    case '!=':
      return left !== right;
  }
}
