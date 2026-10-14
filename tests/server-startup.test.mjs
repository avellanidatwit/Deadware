import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { migrate } from '../dist/server/src/database/migrate.js';
import { configuration } from '../dist/server/src/config/environment.js';
import { startServer } from '../dist/server/src/server.js';

test(
  'real server starts with restricted credentials, persists, rejects duplicate writers and shuts down',
  { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL),
      admin = new pg.Pool({ connectionString: url.href });
    const suffix = randomUUID().replaceAll('-', ''),
      name = 'dw_start_' + suffix,
      role = 'dw_app_' + suffix,
      password = randomUUID().replaceAll('-', '');
    assert.match(name, /^dw_start_[a-f0-9]+$/);
    assert.match(role, /^dw_app_[a-f0-9]+$/);
    assert.match(password, /^[a-f0-9]+$/);
    let running, setup;
    try {
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
      );
      await admin.query(`CREATE DATABASE ${name}`);
      url.pathname = '/' + name;
      setup = new pg.Pool({ connectionString: url.href });
      await migrate(setup);
      await setup.query(`GRANT CONNECT ON DATABASE ${name} TO ${role}`);
      await setup.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await setup.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
      );
      await setup.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
      const config = configuration({
        NODE_ENV: 'test',
        PORT: '0',
        DATABASE_HOST: url.hostname,
        DATABASE_PORT: url.port || '5432',
        DATABASE_NAME: name,
        DATABASE_USER: role,
        DATABASE_PASSWORD: password,
        SESSION_SECRET: 'startup-test-session-secret-with-enough-length',
      });
      running = await startServer(config);
      const address = `http://127.0.0.1:${running.server.address().port}`;
      const health = await fetch(address + '/api/health');
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ready' });
      assert.equal(health.headers.get('set-cookie'), null);
      assert.equal((await fetch(address + '/api/me')).status, 401);
      await assert.rejects(() => startServer(config), /Another Deadware server/);
      await running.stop();
      await running.stop();
      assert.ok((await setup.query('SELECT tick FROM worlds WHERE id=1')).rowCount);
    } finally {
      await running?.stop();
      await setup?.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
      await admin.end();
    }
  },
);
