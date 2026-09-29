import { World } from '../world.mjs';
import type { WorldRepository } from '../database/repositories/world.js';

// Serialize mutations/checkpoints with ticks. No tick can race an asynchronous database commit.
export class Runtime {
  private tail: Promise<unknown> = Promise.resolve();
  failed = false;
  constructor(readonly world: World, private repository: Pick<WorldRepository, 'save'>) {}
  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      if (this.failed) throw Object.assign(new Error('Simulation unavailable.'), { status: 503 });
      return operation();
    });
    this.tail = result.catch(() => {});
    return result;
  }
  async checkpoint() {
    try { await this.repository.save(this.world); }
    catch (error) { this.failed = true; console.error(JSON.stringify({ event: 'checkpoint_failed' })); throw Object.assign(new Error('Persistence failed; simulation halted.'), { status: 503 }); }
  }
  mutate<T>(operation: () => T): Promise<T> {
    return this.run(async () => { const result = operation(); await this.checkpoint(); return result; });
  }
}
