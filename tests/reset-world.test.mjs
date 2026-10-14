import test from 'node:test';
import assert from 'node:assert/strict';
import { resetWorld } from '../dist/server/src/database/repositories/resetWorld.js';

function database({ running = false, fail = false } = {}) {
  const calls = [];
  return {
    calls,
    pool: {
      connect: async () => ({
        query: async (sql) => {
          calls.push(sql);
          if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: !running }] };
          if (fail && sql === 'DELETE FROM survivors') throw new Error('write failed');
          return { rows: [] };
        },
        release: () => calls.push('release'),
      }),
    },
  };
}
test('world reset refuses to delete anything while a server owns the lock', async () => {
  const { calls, pool } = database({ running: true });
  await assert.rejects(resetWorld(pool), /Stop the game server/);
  assert.equal(
    calls.some((sql) => sql.startsWith('DELETE')),
    false,
  );
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});
test('world reset deletes only gameplay tables in dependency order and commits', async () => {
  const { calls, pool } = database();
  await resetWorld(pool);
  assert.deepEqual(calls, [
    'BEGIN',
    'SELECT pg_try_advisory_xact_lock(724982) AS acquired',
    'DELETE FROM survivor_scripts',
    'DELETE FROM survivors',
    'DELETE FROM worlds',
    'COMMIT',
    'release',
  ]);
});
test('world reset rolls back partial work and releases the connection on failure', async () => {
  const { calls, pool } = database({ fail: true });
  await assert.rejects(resetWorld(pool), /write failed/);
  assert.equal(calls.includes('COMMIT'), false);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});
