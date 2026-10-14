export interface EventActor {
  id: string;
  kind: 'survivor' | 'zombie';
  x: number;
  y: number;
}
export interface VisualEvent {
  id: string;
  time: number;
  type: 'attack' | 'death';
  actor: EventActor;
  target?: EventActor;
  weapon?: 'melee' | 'gun';
  damage?: number;
}
export interface VisualEventStream {
  streamId: string;
  events: VisualEvent[];
}
/** Internal execution callback. References never cross the API boundary. */
export interface CombatResult {
  attacker: { id: string; x: number; y: number; symbol: string };
  target: { id: string; x: number; y: number; symbol: string };
  damage: number;
  weapon: 'melee' | 'gun';
  killed: boolean;
}
