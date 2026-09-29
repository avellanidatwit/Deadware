import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';

declare module 'express-session' { interface SessionData { userId: string } }
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(12).max(128) }).strict();
const registerSchema = loginSchema.extend({ username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).transform(s => s.toLowerCase()) });
const hashing = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function authentication(pool: Pool) {
  const router = Router();
  const dummy = await argon2.hash(randomUUID(), hashing);
  let hashingRequests = 0;
  router.use(rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: 'Too many authentication attempts. Try again shortly.' }); } }));
  router.post(['/register', '/login'], async (req, res) => {
    if (hashingRequests >= 4) { res.status(429).json({ error: 'Authentication busy. Try again shortly.' }); return; }
    const registration = req.path === '/register';
    const body = (registration ? registerSchema : loginSchema).parse(req.body);
    hashingRequests++;
    try {
      let user;
      if (registration) {
        const hash = await argon2.hash(body.password, hashing);
        try {
          user = (await pool.query('INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,username,email',
            [randomUUID(), (body as z.infer<typeof registerSchema>).username, body.email, hash])).rows[0];
        } catch (error) {
          if ((error as { code?: string }).code !== '23505') throw error;
          res.status(409).json({ error: 'Unable to register with those details.' }); return;
        }
      } else {
        user = (await pool.query('SELECT id,username,email,password_hash FROM users WHERE email=$1', [body.email])).rows[0];
        const valid = await argon2.verify(user?.password_hash ?? dummy, body.password);
        if (!valid || !user) { res.status(401).json({ error: 'Invalid email or password.' }); return; }
      }
      await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.status(registration ? 201 : 200).json({ id: user.id, username: user.username, email: user.email });
    } finally { hashingRequests--; }
  });
  router.post('/logout', async (req, res) => {
    await new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('deadware.sid', { path: '/' }).json({ success: true });
  });
  return router;
}
