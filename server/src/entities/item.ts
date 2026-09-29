import { ITEM_CATALOG, type ItemDefinition, type ItemType } from "../data/itemCatalog.js";
export type { ItemType } from "../data/itemCatalog.js";
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  catalogKey: string;
}

let nextItemId = 1;
export function createItem(type: ItemType): Item {
  const definition = ITEM_CATALOG.find(item => item.type === type);
  if (!definition) throw new Error(`No item definition for ${type}.`);
  return instantiateItem(definition);
}

export function createItemByKey(key: string): Item {
  const definition = ITEM_CATALOG.find(item => item.key === key);
  if (!definition) throw new Error(`Unknown item: ${key}`);
  return instantiateItem(definition);
}

function instantiateItem(definition: ItemDefinition): Item {
  return { id: `item-${nextItemId++}`, catalogKey: definition.key, type: definition.type, name: definition.name };
}

/** Generate loot once when a container is created, never when it is searched. */
export function randomizeItems(count = Math.floor(Math.random() * 4), random = Math.random): Item[] {
  if (!Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error("Item count must be an integer from 0 to 100.");
  const available = ITEM_CATALOG.filter(item => Number.isFinite(item.weight) && item.weight > 0);
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  if (count > 0 && total === 0) throw new Error("Item catalog has no enabled loot.");
  return Array.from({ length: count }, () => {
    let roll = random() * total;
    for (const definition of available) {
      roll -= definition.weight;
      if (roll < 0) return instantiateItem(definition);
    }
    return instantiateItem(available[available.length - 1]);
  });
}
