/** Edit this list to add loot or adjust names, categories, and relative spawn weights. */
export const ITEM_TYPES = ["food", "weapon", "bandage", "water", "gun", "ammo", "armor"] as const;
export type ItemType = typeof ITEM_TYPES[number];
export interface ItemDefinition {
  key: string;
  type: ItemType;
  name: string;
  weight: number;
  damageBonus?: number;
  armor?: number;
  magazineCapacity?: number;
}
export const ITEM_CATALOG: readonly ItemDefinition[] = [
  { key: "canned-food", type: "food", name: "Canned food", weight: 1 },
  { key: "crowbar", type: "weapon", name: "Crowbar", weight: 1, damageBonus: 15 },
  { key: "bandage", type: "bandage", name: "Bandage", weight: 0.7 },
  { key: "water", type: "water", name: "Water bottle", weight: 1 },
  { key: "pistol", type: "gun", name: "Pistol", weight: 0.2, damageBonus: 15, magazineCapacity: 6 },
  { key: "ammo", type: "ammo", name: "Ammo pouch", weight: 0.4 },
  { key: "armor-vest", type: "armor", name: "Armor vest", weight: 0.2, armor: 5 },
];
