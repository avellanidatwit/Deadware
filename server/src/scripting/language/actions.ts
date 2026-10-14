import type { SurvivorAction } from './types.js';
export function isMovement(action: SurvivorAction): boolean {
  return (
    action.type === 'sprint' ||
    action.type === 'move' ||
    action.type === 'explore' ||
    (action.type === 'targeted' &&
      ['MOVE_TO', 'MOVE_AWAY', 'FOLLOW', 'RETURN', 'PATROL', 'FIND'].includes(action.verb))
  );
}
