import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { connect } from './connection.js';
import { configuration } from '../config/environment.js';

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(724981)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    // SQL stays in source control; resolve from the project root, including after compilation.
    const directory = new URL('../../../../server/src/database/migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      await client.query(await readFile(new URL(name, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configuration();
  if (!process.env.MIGRATION_USER || !process.env.MIGRATION_PASSWORD) throw new Error('Set MIGRATION_USER and MIGRATION_PASSWORD for schema changes.');
  const pool = connect({ ...config, DATABASE_USER: process.env.MIGRATION_USER, DATABASE_PASSWORD: process.env.MIGRATION_PASSWORD });
  try { await migrate(pool); console.log('Database migrations complete.'); } finally { await pool.end(); }
}
