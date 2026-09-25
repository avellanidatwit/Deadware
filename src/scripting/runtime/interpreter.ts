import type { SurvivorProgram, SurvivorAction } from "../language/types.js";
import type { ScriptContext } from "./context.js";
import { evaluateCondition } from "./conditionEvaluator.js";
import { isMovement } from "../language/actions.js";
import type { Condition } from "../language/types.js";
import { refreshMemory } from "./targetResolver.js";

/** Only positive conditions in the selected Boolean branch constrain CHASE. */
function matchedSightRanges(condition: Condition, context: ScriptContext): number[] {
  if (condition.type === "survivorNearby") return [condition.range ?? context.detectionRange ?? 5];
  if (condition.type === "and") return condition.conditions.flatMap(part => matchedSightRanges(part, context));
  if (condition.type === "or") {
    const branch = condition.conditions.find(part => evaluateCondition(part, context));
    return branch ? matchedSightRanges(branch, context) : [];
  }
  return [];
}
export function runSurvivorProgram(
  program: SurvivorProgram,
  context: ScriptContext
): SurvivorAction {
  if (!context.survivor.isAlive()) return { type: "wait" };
  refreshMemory(context);
  // Rules execute from top to bottom.
  // First matching rule wins.

  for (const rule of program.rules) {
    const movement = isMovement(rule.action);
    if (movement && (context.canMove === false || "stamina" in context.survivor && context.survivor.stamina < 2)) continue;
    if (
      evaluateCondition(
        rule.condition,
        context
      )
    ) {
      // Use the matched detection radius for this chase only, without changing the entity default.
      const sightRules = matchedSightRanges(rule.condition, context);
      if (rule.action.type === "chase" && sightRules.length > 0) {
        return { ...rule.action, range: Math.min(...sightRules) };
      }
      return rule.action;
    }
  }

  return {
    type: "wait",
  };
}
