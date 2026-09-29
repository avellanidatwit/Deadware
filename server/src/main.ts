import { configuration } from './config/environment.js';
import { connect } from './database/connection.js';
import { WorldRepository } from './database/repositories/world.js';
import { Runtime } from './simulation/runtime.js';
import { World } from './world.mjs';
import { createApp } from './api/app.js';

async function main() {
  const config = configuration(), pool = connect(config);
  pool.on('error', () => { console.error(JSON.stringify({ event: 'database_connection_failed' })); });
  const role = (await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw new Error('The runtime requires a restricted database role.');
  // One authoritative writer per world, including across accidental duplicate processes.
  const lock = await pool.connect();
  if (!(await lock.query('SELECT pg_try_advisory_lock(724982) AS acquired')).rows[0].acquired) {
    lock.release(); await pool.end(); throw new Error('Another Deadware server owns this world.');
  }
  const repository = new WorldRepository(pool);
  const world = new World(await repository.load());
  world.state.timing ??= { tickMs: config.SIMULATION_TICK_MS, decisionTicks: config.DECISION_TICKS };
  if (world.state.timing.tickMs !== config.SIMULATION_TICK_MS || world.state.timing.decisionTicks !== config.DECISION_TICKS) throw new Error('Existing world timing differs from configuration. Keep its original timing settings.');
  const runtime = new Runtime(world, repository);
  lock.on('error', () => { runtime.failed = true; console.error(JSON.stringify({ event: 'world_lock_lost' })); });
  await runtime.checkpoint();
  const { app, closeSessions } = await createApp(pool, runtime, config);
  const server = app.listen(config.PORT, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  console.log(JSON.stringify({ event: 'server_started', port: config.PORT }));
  let busy = false, lastSaved = Date.now();
  const timer = setInterval(() => {
    if (busy || runtime.failed) return;
    busy = true;
    void runtime.run(async () => {
      world.advance();
      if (Date.now() - lastSaved >= config.CHECKPOINT_MS) { await runtime.checkpoint(); lastSaved = Date.now(); }
    }).catch(() => { runtime.failed = true; console.error(JSON.stringify({ event: 'simulation_halted' })); }).finally(() => { busy = false; });
  }, config.SIMULATION_TICK_MS);
  let stopping = false;
  async function shutdown() {
    if (stopping) return; stopping = true; clearInterval(timer);
    await new Promise<void>(resolve => server.close(() => resolve()));
    try { if (!runtime.failed) await runtime.run(() => runtime.checkpoint()); }
    finally { closeSessions(); lock.release(); await pool.end(); }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void shutdown().catch(() => { process.exitCode = 1; }); });
}
void main().catch(() => {
  console.error(JSON.stringify({ event: 'startup_failed', message: 'Check environment configuration, database role, migrations, world timing and port availability.' }));
  process.exit(1);
});
