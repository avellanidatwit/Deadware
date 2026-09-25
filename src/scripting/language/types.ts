import type { ItemType } from "../../entities/item.js";
import type { Target, MemorySlot } from "./selectors.js";
export type Direction =
  | "north"
  | "south"
  | "east"
  | "west";

export type SurvivorAction =
  | { type: "targeted"; verb: "MOVE_TO" | "MOVE_AWAY" | "ATTACK" | "SHOOT" | "SEARCH" | "OPEN" | "FOLLOW" | "RETURN" | "PATROL"; target: Target }
  | { type: "item"; verb: "PICK_UP" | "DROP" | "EAT" | "USE" | "EQUIP"; itemType: ItemType }
  | { type: "remember"; slot: MemorySlot; target: Target | "position" }
  | { type: "reload" }
  | { type: "openDoor" }
  | { type: "moveToContainer"; range: number }
  | { type: "pickUpItems" }
  | { type: "searchContainer" }
  | { type: "lookFloor"; itemType?: ItemType }
  | { type: "chase"; target: "survivor"; range?: number }
  | { type: "wander" }
  | {
      type: "move";
      direction: Direction;
    }
  | {
      type: "moveAway";
      target: "zombie";
    }
  | {
      type: "attack";
      target: "zombie" | "survivor";
    }
  | {
      type: "explore";
    }
  | {
      type: "wait";
    };
export type ComparisonOperator =
  | "<"
  | ">"
  | "<="
  | ">="
  | "=="
  | "!=";

export type Condition =
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "stat"; stat: "hunger" | "thirst" | "stamina" | "ammo"; operator: ComparisonOperator; value: number }
  | { type: "hasItem" | "equipped"; itemType: ItemType }
  | { type: "count"; target: Target; operator: ComparisonOperator; value: number }
  | { type: "visible"; target: Target }
  | { type: "distance"; target: Target; operator: ComparisonOperator; value: number }
  | { type: "remembered"; slot: MemorySlot }
  | { type: "and"; conditions: Condition[] }
  | { type: "nearbydoor" }
  | { type: "inventoryFull" }
  | { type: "inventorySpace" }
  | { type: "itemsOnFloor" }
  | { type: "containerNearby"; range?: number }
  | { type: "survivorNearby"; range?: number }
  | {
      type: "zombieNearby";
      range?: number;
    }
  | {
      type: "healthComparison";
      operator: ComparisonOperator;
      value: number;
    }
  | {
      type: "always";
    };

// ======================================================
// RULE
// ======================================================

export interface ScriptRule {
  condition: Condition;
  action: SurvivorAction;
}

export interface SurvivorProgram {
  rules: ScriptRule[];
  memoryCost?: number;
}
