import type { Condition, SurvivorAction, SurvivorProgram } from './types.js';
import type { Target } from './selectors.js';
export function serializeTarget(t: Target): string {
  return `${t.selector} ${t.type}${t.range === undefined ? '' : ` ${t.range}`}`;
}
export function serializeCondition(c: Condition): string {
  switch (c.type) {
    case 'and':
    case 'or': {
      // The language has no parentheses. Refuse trees its precedence cannot preserve.
      if (
        c.conditions.some(
          (child) => child.type === 'always' || (c.type === 'and' && child.type === 'or'),
        )
      )
        throw new Error('This condition cannot be represented without parentheses.');
      return c.conditions.map(serializeCondition).join(c.type === 'and' ? ' AND ' : ' OR ');
    }
    case 'not':
      if (['and', 'or', 'always'].includes(c.condition.type))
        throw new Error('Cannot negate a group in SurvivorScript.');
      return `NOT ${serializeCondition(c.condition)}`;
    case 'stat':
      return `${c.stat} ${c.operator} ${c.value}`;
    case 'mode':
      return `mode ${c.operator} ${c.value}`;
    case 'hasItem':
    case 'equipped':
      return `${c.type} ${c.itemType}`;
    case 'itemCount':
      return `itemCount ${c.itemType} ${c.operator} ${c.value}`;
    case 'count':
      return `count ${c.target.type} ${c.target.range ?? 0} ${c.operator} ${c.value}`;
    case 'distance':
      return `distance ${serializeTarget(c.target)} ${c.operator} ${c.value}`;
    case 'visible':
      return `visible ${serializeTarget(c.target)}`;
    case 'remembered':
      return `remembered ${c.slot}`;
    default:
      return c.type;
  }
}
export function serializeAction(a: SurvivorAction): string {
  switch (a.type) {
    case 'sprint':
      return `SPRINT ${serializeAction(a.action)}`;
    case 'targeted':
      return `${a.verb} ${serializeTarget(a.target)}`;
    case 'item':
      return `${a.verb} ${a.itemType}`;
    case 'remember':
      return `REMEMBER ${a.target === 'position' ? 'position' : serializeTarget(a.target)} AS ${a.slot}`;
    case 'setMode':
      return `SET_MODE ${a.mode}`;
    case 'move':
      return `MOVE ${a.direction}`;
    case 'pickUpItems':
      return 'PICK_UP items';
    case 'lookFloor':
      return `LOOK floor${a.itemType ? ` ${a.itemType}` : ''}`;
    default:
      return a.type.toUpperCase();
  }
}
export function serializeProgram(p: SurvivorProgram): string {
  return [
    ...p.modes.map((m) => `MODE ${m}`),
    ...p.rules.map(
      (r) =>
        `${r.condition.type === 'always' ? 'OTHERWISE' : `WHEN ${serializeCondition(r.condition)}`}\n    ${serializeAction(r.action)}`,
    ),
  ].join('\n\n');
}
/** Builder uses the execution model directly; only flat ALL/ANY groups are editable. */
export function builderCompatible(p: SurvivorProgram): boolean {
  const leaf = (c: Condition): boolean =>
    c.type !== 'and' &&
    c.type !== 'or' &&
    c.type !== 'always' &&
    (c.type !== 'not' || (leaf(c.condition) && c.condition.type !== 'not'));
  let fallback = false;
  return p.rules.every((r, i) => {
    if (r.condition.type === 'always') {
      if (fallback || i !== p.rules.length - 1) return false;
      fallback = true;
      return true;
    }
    return (
      leaf(r.condition) ||
      ((r.condition.type === 'and' || r.condition.type === 'or') &&
        r.condition.conditions.every(leaf))
    );
  });
}
export function renameMode(p: SurvivorProgram, from: string, to: string): SurvivorProgram {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(to) || (p.modes.includes(to) && from !== to))
    throw new Error(
      'Choose a unique mode name: letters, numbers or underscores, starting with a letter.',
    );
  const visit = (c: Condition): Condition =>
    c.type === 'mode' && c.value === from
      ? { ...c, value: to }
      : c.type === 'not'
        ? { ...c, condition: visit(c.condition) }
        : c.type === 'and' || c.type === 'or'
          ? { ...c, conditions: c.conditions.map(visit) }
          : c;
  return {
    ...p,
    modes: p.modes.map((m) => (m === from ? to : m)),
    rules: p.rules.map((r) => ({
      ...r,
      condition: visit(r.condition),
      action:
        r.action.type === 'setMode' && r.action.mode === from
          ? { ...r.action, mode: to }
          : r.action,
    })),
  };
}
