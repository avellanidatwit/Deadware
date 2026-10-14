import type { SurvivorProgram } from '../../server/src/scripting/language/types.js';
/** Immutable priority change. Fallback is a fixed final item, never a drop target. */
export function reorderRules(
  rules: SurvivorProgram['rules'],
  from: number,
  to: number,
): SurvivorProgram['rules'] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= rules.length ||
    to >= rules.length ||
    from === to ||
    rules[from].condition.type === 'always' ||
    rules[to].condition.type === 'always'
  )
    return rules;
  const result = [...rules];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}
