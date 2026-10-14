export interface Sample {
  time: number;
  x: number;
  y: number;
}
/** Follow the actual server polyline; never extrapolate into unconfirmed terrain. */
export function interpolateMotion(
  samples: readonly Sample[],
  time: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!samples.length) return fallback;
  if (time <= samples[0].time) return samples[0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    if (time > b.time) continue;
    const duration = b.time - a.time,
      fraction = duration > 0 ? Math.max(0, Math.min(1, (time - a.time) / duration)) : 1;
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  }
  return samples[samples.length - 1];
}

/** A buffered, monotonic clock shared by every actor in the view. Times are seconds,
 * except the browser timestamps and poll interval, which are milliseconds. */
export class MotionClock {
  private time = 0;
  private latest = 0;
  private frame: number | null = null;
  private rate = 1;

  receive(time: number, now: number, pollMs: number): void {
    const delay = Math.max(0.3, (pollMs / 1000) * 2 + 0.1);
    if (this.frame === null || time < this.latest) {
      // Initial connection or a restarted world has a different timeline.
      this.time = Math.max(0, time - delay);
      this.frame = now;
      this.rate = 1;
    } else {
      this.advance(now);
      // Correct drift gently, never snap the playhead to a packet's timestamp.
      const error = time - this.time - delay;
      this.rate = Math.abs(error) <= 0.1 ? 1 : Math.max(0.95, Math.min(1.05, 1 + error * 0.1));
    }
    this.latest = time;
  }

  advance(now: number): number {
    if (this.frame === null) return this.time;
    const elapsed = Math.max(0, (now - this.frame) / 1000);
    this.frame = Math.max(this.frame, now);
    this.time = Math.min(this.latest, this.time + elapsed * this.rate);
    return this.time;
  }
}
