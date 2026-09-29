import type { Condition, ComparisonOperator } from "../language/types.js";
import { SurvivorScriptError } from "../language/errors.js";
import { parseTarget } from "./targets.js";
import { ITEM_TYPES } from "../../data/itemCatalog.js";
import type { ItemType } from "../../entities/item.js";
export function parseCondition(
  text: string,
  lineNumber: number
): Condition {
  if (/[()]/.test(text)) throw new SurvivorScriptError("Parentheses are not supported; use separate priority rules.", lineNumber);
  if (/\bOR\b/.test(text)) {
    const parts = text.split(/\bOR\b/).map(part => part.trim());
    if (parts.some(part => !part)) throw new SurvivorScriptError("OR requires a condition on both sides.", lineNumber);
    return { type: "or", conditions: parts.map(part => parseCondition(part, lineNumber)) };
  }
  if (/\bAND\b/.test(text)) {
    const parts = text.split(/\bAND\b/).map(part => part.trim());
    if (parts.some(part => !part)) throw new SurvivorScriptError("AND requires a condition on both sides.", lineNumber);
    return { type: "and", conditions: parts.map(part => parseCondition(part, lineNumber)) };
  }
  if (text.startsWith("NOT ")) return { type: "not", condition: parseCondition(text.slice(4).trim(), lineNumber) };
  if (text === "nearbydoor" || text === "doorNearby") return { type: "nearbydoor" };
  const needs = { hungry: "hunger", thirsty: "thirst", tired: "stamina" } as const;
  if (text in needs) return { type: "stat", stat: needs[text as keyof typeof needs], operator: text === "tired" ? "<" : ">", value: text === "tired" ? 20 : 70 };
  const stat = text.match(/^(hunger|thirst|stamina|ammo)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (stat && Number.isSafeInteger(Number(stat[3]))) return { type: "stat", stat: stat[1] as "hunger", operator: stat[2] as ComparisonOperator, value: Number(stat[3]) };
  const item = text.match(/^(hasItem|equipped)\s+(\w+)$/);
  if (item && ITEM_TYPES.includes(item[2] as ItemType)) return { type: item[1] as "hasItem" | "equipped", itemType: item[2] as ItemType };
  const count = text.match(/^(zombie|survivor)Count\s+(\d+)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (count && Number.isSafeInteger(Number(count[4]))) return { type: "count", target: parseTarget(`${count[1]} ${count[2]}`, lineNumber), operator: count[3] as ComparisonOperator, value: Number(count[4]) };
  const nearby = text.match(/^(building|car)Nearby(?:\s+(\d+))?$/);
  if (nearby) return { type: "visible", target: parseTarget(`${nearby[1]} ${nearby[2] ?? 8}`, lineNumber) };
  const floorItem = text.match(/^itemNearby\s+(\w+)(?:\s+(\d+))?$/);
  if (floorItem && ITEM_TYPES.includes(floorItem[1] as ItemType)) return { type: "visible", target: parseTarget(`${floorItem[1]} ${floorItem[2] ?? 8}`, lineNumber) };
  const memory = text.match(/^remembered (home|target|lastZombie|lastContainer)$/);
  if (memory) return { type: "remembered", slot: memory[1] as "home" };
  const distance = text.match(/^distance\s+(.+?)\s*(<=|>=|==|!=|<|>)\s*(\d+)$/);
  if (distance && Number.isSafeInteger(Number(distance[3]))) return { type: "distance", target: parseTarget(distance[1], lineNumber), operator: distance[2] as ComparisonOperator, value: Number(distance[3]) };
  if (text === "inventorySpace") return { type: "inventorySpace" };
  if (text === "inventoryFull") return { type: "inventoryFull" };
  if (text === "itemsOnFloor") return { type: "itemsOnFloor" };
  const nearbyMatch = text.match(/^(zombieNearby|survivorNearby|containerNearby)(?:\s+(.*))?$/);
  if (nearbyMatch) {
    const value = nearbyMatch[2];
    const range = value === undefined ? undefined : Number(value);
    if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(range))) {
      throw new SurvivorScriptError("Nearby range must be a nonnegative whole number, for example zombieNearby 10.", lineNumber);
    }
    return { type: nearbyMatch[1] as "zombieNearby" | "survivorNearby" | "containerNearby", range };
  }

  const healthMatch = text.match(
    /^health\s*(<=|>=|==|!=|<|>)\s*(\d+)$/
  );

  if (healthMatch && Number.isSafeInteger(Number(healthMatch[2]))) {
    return {
      type: "healthComparison",

      operator:
        healthMatch[1] as ComparisonOperator,

      value: Number(healthMatch[2]),
    };
  }

  throw new SurvivorScriptError(
    `Unknown condition "${text}"`,
    lineNumber
  );
}
