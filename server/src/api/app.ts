import express, { type ErrorRequestHandler } from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Configuration } from '../config/environment.js';
import type { Runtime } from '../simulation/runtime.js';
import { authentication } from './auth.js';

const script = z.string().min(1).max(16384);
const programs = z.object({ script, zombieScript: script.optional() }).strict();
const creation = programs.extend({ name: z.string().trim().min(1).max(64) });
const gameplay = <T>(operation: () => T): T => {
  try { return operation(); }
  catch (error) { const e = error as Error & { status?: number }; e.status ??= 400; throw e; }
};

export async function createApp(pool: Pool, runtime: Runtime, config: Configuration) {
  const app = express();
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 'loopback');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    // Exact Origin allowlist plus mandatory JSON/custom header prevents cross-site form and fetch CSRF.
    if ((origin && origin !== config.CLIENT_ORIGIN) ||
      (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (origin !== config.CLIENT_ORIGIN || req.headers['x-deadware-client'] !== 'web'))) {
      res.status(403).json({ error: 'Origin not allowed.' }); return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Deadware-Client');
      res.sendStatus(204); return;
    }
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) { res.status(415).json({ error: 'Use application/json.' }); return; }
    if (runtime.failed) { res.status(503).json({ error: 'Simulation unavailable.' }); return; }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: 'Too many requests.' }); } }));
  app.use(express.json({ limit: '200kb' }));
  const Store = pgSession(session);
  const store = new Store({ pool, tableName: 'sessions', createTableIfMissing: false,
    errorLog: () => console.error(JSON.stringify({ event: 'session_store_failed' })) });
  app.use(session({ name: 'deadware.sid', store, secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: config.COOKIE_SAME_SITE, maxAge: 12 * 60 * 60 * 1000 } }));
  app.use('/api/auth', await authentication(pool));
  app.use('/api', async (req, res, next) => {
    if (!req.session.userId) { res.status(401).json({ error: 'Please log in.' }); return; }
    const user = (await pool.query('SELECT id,username,email FROM users WHERE id=$1', [req.session.userId])).rows[0];
    if (!user) { res.status(401).json({ error: 'Please log in.' }); return; }
    res.locals.user = user; next();
  });
  const world = runtime.world;
  app.get('/api/me', (_req, res) => { res.json(res.locals.user); });
  app.get('/api/me/entities', async (_req, res) => { res.json(await runtime.run(() => ({ entities: world.entities(res.locals.user.id) }))); });
  app.get('/api/survivors', async (_req, res) => { res.json(await runtime.run(() => world.entities(res.locals.user.id).filter((e: any) => e.kind === 'survivor'))); });
  app.get('/api/programming', async (_req, res) => { res.json(await runtime.run(() => world.programming(res.locals.user.id))); });
  app.get('/api/world', async (req, res) => {
    const entity = z.string().uuid().optional().parse(req.query.entity);
    const names = new Map((await pool.query('SELECT id,username FROM users')).rows.map(row => [row.id, row.username]));
    res.json(await runtime.run(() => ({ ...gameplay(() => world.snapshot(res.locals.user.id, entity, (id: string) => names.get(id) ?? 'Player')), pollMs: config.CLIENT_POLL_MS })));
  });
  app.post('/api/survivors', async (req, res) => {
    const body = creation.parse(req.body);
    res.status(202).json(await runtime.mutate(() => gameplay(() => world.inject(res.locals.user.id, 'survivor', body.name, body.script, body.zombieScript))));
  });
  app.put('/api/:kind/:id/script', async (req, res) => {
    const kind = z.enum(['survivors', 'zombies']).parse(req.params.kind);
    const id = z.string().uuid().parse(req.params.id), body = programs.parse(req.body);
    res.json(await runtime.mutate(() => gameplay(() => {
      if (!world.entities(res.locals.user.id).some((e: any) => e.id === id && e.kind === (kind === 'survivors' ? 'survivor' : 'zombie'))) throw Object.assign(new Error('Entity not found.'), { status: 404 });
      return world.deploy(id, res.locals.user.id, body.script, body.zombieScript);
    })));
  });
  app.get('/api/scripts', async (_req, res) => { res.json(await runtime.run(() => ({ scripts: world.scripts(res.locals.user.id) }))); });
  app.post('/api/scripts', async (req, res) => {
    const body = creation.parse(req.body);
    res.status(201).json(await runtime.mutate(() => gameplay(() => world.saveScript(res.locals.user.id, body.name, body.script, body.zombieScript))));
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Endpoint not found.' }); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ success: false, errors: error.issues.map(e => ({ field: e.path.join('.'), message: e.message })) }); return; }
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', status }));
    res.status(status).json({ success: false, errors: [{ line: error.lineNumber ?? null, message: status >= 500 ? 'Server unavailable.' : error.type === 'entity.parse.failed' ? 'Invalid JSON.' : error.message }] });
  };
  app.use(errors);
  return { app, closeSessions: () => store.close() };
}
