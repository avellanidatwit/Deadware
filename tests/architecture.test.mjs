import test from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../dist/server/src/simulation/runtime.js';
import { World } from '../dist/server/src/world.mjs';
import { configuration } from '../dist/server/src/config/environment.js';

test('mutations commit in order and ticks cannot race a checkpoint', async () => {
  const world = new World(); const events = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const runtime = new Runtime(world, { async save() { events.push('saving'); await blocked; events.push('saved'); } });
  const mutation = runtime.mutate(() => { events.push('mutation'); return 'accepted'; });
  const tick = runtime.run(() => { events.push('tick'); world.advance(); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['mutation', 'saving']);
  release(); assert.equal(await mutation, 'accepted'); await tick;
  assert.deepEqual(events, ['mutation', 'saving', 'saved', 'tick']);
});

test('checkpoint failure rejects mutation and prevents later world operations', async () => {
  const runtime = new Runtime(new World(), { async save() { throw new Error('private database details'); } });
  await assert.rejects(runtime.mutate(() => 'accepted'), /Persistence failed/);
  assert.equal(runtime.failed, true);
  await assert.rejects(runtime.run(() => assert.fail('must not run')), /unavailable/);
});

test('timing config preserves default behavior and respects a different decision interval', () => {
  const world = new World(); world.state.timing = { tickMs: 200, decisionTicks: 3 };
  world.inject('owner', 'survivor', 'Scout', 'OTHERWISE\n WAIT');
  world.advance(); world.advance(); assert.equal(world.state.survivors.length, 0);
  world.advance(); assert.equal(world.state.survivors.length, 1);
  for (let i = 0; i < 5; i++) world.advance();
  assert.equal(world.snapshot('owner').observer.aliveSeconds, 1);
});

test('configuration rejects insecure cross-site cookies and invalid timing', () => {
  const env = { DATABASE_PASSWORD: 'test', SESSION_SECRET: 'x'.repeat(32) };
  assert.equal(configuration(env).CHECKPOINT_MS, 30000);
  assert.throws(() => configuration({ ...env, COOKIE_SAME_SITE: 'none' }), /HTTPS/);
  assert.throws(() => configuration({ ...env, SIMULATION_TICK_MS: '0' }));
  assert.throws(() => configuration({ ...env, CLIENT_ORIGIN: 'https://example.com/path' }), /exact origin/);
});
