import type { Condition, SurvivorAction } from './types.js';
export interface ConditionTrace {
  condition: Condition;
  matched: boolean;
  actual?: number | string | boolean | null;
  /** Only evaluated children are present; Boolean evaluation short-circuits. */
  children?: ConditionTrace[];
}
export interface RuleTrace {
  ruleIndex: number;
  actionSource?: string;
  matched?: boolean;
  condition?: ConditionTrace;
  skippedReason?: string;
}
/** Optional per-decision output. Not persisted or sent to other players. */
export interface DecisionTrace {
  rules: RuleTrace[];
  mode?: string;
  modeAfter?: string;
  selectedRule?: number;
  selectedAction?: SurvivorAction;
  result?: string;
  failureReason?: string;
}
