import type { TargetType } from './selectors.js';
import { targetTypes } from './selectors.js';
import { ITEM_TYPES } from '../../data/itemCatalog.js';
export const memorySlots = ['home', 'target', 'lastZombie', 'lastContainer'] as const;
export function actionTargets(
  verb: string,
  actor: 'survivor' | 'zombie' | 'any' = 'survivor',
): readonly TargetType[] {
  if (verb === 'ATTACK' || verb === 'SHOOT')
    return actor === 'any'
      ? ['zombie', 'survivor']
      : [actor === 'survivor' ? 'zombie' : 'survivor'];
  if (verb === 'MOVE_AWAY' || verb === 'FOLLOW') return ['zombie', 'survivor'];
  if (verb === 'OPEN') return ['door'];
  if (verb === 'SEARCH') return ['container', 'car'];
  if (verb === 'FIND') return ITEM_TYPES;
  if (verb === 'RETURN' || verb === 'PATROL') return memorySlots;
  return targetTypes;
}
export function actionItems(verb: string): readonly (typeof ITEM_TYPES)[number][] {
  if (verb === 'EAT') return ['food'];
  if (verb === 'USE') return ['bandage', 'water'];
  if (verb === 'EQUIP') return ['weapon', 'gun', 'armor'];
  return ITEM_TYPES;
}
