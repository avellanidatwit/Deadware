import type { ItemType } from '../../entities/item.js';
import type { Target, MemorySlot } from './selectors.js';
export type Direction = 'north' | 'south' | 'east' | 'west';
export type ComparisonOperator = '<' | '>' | '<=' | '>=' | '==' | '!=';
export type SurvivorAction =
  | { type: 'sprint'; action: SurvivorAction }
  | {
      type: 'targeted';
      verb:
        | 'MOVE_TO'
        | 'MOVE_AWAY'
        | 'ATTACK'
        | 'SHOOT'
        | 'SEARCH'
        | 'FIND'
        | 'OPEN'
        | 'FOLLOW'
        | 'RETURN'
        | 'PATROL';
      target: Target;
    }
  | { type: 'item'; verb: 'PICK_UP' | 'DROP' | 'EAT' | 'USE' | 'EQUIP'; itemType: ItemType }
  | { type: 'remember'; slot: MemorySlot; target: Target | 'position' }
  | { type: 'setMode'; mode: string }
  | { type: 'reload' }
  | { type: 'pickUpItems' }
  | { type: 'lookFloor'; itemType?: ItemType }
  | { type: 'move'; direction: Direction }
  | { type: 'explore' }
  | { type: 'wait' };
export type Condition =
  | { type: 'visible'; target: Target }
  | { type: 'or' | 'and'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | {
      type: 'stat';
      stat: 'health' | 'hunger' | 'thirst' | 'stamina' | 'ammo';
      operator: ComparisonOperator;
      value: number;
    }
  | { type: 'mode'; operator: '==' | '!='; value: string }
  | { type: 'hasItem' | 'equipped'; itemType: ItemType }
  | { type: 'itemCount'; itemType: ItemType; operator: ComparisonOperator; value: number }
  | { type: 'count' | 'distance'; target: Target; operator: ComparisonOperator; value: number }
  | { type: 'remembered'; slot: MemorySlot }
  | { type: 'inventoryFull' | 'inventorySpace' | 'itemsOnFloor' | 'always' };
export interface ScriptRule {
  actionSource?: string;
  condition: Condition;
  action: SurvivorAction;
}
export interface SurvivorProgram {
  rules: ScriptRule[];
  modes: string[];
  memoryCost?: number;
}
