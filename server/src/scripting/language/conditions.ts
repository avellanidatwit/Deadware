import type { Condition } from "./types.js";
/** Validation must descend through every Boolean branch, including NOT. */
export function conditionLeaves(condition: Condition): Condition[] {
  if (condition.type === "and" || condition.type === "or") return condition.conditions.flatMap(conditionLeaves);
  if (condition.type === "not") return conditionLeaves(condition.condition);
  return [condition];
}
