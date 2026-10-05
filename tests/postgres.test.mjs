import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate } from '../dist/server/src/database/migrate.js';
import { WorldRepository } from '../dist/server/src/database/repositories/world.js';
import { World, encode } from '../dist/server/src/world.mjs';
import { Runtime } from '../dist/server/src/simulation/runtime.js';
import { createApp } from '../dist/server/src/api/app.js';
import { configuration } from '../dist/server/src/config/environment.js';

// Explicitly opt in with a disposable PostgreSQL database; CI always runs this test.
test('PostgreSQL: migrations, cookie auth, ownership, script history and exact recovery', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  let server, closeSessions, secureServer, closeSecureSessions;
  try {
    await migrate(pool); await migrate(pool);
    assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count, '2');
    const config = configuration({ DATABASE_PASSWORD: 'unused', SESSION_SECRET: 's'.repeat(32), NODE_ENV: 'test' });
    const repo = new WorldRepository(pool), world = new World(await repo.load()), runtime = new Runtime(world, repo);
    const app = await createApp(pool, runtime, config); closeSessions = app.closeSessions;
    server = app.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = (path, method = 'GET', body, cookie = '', origin = config.CLIENT_ORIGIN, customHeader = true) => fetch(url + '/api' + path, {
      method, headers: { Origin: origin, ...(customHeader ? { 'X-Deadware-Client': 'web' } : {}), 'Content-Type': 'application/json', Cookie: cookie },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
    });
    assert.equal((await request('/survivors')).status, 401);
    assert.equal((await request('/auth/register', 'POST', {}, '', 'https://evil.example')).status, 403);
    assert.equal((await request('/auth/register', 'POST', {}, '', config.CLIENT_ORIGIN, false)).status, 403);
    const first = await request('/auth/register', 'POST', { username: 'alice', email: 'alice@example.com', password: 'long-test-password' });
    assert.equal(first.status, 201); const alice = await first.json();
    const cookie = first.headers.get('set-cookie').split(';')[0];
    assert.match(first.headers.get('set-cookie'), /HttpOnly/); assert.match(first.headers.get('set-cookie'), /SameSite=Lax/);
    const hash = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [alice.id])).rows[0].password_hash;
    assert.match(hash, /^\$argon2id\$/);
    assert.equal((await request('/auth/register', 'POST', { username: 'alice', email: 'other@example.com', password: 'long-test-password' })).status, 409);
    assert.equal((await request('/auth/login', 'POST', { email: 'alice@example.com', password: 'wrong-test-password' })).status, 401);
    const login = await request('/auth/login', 'POST', { email: 'alice@example.com', password: 'long-test-password' });
    assert.equal(login.status, 200);
    const second = await request('/auth/register', 'POST', { username: 'bob', email: 'bob@example.com', password: 'long-test-password' });
    assert.equal(second.status, 201); const bobCookie = second.headers.get('set-cookie').split(';')[0];
    const creation = { name: 'Scout', script: 'OTHERWISE\n WAIT', zombieScript: 'OTHERWISE\n WAIT' };
    assert.equal((await request('/survivors', 'POST', { ...creation, ownerId: alice.id }, cookie)).status, 400);
    assert.equal((await request('/survivors', 'POST', { ...creation, x: 3 }, cookie)).status, 400);
    const inject = await request('/survivors', 'POST', creation, cookie); assert.equal(inject.status, 202);
    const { id } = await inject.json();
    assert.equal((await pool.query('SELECT status FROM survivors WHERE id=$1', [id])).rows[0].status, 'queued');
    await runtime.run(() => { for (let i = 0; i < 6; i++) world.advance(); });
    assert.equal((await request(`/survivors/${id}/script`, 'PUT', { script: 'OTHERWISE\n EXPLORE' }, bobCookie)).status, 404);
    assert.equal((await request('/world?entity=' + id, 'GET', undefined, bobCookie)).status, 404);
    assert.deepEqual(await (await request('/survivors', 'GET', undefined, bobCookie)).json(), []);
    assert.equal((await request(`/survivors/${id}/script`, 'PUT', { script: 'eval(bad)' }, cookie)).status, 400);
    assert.equal((await request(`/survivors/${id}/script`, 'PUT', { script: 'OTHERWISE\n EXPLORE' }, cookie)).status, 200);
    const versions = (await pool.query('SELECT version,active FROM survivor_scripts WHERE survivor_id=$1 ORDER BY version', [id])).rows;
    assert.deepEqual(versions, [{ version: 1, active: false }, { version: 2, active: true }]);
    const saved = await request('/scripts', 'POST', { ...creation, name: 'Library' }, cookie);
    assert.equal(saved.status, 201); const pair = await saved.json();
    assert.equal((await request(`/scripts/${pair.id}`, 'DELETE', {}, bobCookie)).status, 404);
    assert.equal((await request(`/scripts/${pair.id}`, 'PUT', creation, bobCookie)).status, 404);
    assert.equal((await request(`/scripts/${pair.id}`, 'PUT', { ...creation, zombieScript: 'INVALID' }, cookie)).status, 400);
    assert.equal((await request(`/scripts/${pair.id}`, 'PUT', { ...creation, name: 'Updated' }, cookie)).status, 200);
    assert.equal(new World(await repo.load()).scripts(alice.id)[0].name, 'Updated');
    assert.equal((await request(`/scripts/${pair.id}`, 'DELETE', {}, cookie, 'https://evil.example')).status, 403);
    assert.equal((await request(`/scripts/${pair.id}`, 'DELETE', {}, cookie)).status, 200);
    assert.deepEqual(new World(await repo.load()).scripts(alice.id), []);
    assert.equal(world.entities(alice.id).length, 1);
    const restored = new World(await repo.load()); assert.equal(encode(restored.state), encode(world.state));
    assert.equal((await request('/auth/logout', 'POST', {}, cookie)).status, 200);
    assert.equal((await request('/me', 'GET', undefined, cookie)).status, 401);
    // Expired sessions cannot authenticate after a server round trip.
    await pool.query("UPDATE sessions SET expire=now()-interval '1 second'");
    assert.equal((await request('/me', 'GET', undefined, bobCookie)).status, 401);
    const secure = await createApp(pool, runtime, { ...config, NODE_ENV: 'production', CLIENT_ORIGIN: 'https://client.example', COOKIE_SAME_SITE: 'none' });
    closeSecureSessions = secure.closeSessions;
    secureServer = secure.app.listen(0, '127.0.0.1');
    await new Promise(resolve => secureServer.once('listening', resolve));
    const secureLogin = await fetch(`http://127.0.0.1:${secureServer.address().port}/api/auth/login`, {
      method: 'POST', headers: { Origin: 'https://client.example', 'X-Deadware-Client': 'web', 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'long-test-password' }),
    });
    assert.equal(secureLogin.status, 200);
    assert.match(secureLogin.headers.get('set-cookie'), /Secure/);
    assert.match(secureLogin.headers.get('set-cookie'), /HttpOnly/);
    assert.match(secureLogin.headers.get('set-cookie'), /SameSite=None/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (secureServer) await new Promise(resolve => secureServer.close(resolve));
    closeSessions?.(); closeSecureSessions?.(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
