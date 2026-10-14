import { readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
export const migrationDirectory = new URL(
  '../../../../server/src/database/migrations/',
  import.meta.url,
);
export async function migrationNames() {
  return (await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
}
export async function databaseReadiness(pool: Pool) {
  const role = (
    await pool.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
  has_schema_privilege(current_user,'public','CREATE') AS schema_create FROM pg_roles WHERE rolname=current_user`)
  ).rows[0];
  if (!role || Object.values(role).some(Boolean))
    throw new Error(
      'Use the restricted application database role, without administrative or schema-creation privileges.',
    );
  let applied: Set<string>;
  try {
    applied = new Set(
      (await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
    );
  } catch {
    throw new Error(
      'Database schema is not ready. Run npm run db:migrate with migration credentials.',
    );
  }
  const missing = (await migrationNames()).filter((name) => !applied.has(name));
  if (missing.length)
    throw new Error(
      `Pending database migrations: ${missing.join(', ')}. Run npm run db:migrate before starting.`,
    );
}
