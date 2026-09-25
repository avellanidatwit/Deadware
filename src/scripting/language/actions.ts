import type { SurvivorAction } from "./types.js";
export function isMovement(action: SurvivorAction): boolean {
  return ["move", "moveAway", "moveToContainer", "explore", "wander", "chase"].includes(action.type) ||
    (action.type === "targeted" && (["MOVE_TO", "MOVE_AWAY", "FOLLOW", "RETURN", "PATROL"].includes(action.verb) || action.verb === "SEARCH" && action.target.type !== "container"));
}
