import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Runtime } from '../simulation/runtime.js';
import { World, encode } from '../world.mjs';
import { WorldRepository } from '../database/repositories/world.js';

const password = z.string().min(12).max(128);
const credentials = z.object({ currentPassword: password });
const schemas = {
  username: credentials.extend({ username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).transform(value => value.toLowerCase()) }).strict(),
  email: credentials.extend({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()) }).strict(),
  password: credentials.extend({ password }).strict(),
  delete: credentials.extend({ confirmation: z.literal('DELETE') }).strict(),
};
const hashing = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function account(pool: Pool, runtime: Runtime) {
  const router = Router();
  let active = 0;
  router.use(rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: 'Too many account changes. Try again shortly.' }); } }));
  router.post('/:action', async (req, res) => {
    const action = z.enum(['username', 'email', 'password', 'delete']).parse(req.params.action);
    const body = schemas[action].parse(req.body);
    if (active >= 4) { res.status(429).json({ error: 'Account service busy. Try again shortly.' }); return; }
    active++;
    try {
      const id = res.locals.user.id;
      const user = (await pool.query('SELECT password_hash,auth_version FROM users WHERE id=$1', [id])).rows[0];
      if (!user || user.auth_version !== req.session.authVersion) { res.status(401).json({ error: 'Please log in again.' }); return; }
      if (!await argon2.verify(user.password_hash, body.currentPassword)) { res.status(403).json({ error: 'Current password is incorrect.' }); return; }
      const passwordHash = 'password' in body ? await argon2.hash(body.password, hashing) : undefined;
      await runtime.run(async () => {
        const apply = async (client: import('pg').PoolClient) => {
          const current = (await client.query('SELECT auth_version FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
          if (!current || current.auth_version !== user.auth_version) throw Object.assign(new Error('Account changed. Please log in again.'), { status: 401 });
          if (action === 'delete') {
            await client.query('DELETE FROM survivor_scripts WHERE survivor_id IN (SELECT id FROM survivors WHERE owner_id=$1)', [id]);
            await client.query('DELETE FROM survivors WHERE owner_id=$1', [id]);
            await client.query('DELETE FROM users WHERE id=$1', [id]);
          } else {
            // Column names are chosen only from these fixed server-owned strings.
            const column = action === 'password' ? 'password_hash' : action;
            const value = 'username' in body ? body.username : 'email' in body ? body.email : passwordHash;
            await client.query(`UPDATE users SET ${column}=$2,auth_version=auth_version+1 WHERE id=$1`, [id, value]);
          }
          await client.query("DELETE FROM sessions WHERE sess->>'userId'=$1", [id]);
        };
        if (action === 'delete') {
          // Stage a separate world: failed transactions leave the live world intact.
          const candidate = new World(encode(runtime.world.state));
          candidate.removeOwner(id);
          await new WorldRepository(pool).save(candidate, apply);
          runtime.world.state = candidate.state;
          runtime.world.programs = candidate.programs;
        } else {
          const client = await pool.connect();
          try { await client.query('BEGIN'); await apply(client); await client.query('COMMIT'); }
          catch (error) { await client.query('ROLLBACK'); throw error; }
          finally { client.release(); }
        }
      });
      await new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      res.clearCookie('deadware.sid', { path: '/' }).json({ success: true });
    } catch (error) {
      if ((error as {code?: string}).code === '23505') { res.status(409).json({ error: 'Those account details are unavailable.' }); return; }
      throw error;
    } finally { active--; }
  });
  return router;
}
