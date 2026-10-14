import type { Pool } from 'pg';

/** Reset gameplay data atomically while excluding the running world writer. */
export async function resetWorld(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Same lock as main.ts. Transaction scope releases it on commit or rollback.
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(724982) AS acquired');
    if (!lock.rows[0]?.acquired)
      throw new Error('Stop the game server with Ctrl+C before resetting the world.');
    await client.query('DELETE FROM survivor_scripts');
    await client.query('DELETE FROM survivors');
    await client.query('DELETE FROM worlds');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
