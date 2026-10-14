import { randomUUID } from 'node:crypto';
import type {
  VisualEvent,
  VisualEventStream,
  EventActor,
} from '../../../shared/src/types/visualEvents.js';
/** Transient presentation history, never a second simulation or persisted gameplay state. */
export class VisualEventBuffer {
  readonly streamId = randomUUID();
  private entries: { event: VisualEvent; witnesses: Set<string> }[] = [];
  publish(event: Omit<VisualEvent, 'id'>, witnesses: Iterable<string>): void {
    this.entries.push({ event: { ...event, id: randomUUID() }, witnesses: new Set(witnesses) });
    this.entries = this.entries.filter((e) => e.event.time >= event.time - 30).slice(-2048);
  }
  snapshot(
    observerIds: readonly string[],
    visible: (p: EventActor) => boolean,
    now: number,
  ): VisualEventStream {
    return {
      streamId: this.streamId,
      events: this.entries
        .filter(
          ({ event, witnesses }) =>
            event.time >= now - 30 &&
            observerIds.some((id) => witnesses.has(id)) &&
            visible(event.actor) &&
            (!event.target || visible(event.target)),
        )
        .map(({ event }) => ({
          ...event,
          actor: { ...event.actor },
          ...(event.target ? { target: { ...event.target } } : {}),
        })),
    };
  }
}
