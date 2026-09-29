import type { Condition, SurvivorAction } from "./types.js";
export type Capability = "interaction" | "logic" | "targeting" | "memory";
export const progressionStages: readonly (readonly Capability[])[] = [
  [], ["interaction"], ["interaction", "logic"], ["interaction", "logic", "targeting"], ["interaction", "logic", "targeting", "memory"],
];

/** Optional scenario restrictions; the sandbox exposes the complete language. */
export function requiredCapabilities(condition: Condition, action: SurvivorAction): Set<Capability> {
  const needed = new Set<Capability>();
  function visit(part: Condition): void {
    if (part.type === "and" || part.type === "or") { needed.add("logic"); part.conditions.forEach(visit); }
    else if (part.type === "not") { needed.add("logic"); visit(part.condition); }
    else if (["visible", "distance", "count"].includes(part.type)) needed.add("targeting");
    else if (part.type === "remembered") needed.add("memory");
    else if (["hasItem", "equipped", "inventoryFull", "inventorySpace", "itemsOnFloor", "containerNearby", "nearbydoor"].includes(part.type)) needed.add("interaction");
    if (part.type === "distance" && ["home", "target", "lastZombie", "lastContainer"].includes(part.target.type)) needed.add("memory");
  }
  visit(condition);
  if (["item", "reload", "openDoor", "searchContainer", "pickUpItems", "lookFloor"].includes(action.type)) needed.add("interaction");
  if (action.type === "moveToContainer" || action.type === "targeted") needed.add("targeting");
  if (action.type === "remember" || action.type === "targeted" && ["home", "target", "lastZombie", "lastContainer", "survivor"].includes(action.target.type)) needed.add("memory");
  if (action.type === "targeted" && ["OPEN", "SEARCH", "SHOOT"].includes(action.verb)) needed.add("interaction");
  return needed;
}
