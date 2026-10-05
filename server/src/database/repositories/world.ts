import type { Pool, PoolClient } from 'pg';
import { World, encode } from '../../world.mjs';

export class WorldRepository {
  constructor(private pool: Pool) {}
  async load() { return (await this.pool.query('SELECT state FROM worlds WHERE id=1')).rows[0]?.state as string | undefined; }
  async save(world: World, beforeCommit?: (client: PoolClient) => Promise<void>) {
    // Capture everything before the first await so SQL rows and checkpoint describe the same tick.
    const state = encode(world.state), tick = world.state.tick;
    const rows = world.state.survivors.map((entity: any) => {
      const meta = world.state.meta[entity.id];
      return { id: entity.id, owner: meta.owner, name: meta.name, x: entity.x, y: entity.y, health: entity.health,
        status: entity.health > 0 ? 'alive' : 'dead', script: entity.program, zombieScript: meta.zombieScript, version: meta.version };
    });
    for (const request of world.state.queue) rows.push({ ...request, x: null, y: null, health: 100, status: 'queued', version: 1 });
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO worlds(id,tick,state) VALUES(1,$1,$2)
        ON CONFLICT(id) DO UPDATE SET tick=$1,state=$2,last_saved_at=now()`, [tick, state]);
      for (const row of rows) {
        await client.query(`INSERT INTO survivors(id,owner_id,name,x,y,health,status,died_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='dead' THEN now() END)
          ON CONFLICT(id) DO UPDATE SET x=$4,y=$5,health=$6,status=$7,
          died_at=CASE WHEN $7='dead' THEN COALESCE(survivors.died_at,now()) ELSE NULL END`,
        [row.id,row.owner,row.name,row.x,row.y,row.health,row.status]);
        await client.query('UPDATE survivor_scripts SET active=false WHERE survivor_id=$1 AND version<>$2 AND active', [row.id,row.version]);
        await client.query(`INSERT INTO survivor_scripts(survivor_id,source_code,zombie_source_code,version)
          VALUES($1,$2,$3,$4) ON CONFLICT(survivor_id,version) DO NOTHING`, [row.id,row.script,row.zombieScript,row.version]);
      }
      await beforeCommit?.(client);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
