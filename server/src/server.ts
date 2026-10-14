import type { Server } from 'node:http';
import type { PoolClient } from 'pg';
import { connect } from './database/connection.js';
import { databaseReadiness } from './database/readiness.js';
import { WorldRepository } from './database/repositories/world.js';
import type { Configuration } from './config/environment.js';
import { Runtime } from './simulation/runtime.js';
import { World } from './world.mjs';
import { createApp } from './api/app.js';

/** One bootstrap/cleanup path shared by console and Windows service startup. */
export async function startServer(config: Configuration, onFatal: () => void = () => {}) {
  const pool = connect(config);
  let lock: PoolClient | undefined,
    server: Server | undefined,
    closeSessions = () => {};
  let runtime: Runtime | undefined,
    timer: ReturnType<typeof setInterval> | undefined,
    stopping: Promise<void> | undefined;
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_connection_failed' })));
  const stop = () =>
    (stopping ??= (async () => {
      if (timer) clearInterval(timer);
      try {
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        if (runtime && !runtime.failed) await runtime.run(() => runtime!.checkpoint());
      } finally {
        closeSessions();
        lock?.release();
        await pool.end();
        console.log(JSON.stringify({ event: 'server_stopped' }));
      }
    })());
  const fatal = () => {
    if (runtime) runtime.failed = true;
    onFatal();
    void stop().catch(() => console.error(JSON.stringify({ event: 'shutdown_failed' })));
  };
  try {
    await databaseReadiness(pool);
    lock = await pool.connect();
    if (!(await lock.query('SELECT pg_try_advisory_lock(724982) AS acquired')).rows[0].acquired)
      throw new Error('Another Deadware server owns this world.');
    const repository = new WorldRepository(pool),
      world = new World(await repository.load());
    world.state.timing ??= {
      tickMs: config.SIMULATION_TICK_MS,
      decisionTicks: config.DECISION_TICKS,
    };
    if (
      world.state.timing.tickMs !== config.SIMULATION_TICK_MS ||
      world.state.timing.decisionTicks !== config.DECISION_TICKS
    )
      throw new Error(
        'Existing world timing differs from configuration. Keep its original timing settings.',
      );
    runtime = new Runtime(world, repository);
    lock.on('error', () => {
      console.error(JSON.stringify({ event: 'world_lock_lost' }));
      fatal();
    });
    await runtime.checkpoint();
    const api = await createApp(pool, runtime, config);
    closeSessions = api.closeSessions;
    server = api.app.listen(config.PORT, '127.0.0.1');
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 100;
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', resolve);
      server!.once('error', reject);
    });
    console.log(
      JSON.stringify({
        event: 'server_started',
        port:
          server.address() && typeof server.address() === 'object'
            ? (server.address() as { port: number }).port
            : config.PORT,
      }),
    );
    let busy = false,
      lastSaved = Date.now();
    timer = setInterval(() => {
      if (busy || stopping) return;
      if (runtime!.failed) {
        fatal();
        return;
      }
      busy = true;
      void runtime!
        .run(async () => {
          world.advance();
          if (Date.now() - lastSaved >= config.CHECKPOINT_MS) {
            await runtime!.checkpoint();
            lastSaved = Date.now();
          }
        })
        .catch(() => {
          console.error(JSON.stringify({ event: 'simulation_halted' }));
          fatal();
        })
        .finally(() => {
          busy = false;
        });
    }, config.SIMULATION_TICK_MS);
    return { server, world, runtime, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
