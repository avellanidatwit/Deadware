export const selectors = ["nearest", "farthest", "weakest", "strongest"] as const;
export type Selector = typeof selectors[number];
export const targetTypes = ["zombie", "survivor", "container", "food", "weapon", "bandage", "water", "gun", "ammo", "door", "building", "car", "home", "target", "lastZombie", "lastContainer"] as const;
export type TargetType = typeof targetTypes[number];
export interface Target { type: TargetType; selector: Selector; range?: number }
export type MemorySlot = "home" | "target" | "lastZombie" | "lastContainer";
