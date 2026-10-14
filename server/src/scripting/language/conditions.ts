import type { Condition } from './types.js';
/** Validation must descend through every Boolean branch, including NOT. */
export function conditionLeaves(condition: Condition): Condition[] {
  if (condition.type === 'and' || condition.type === 'or')
    return condition.conditions.flatMap(conditionLeaves);
  if (condition.type === 'not') return conditionLeaves(condition.condition);
  return [condition];
}

/** Count Boolean operators as well as leaves, including OTHERWISE. */
export function conditionNodeCount(condition: Condition): number {
  if (condition.type === 'and' || condition.type === 'or')
    return 1 + condition.conditions.reduce((sum, child) => sum + conditionNodeCount(child), 0);
  return condition.type === 'not' ? 1 + conditionNodeCount(condition.condition) : 1;
}
