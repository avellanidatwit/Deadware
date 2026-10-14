import express from 'express';
import { apiSecurity, apiErrors } from './security.js';
import { sessionCookieName } from './credentials.js';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Configuration } from '../config/environment.js';
import type { Runtime } from '../simulation/runtime.js';
import { authentication } from './auth.js';
import { account } from './account.js';

const script = z.string().min(1).max(16384);
const programs = z.object({ script, zombieScript: script.optional() }).strict();
const creation = programs.extend({ name: z.string().trim().min(1).max(64) });
const gameplay = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    const e = error as Error & { status?: number };
    e.status ??= 400;
    throw e;
  }
};

export async function createApp(pool: Pool, runtime: Runtime, config: Configuration) {
  const app = express();
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 'loopback');
  app.use('/api', apiSecurity(config, runtime));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many requests.' });
      },
    }),
  );
  // Public readiness is deliberately minimal and never creates a session.
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use(express.json({ limit: '200kb' }));
  const Store = pgSession(session);
  const store = new Store({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    errorLog: () => console.error(JSON.stringify({ event: 'session_store_failed' })),
  });
  app.use(
    session({
      name: sessionCookieName,
      store,
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: config.COOKIE_SAME_SITE,
        maxAge: 12 * 60 * 60 * 1000,
      },
    }),
  );
  app.use('/api/auth', await authentication(pool));
  app.use('/api', async (req, res, next) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Please log in.' });
      return;
    }
    const user = (
      await pool.query('SELECT id,username,email,auth_version FROM users WHERE id=$1', [
        req.session.userId,
      ])
    ).rows[0];
    if (!user || user.auth_version !== req.session.authVersion) {
      res.status(401).json({ error: 'Please log in.' });
      return;
    }
    res.locals.user = user;
    next();
  });
  app.use('/api/account', account(pool, runtime));
  // Recheck authentication inside the simulation queue: a previously authorized
  // request may have been queued behind an account change or deletion.
  const mutate = (user: { id: string; auth_version: number }, operation: () => unknown) =>
    runtime.run(async () => {
      const valid = await pool.query('SELECT 1 FROM users WHERE id=$1 AND auth_version=$2', [
        user.id,
        user.auth_version,
      ]);
      if (!valid.rowCount) throw Object.assign(new Error('Please log in again.'), { status: 401 });
      const result = operation();
      await runtime.checkpoint();
      return result;
    });
  const world = runtime.world;
  app.get('/api/me', (_req, res) => {
    const { id, username, email } = res.locals.user;
    res.json({ id, username, email });
  });
  app.get('/api/me/entities', async (_req, res) => {
    res.json(await runtime.run(() => ({ entities: world.entities(res.locals.user.id) })));
  });
  app.get('/api/survivors', async (_req, res) => {
    res.json(
      await runtime.run(() =>
        world.entities(res.locals.user.id).filter((e: any) => e.kind === 'survivor'),
      ),
    );
  });
  app.get('/api/programming', async (_req, res) => {
    res.json(await runtime.run(() => world.programming(res.locals.user.id)));
  });
  app.get('/api/world', async (req, res) => {
    const entity = z.string().uuid().optional().parse(req.query.entity);
    const view = z.enum(['zombies']).optional().parse(req.query.view);
    if (entity && view) {
      res.status(400).json({ error: 'Choose an entity or the combined zombie view.' });
      return;
    }
    const names = new Map(
      (await pool.query('SELECT id,username FROM users')).rows.map((row) => [row.id, row.username]),
    );
    res.json(
      await runtime.run(() => ({
        ...gameplay(() =>
          world.snapshot(
            res.locals.user.id,
            entity,
            (id: string) => names.get(id) ?? 'Player',
            view === 'zombies',
          ),
        ),
        pollMs: config.CLIENT_POLL_MS,
      })),
    );
  });
  app.post('/api/survivors', async (req, res) => {
    const body = creation.parse(req.body);
    res
      .status(202)
      .json(
        await mutate(res.locals.user, () =>
          gameplay(() =>
            world.inject(res.locals.user.id, 'survivor', body.name, body.script, body.zombieScript),
          ),
        ),
      );
  });
  app.put('/api/:kind/:id/script', async (req, res) => {
    const kind = z.enum(['survivors', 'zombies']).parse(req.params.kind);
    const id = z.string().uuid().parse(req.params.id),
      body = programs.parse(req.body);
    res.json(
      await mutate(res.locals.user, () =>
        gameplay(() => {
          if (
            !world
              .entities(res.locals.user.id)
              .some(
                (e: any) =>
                  e.id === id && e.kind === (kind === 'survivors' ? 'survivor' : 'zombie'),
              )
          )
            throw Object.assign(new Error('Entity not found.'), { status: 404 });
          return world.deploy(id, res.locals.user.id, body.script, body.zombieScript);
        }),
      ),
    );
  });
  const behavior = z.object({ name: z.string().trim().min(1).max(64), code: script }).strict();
  app.post('/api/behavior-scripts/:kind', async (req, res) => {
    const kind = z.enum(['survivor', 'zombie']).parse(req.params.kind),
      body = behavior.parse(req.body);
    res
      .status(201)
      .json(
        await mutate(res.locals.user, () =>
          gameplay(() => world.saveBehavior(res.locals.user.id, kind, body.name, body.code)),
        ),
      );
  });
  app.put('/api/behavior-scripts/:kind/:id', async (req, res) => {
    const kind = z.enum(['survivor', 'zombie']).parse(req.params.kind),
      id = z.string().uuid().parse(req.params.id),
      body = behavior.parse(req.body);
    res.json(
      await mutate(res.locals.user, () =>
        gameplay(() => world.updateBehavior(res.locals.user.id, kind, id, body.name, body.code)),
      ),
    );
  });
  app.delete('/api/behavior-scripts/:kind/:id', async (req, res) => {
    const kind = z.enum(['survivor', 'zombie']).parse(req.params.kind),
      id = z.string().uuid().parse(req.params.id);
    z.object({}).strict().parse(req.body);
    res.json(
      await mutate(res.locals.user, () =>
        gameplay(() => world.deleteBehavior(res.locals.user.id, kind, id)),
      ),
    );
  });
  app.get('/api/scripts', async (_req, res) => {
    res.json(await runtime.run(() => ({ scripts: world.scripts(res.locals.user.id) })));
  });
  app.post('/api/scripts', async (req, res) => {
    const body = creation.parse(req.body);
    res
      .status(201)
      .json(
        await mutate(res.locals.user, () =>
          gameplay(() =>
            world.saveScript(res.locals.user.id, body.name, body.script, body.zombieScript),
          ),
        ),
      );
  });
  app.put('/api/scripts/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = creation.extend({ zombieScript: script }).parse(req.body);
    res.json(
      await mutate(res.locals.user, () =>
        gameplay(() =>
          world.updateScript(res.locals.user.id, id, body.name, body.script, body.zombieScript),
        ),
      ),
    );
  });
  app.delete('/api/scripts/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    z.object({}).strict().parse(req.body);
    res.json(
      await mutate(res.locals.user, () =>
        gameplay(() => world.deleteScript(res.locals.user.id, id)),
      ),
    );
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });
  app.use(apiErrors);
  return { app, closeSessions: () => store.close() };
}
