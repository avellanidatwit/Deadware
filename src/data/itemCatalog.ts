/** Edit this list to add loot or adjust names, categories, and relative spawn weights. */
export type ItemType = "food" | "weapon";
export interface ItemDefinition {
  key: string;
  type: ItemType;
  name: string;
  weight: number;
}
export const ITEM_CATALOG: readonly ItemDefinition[] = [
  { key: "canned-food", type: "food", name: "Canned food", weight: 1 },
  { key: "crowbar", type: "weapon", name: "Crowbar", weight: 1 },
];
