import { actionTargets, actionItems } from '../language/options.js';
import type { SurvivorAction } from '../language/types.js';
import { SurvivorScriptError } from '../language/errors.js';
import { parseTarget } from './targets.js';
import { ITEM_TYPES } from '../../data/itemCatalog.js';
import type { ItemType } from '../../entities/item.js';
export function parseAction(text: string, lineNumber: number): SurvivorAction {
  if (text.startsWith('SPRINT ')) {
    const action = parseAction(text.slice(7).trim(), lineNumber);
    if (
      !['move', 'explore'].includes(action.type) &&
      !(
        action.type === 'targeted' &&
        ['MOVE_TO', 'MOVE_AWAY', 'FOLLOW', 'RETURN', 'PATROL', 'FIND'].includes(action.verb)
      )
    )
      throw new SurvivorScriptError('SPRINT must prefix a movement action.', lineNumber);
    return { type: 'sprint', action };
  }
  const parts = text.split(/\s+/);

  const command = parts[0];
  if (
    (['WAIT', 'EXPLORE', 'RELOAD'].includes(command) && parts.length !== 1) ||
    (command === 'MOVE' && parts.length !== 2) ||
    (command === 'MOVE_AWAY' && parts.length < 2)
  ) {
    throw new SurvivorScriptError(`Unexpected arguments for ${command}.`, lineNumber);
  }
  if (command === 'RELOAD') return { type: 'reload' };
  const remember = text.match(
    /^(?:REMEMBER (.+) AS (home|target|lastZombie|lastContainer)|SET (home|target|lastZombie|lastContainer) = (.+))$/,
  );
  if (remember) {
    const source = remember[1] ?? remember[4];
    return {
      type: 'remember',
      slot: (remember[2] ?? remember[3]) as 'home',
      target: source === 'position' ? 'position' : parseTarget(source, lineNumber),
    };
  }
  if (
    ['PICK_UP', 'DROP', 'EAT', 'USE', 'EQUIP'].includes(command) &&
    parts.length === 2 &&
    ITEM_TYPES.includes(parts[1] as ItemType)
  ) {
    const itemType = parts[1] as ItemType;
    if (!actionItems(command).includes(itemType)) {
      throw new SurvivorScriptError(`Unsupported item for ${command}.`, lineNumber);
    }
    return { type: 'item', verb: command as 'PICK_UP', itemType };
  }
  const mode = text.match(/^SET_MODE ([a-z][a-z0-9_]{0,31})$/);
  if (mode) return { type: 'setMode', mode: mode[1] };
  if (
    [
      'MOVE_TO',
      'MOVE_AWAY',
      'ATTACK',
      'SHOOT',
      'SEARCH',
      'FIND',
      'OPEN',
      'FOLLOW',
      'RETURN',
      'PATROL',
    ].includes(command)
  ) {
    const target = parseTarget(parts.slice(1).join(' '), lineNumber);
    if (!actionTargets(command, 'any').includes(target.type)) {
      throw new SurvivorScriptError(`Invalid target for ${command}.`, lineNumber);
    }
    return { type: 'targeted', verb: command as 'MOVE_TO', target };
  }
  if (command === 'PICK_UP' && parts.length === 2 && parts[1] === 'items')
    return { type: 'pickUpItems' };
  if (
    command === 'LOOK' &&
    parts[1] === 'floor' &&
    (parts.length === 2 || (parts.length === 3 && ITEM_TYPES.includes(parts[2] as ItemType)))
  ) {
    return { type: 'lookFloor', itemType: parts[2] as ItemType | undefined };
  }

  if (command === 'MOVE') {
    const direction = parts[1];

    if (
      direction !== 'north' &&
      direction !== 'south' &&
      direction !== 'east' &&
      direction !== 'west'
    ) {
      throw new SurvivorScriptError(`Invalid direction "${direction}".`, lineNumber);
    }

    return {
      type: 'move',
      direction,
    };
  }

  if (command === 'EXPLORE') {
    return {
      type: 'explore',
    };
  }

  if (command === 'WAIT') {
    return {
      type: 'wait',
    };
  }

  throw new SurvivorScriptError(`Unknown action "${text}"`, lineNumber);
}
