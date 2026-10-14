import type { Condition, ComparisonOperator } from '../language/types.js';
import { SurvivorScriptError } from '../language/errors.js';
import { parseTarget } from './targets.js';
import { ITEM_TYPES } from '../../data/itemCatalog.js';
import type { ItemType } from '../../entities/item.js';
export function parseCondition(text: string, lineNumber: number): Condition {
  if (/[()]/.test(text))
    throw new SurvivorScriptError(
      'Parentheses are not supported; use separate priority rules.',
      lineNumber,
    );
  if (/\bOR\b/.test(text)) {
    const parts = text.split(/\bOR\b/).map((part) => part.trim());
    if (parts.some((part) => !part))
      throw new SurvivorScriptError('OR requires a condition on both sides.', lineNumber);
    return { type: 'or', conditions: parts.map((part) => parseCondition(part, lineNumber)) };
  }
  if (/\bAND\b/.test(text)) {
    const parts = text.split(/\bAND\b/).map((part) => part.trim());
    if (parts.some((part) => !part))
      throw new SurvivorScriptError('AND requires a condition on both sides.', lineNumber);
    return { type: 'and', conditions: parts.map((part) => parseCondition(part, lineNumber)) };
  }
  if (text.startsWith('NOT '))
    return { type: 'not', condition: parseCondition(text.slice(4).trim(), lineNumber) };
  const mode = text.match(/^mode\s*(==|!=)\s*([a-z][a-z0-9_]{0,31})$/);
  if (mode) return { type: 'mode', operator: mode[1] as '==' | '!=', value: mode[2] };
  const stat = text.match(/^(health|hunger|thirst|stamina|ammo)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (stat && Number.isSafeInteger(Number(stat[3])))
    return {
      type: 'stat',
      stat: stat[1] as 'health',
      operator: stat[2] as ComparisonOperator,
      value: Number(stat[3]),
    };
  if (/^itemCount\b/.test(text)) {
    const match = text.match(/^itemCount\s+(\w+)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
    if (
      !match ||
      !ITEM_TYPES.includes(match[1] as ItemType) ||
      !Number.isSafeInteger(Number(match[3]))
    ) {
      throw new SurvivorScriptError(
        'Use itemCount ITEM_TYPE OPERATOR INTEGER, for example itemCount water < 2. The count must be a nonnegative whole number.',
        lineNumber,
      );
    }
    return {
      type: 'itemCount',
      itemType: match[1] as ItemType,
      operator: match[2] as ComparisonOperator,
      value: Number(match[3]),
    };
  }
  const item = text.match(/^(hasItem|equipped)\s+(\w+)$/);
  if (item && ITEM_TYPES.includes(item[2] as ItemType))
    return { type: item[1] as 'hasItem' | 'equipped', itemType: item[2] as ItemType };
  if (text.startsWith('visible ')) {
    const target = parseTarget(text.slice(8), lineNumber);
    if (['home', 'target', 'lastZombie', 'lastContainer'].includes(target.type))
      throw new SurvivorScriptError(
        'visible requires a sensed target, not a memory slot.',
        lineNumber,
      );
    return { type: 'visible', target };
  }
  const count = text.match(/^count\s+(\w+)\s+(\d+)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (count && Number.isSafeInteger(Number(count[4]))) {
    const target = parseTarget(`${count[1]} ${count[2]}`, lineNumber);
    if (['home', 'target', 'lastZombie', 'lastContainer'].includes(target.type))
      throw new SurvivorScriptError(
        'count requires a visible target category, not memory.',
        lineNumber,
      );
    return {
      type: 'count',
      target,
      operator: count[3] as ComparisonOperator,
      value: Number(count[4]),
    };
  }
  const memory = text.match(/^remembered (home|target|lastZombie|lastContainer)$/);
  if (memory) return { type: 'remembered', slot: memory[1] as 'home' };
  const distance = text.match(/^distance\s+(.+?)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (distance && Number.isSafeInteger(Number(distance[3])))
    return {
      type: 'distance',
      target: parseTarget(distance[1], lineNumber),
      operator: distance[2] as ComparisonOperator,
      value: Number(distance[3]),
    };
  if (text === 'inventorySpace') return { type: 'inventorySpace' };
  if (text === 'inventoryFull') return { type: 'inventoryFull' };
  if (text === 'itemsOnFloor') return { type: 'itemsOnFloor' };
  throw new SurvivorScriptError(`Unknown condition "${text}"`, lineNumber);
}
