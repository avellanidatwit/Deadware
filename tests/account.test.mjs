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

test('account settings: reauthentication, uniqueness, revocation, atomic deletion and recovery', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `account_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  let server, closeSessions;
  try {
    await migrate(pool);
    const repository = new WorldRepository(pool), world = new World(), runtime = new Runtime(world, repository);
    const config = configuration({ DATABASE_PASSWORD: 'unused', SESSION_SECRET: 's'.repeat(32), NODE_ENV: 'test' });
    const app = await createApp(pool, runtime, config); closeSessions = app.closeSessions;
    server = app.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api`;
    const request = (path, body, cookie = '', origin = config.CLIENT_ORIGIN) => fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'X-Deadware-Client': 'web', 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const password = 'original-test-password', nextPassword = 'replacement-test-password';
    const register = async (username) => {
      const response = await request('/auth/register', {username,email:`${username}@example.com`,password});
      assert.equal(response.status,201); return {user:await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};
    };
    const login = async (email, password) => {
      const response = await request('/auth/login',{email,password}); assert.equal(response.status,200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const alice = await register('alice'), bob = await register('bob');
    let cookie = alice.cookie;
    assert.equal((await request('/account/username',{username:'someone',currentPassword:password})).status,401);
    assert.equal((await request('/account/username',{username:'someone',currentPassword:password},cookie,'https://evil.example')).status,403);
    assert.equal((await request('/account/username',{username:'someone',currentPassword:'incorrect-password'},cookie)).status,403);
    assert.equal((await request('/account/email',{email:'bob@example.com',currentPassword:password},cookie)).status,409);
    assert.equal((await request('/account/username',{username:'changed',currentPassword:password,userId:bob.user.id},cookie)).status,400);
    const staleSession = (await pool.query("SELECT * FROM sessions WHERE sess->>'userId'=$1",[alice.user.id])).rows[0];
    assert.equal((await request('/account/username',{username:'Alice_New',currentPassword:password},cookie)).status,200);
    assert.equal((await request('/me',undefined,cookie)).status,401);
    // Even an in-flight request that rewrites a revoked session cannot revive it.
    await pool.query('INSERT INTO sessions(sid,sess,expire) VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET sess=$2,expire=$3',[staleSession.sid,staleSession.sess,staleSession.expire]);
    assert.equal((await request('/me',undefined,cookie)).status,401);
    cookie = await login('alice@example.com',password);
    assert.equal((await (await request('/me',undefined,cookie)).json()).username,'alice_new');
    assert.equal((await request('/account/email',{email:'NEW@example.com',currentPassword:password},cookie)).status,200);
    cookie = await login('new@example.com',password);
    assert.equal((await request('/account/password',{password:'short',currentPassword:password},cookie)).status,400);
    assert.equal((await request('/account/password',{password:nextPassword,currentPassword:password},cookie)).status,200);
    assert.equal((await request('/auth/login',{email:'new@example.com',password})).status,401);
    cookie = await login('new@example.com',nextPassword);
    const script = 'OTHERWISE\n WAIT';
    await runtime.mutate(() => {
      world.inject(alice.user.id,'survivor','Alice',script,script);
      for(let i=0;i<6;i++) world.advance();
      world.state.survivors[0].health=0; world.raiseDead();
      world.inject(alice.user.id,'survivor','Queued',script,script);
      world.inject(bob.user.id,'survivor','Bob',script,script);
      world.saveScript(alice.user.id,'Saved',script,script);
    });
    assert.equal((await request('/account/delete',{currentPassword:nextPassword,confirmation:'wrong'},cookie)).status,400);
    // Force a late SQL failure to prove the checkpoint and live world stay unchanged.
    await pool.query("CREATE FUNCTION block_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
    await pool.query('CREATE TRIGGER block_deletion BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION block_deletion()');
    const before = encode(world.state), checkpoint = await repository.load();
    assert.equal((await request('/account/delete',{currentPassword:nextPassword,confirmation:'DELETE'},cookie)).status,500);
    assert.equal(encode(world.state),before); assert.equal(await repository.load(),checkpoint);
    assert.equal((await request('/me',undefined,cookie)).status,200);
    await pool.query('DROP TRIGGER block_deletion ON users');
    assert.equal((await request('/account/delete',{currentPassword:nextPassword,confirmation:'DELETE'},cookie)).status,200);
    assert.equal((await request('/me',undefined,cookie)).status,401);
    assert.equal((await request('/me',undefined,bob.cookie)).status,200);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE id=$1',[alice.user.id])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM survivors WHERE owner_id=$1',[alice.user.id])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM survivor_scripts')).rowCount,1); // Bob's queued program survives.
    assert.equal(world.entities(alice.user.id).length,0); assert.equal(world.scripts(alice.user.id).length,0);
    assert.equal(world.state.queue.some(entry=>entry.owner===alice.user.id),false);
    assert.equal(world.state.queue.some(entry=>entry.owner===bob.user.id),true);
    const restored = new World(await repository.load()); assert.equal(encode(restored.state),encode(world.state));
    assert.equal(encode(restored.state).includes(alice.user.id),false);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    closeSessions?.(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
