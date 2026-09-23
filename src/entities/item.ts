export type ItemType = "food" | "weapon";
export interface Item {
  id: string;
  type: ItemType;
  name: string;
}

let nextItemId = 1;
export function createItem(type: ItemType): Item {
  return { id: `item-${nextItemId++}`, type, name: type === "food" ? "Canned food" : "Crowbar" };
}

/** Generate loot once when a container is created, never when it is searched. */
export function randomizeItems(count = Math.floor(Math.random() * 4), random = Math.random): Item[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error("Item count must be an integer from 0 to 100.");
  return Array.from({ length: count }, () => createItem(random() < 0.5 ? "food" : "weapon"));
}
