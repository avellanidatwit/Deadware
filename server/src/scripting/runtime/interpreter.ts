import type { DecisionTrace, RuleTrace } from '../language/trace.js';
import { Survivor } from '../../entities/survivor.js';
import type { SurvivorProgram, SurvivorAction } from '../language/types.js';
import type { ScriptContext } from './context.js';
import { evaluateCondition } from './conditionEvaluator.js';
import { isMovement } from '../language/actions.js';
import { refreshMemory } from './targetResolver.js';

export function runSurvivorProgram(
  program: SurvivorProgram,
  context: ScriptContext,
  trace?: DecisionTrace,
): SurvivorAction {
  if (trace) {
    for (const key of Object.keys(trace)) delete (trace as unknown as Record<string, unknown>)[key];
    trace.rules = [];
  }
  const selected = (action: SurvivorAction, ruleIndex?: number) => {
    if (trace) {
      trace.selectedAction = action;
      trace.selectedRule = ruleIndex;
    }
    return action;
  };
  if (!context.survivor.isAlive()) {
    if (trace) trace.failureReason = 'Actor is dead.';
    return selected({ type: 'wait' });
  }
  if (!program.modes.includes(context.survivor.mode ?? ''))
    context.survivor.mode = program.modes[0];
  if (trace) trace.mode = context.survivor.mode;
  refreshMemory(context);
  // Rules execute from top to bottom.
  // First matching rule wins.

  for (const [index, rule] of program.rules.entries()) {
    const entry: RuleTrace | undefined = trace
      ? { ruleIndex: index + 1, actionSource: rule.actionSource }
      : undefined;
    if (entry) trace!.rules.push(entry);
    // Preserve eligibility behavior: these rules skip before evaluating conditions.
    if (
      context.survivor instanceof Survivor &&
      (rule.action.type === 'pickUpItems' ||
        (rule.action.type === 'item' && rule.action.verb === 'PICK_UP')) &&
      !context.survivor.canPickUpItems(
        context.grid,
        rule.action.type === 'item' ? rule.action.itemType : undefined,
      )
    ) {
      if (entry) entry.skippedReason = 'No eligible floor items or inventory capacity.';
      continue;
    }
    if (
      isMovement(rule.action) &&
      (context.canMove === false || ('stamina' in context.survivor && context.survivor.stamina < 2))
    ) {
      if (entry) entry.skippedReason = 'Movement unavailable or insufficient stamina.';
      continue;
    }
    const matched = evaluateCondition(
      rule.condition,
      context,
      entry
        ? (condition) => {
            entry.condition = condition;
          }
        : undefined,
    );
    if (entry) entry.matched = matched;
    if (matched) return selected(rule.action, index + 1);
  }
  return selected({ type: 'wait' });
}
