import type { VisualEvent, VisualEventStream } from '../../../shared/src/types/visualEvents.js';
import type { ViewCell } from '../../../shared/src/types/world.js';
import { permittedPosition } from './scene.js';
export class CombatEffects {
  private streamId = '';
  private seen = new Map<string, number>();
  private pending: { event: VisualEvent; startedAt?: number; initialAge?: number }[] = [];
  reset() {
    this.streamId = '';
    this.seen.clear();
    this.pending = [];
  }
  receive(stream: VisualEventStream | undefined, serverTime: number) {
    if (!stream) return;
    if (stream.streamId !== this.streamId) {
      this.reset();
      this.streamId = stream.streamId;
    }
    for (const event of stream.events) {
      if (this.seen.has(event.id)) continue;
      this.seen.set(event.id, event.time);
      // No stale replay after reconnect; schedule new events against the buffered motion clock.
      if (event.time >= serverTime - 1) this.pending.push({ event });
    }
    for (const [id, time] of this.seen) if (time < serverTime - 31) this.seen.delete(id);
    this.pending = this.pending.filter((e) => e.event.time >= serverTime - 3).slice(-256);
  }
  active(
    time: number,
    cells: ReadonlyMap<string, ViewCell>,
    now = performance.now(),
  ): { event: VisualEvent; progress: number }[] {
    const result: { event: VisualEvent; progress: number }[] = [],
      remaining: typeof this.pending = [];
    for (const pending of this.pending) {
      const event = pending.event;
      if (time < event.time) {
        remaining.push(pending);
        continue;
      }
      if (pending.startedAt === undefined) {
        pending.startedAt = now;
        pending.initialAge = Math.max(0, time - event.time);
      }
      const age = Math.max(
        time - event.time,
        (pending.initialAge ?? 0) + Math.max(0, now - pending.startedAt) / 1000,
      );
      const progress = age / (event.type === 'death' ? 0.9 : 0.45);
      if (progress >= 1) continue;
      remaining.push(pending);
      if (
        permittedPosition(cells, event.actor) &&
        (!event.target || permittedPosition(cells, event.target))
      )
        result.push({ event, progress });
    }
    this.pending = remaining;
    return result;
  }
}
