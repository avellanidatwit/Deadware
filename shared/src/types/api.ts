import type { WorldSnapshot } from './world.js';
export interface User {
  id: string;
  username: string;
  email: string;
}
export interface OwnedEntity {
  id: string;
  kind: 'survivor' | 'zombie';
  name: string;
  health: number;
  program: string;
  zombieScript?: string;
  version: number;
}
export interface ScriptPair {
  id: string;
  name: string;
  script: string;
  zombieScript: string;
}
export type ScriptKind = 'survivor' | 'zombie';
export interface SavedBehavior {
  id: string;
  name: string;
  kind: ScriptKind;
  code: string;
}
export interface ProgrammingState {
  entities: OwnedEntity[];
  queue: { id: string; name: string }[];
  scripts: ScriptPair[];
  behaviorScripts: SavedBehavior[];
  defaults: { script: string; zombieScript: string };
}
export type WorldResponse = WorldSnapshot & { pollMs: number };
