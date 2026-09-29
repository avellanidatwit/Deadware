import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { World, encode } from './dist/server/src/world.mjs';
import { createAuth } from './server/auth.mjs';

export async function startServer({ port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? '127.0.0.1', database = process.env.DEADWARE_DB ?? './data/world.sqlite', tokens = process.env.DEADWARE_TOKENS, users = process.env.DEADWARE_USERS, origins = process.env.DEADWARE_ORIGINS ?? '', tickMs = 100 } = {}) {
  if (database !== ':memory:') await mkdir(new URL('./', pathToFileURL(database)), { recursive: true });
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS accounts (token TEXT PRIMARY KEY, owner TEXT NOT NULL)');
  const hash = token => createHash('sha256').update(token).digest('hex');
  const addAccount = db.prepare('INSERT OR REPLACE INTO accounts VALUES (?, ?)');
  if (tokens) {
    const accounts = JSON.parse(tokens);
    if (!Object.keys(accounts).length || Object.entries(accounts).some(([token, owner]) => token.length < 32 || typeof owner !== 'string' || !owner.length)) throw new Error('DEADWARE_TOKENS must map tokens (32+ characters) to owner IDs.');
    db.exec('DELETE FROM accounts');
    for (const [token, owner] of Object.entries(accounts)) addAccount.run(hash(token), owner);
  }
  const world = new World(db.prepare('SELECT state FROM world WHERE id=1').get()?.state);
  const auth = await createAuth(db, users);
  const save = () => db.prepare('INSERT OR REPLACE INTO world VALUES (1, ?)').run(encode(world.state));
  save();
  const allowed = new Set(origins.split(',').map(x => x.trim()).filter(Boolean));
  let failed = false;
  const server = createServer(async (req, res) => {
    const send = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
        if (origin && !sameOrigin && !allowed.has(origin)) return send(403, { error: 'Origin not allowed.' });
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
          res.writeHead(204).end(); return;
        }
        if (failed) return send(503, { error: 'Persistence failed; simulation halted.' });
        const readBody = async () => {
          if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Use application/json.'), { status: 415 });
          let size = 0; const chunks = [];
          for await (const chunk of req) { size += chunk.length; if (size > 204800) throw Object.assign(new Error('Request too large.'), { status: 413 }); chunks.push(chunk); }
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new Error('Invalid JSON.'); }
          if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Expected an object.');
          return body;
        };
        if (pathname === '/api/login' && req.method === 'POST') return send(200, await auth.login(await readBody(), req.socket.remoteAddress));
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const account = token && (auth.authenticate(token) ?? db.prepare('SELECT owner FROM accounts WHERE token=?').get(hash(token)));
        if (!account) return send(401, { error: 'Please log in again.' });
        if (pathname === '/api/logout' && req.method === 'POST') { auth.logout(token); return send(200, { success: true }); }
        const owner = account.owner;
        const commit = (status, result) => {
          try { save(); } catch (error) { failed = true; console.error(error); return send(503, { error: 'Persistence failed; simulation halted.' }); }
          return send(status, result);
        };
        if (req.method === 'GET') {
          if (pathname === '/api/programming') return send(200, world.programming(owner));
          if (pathname === '/api/scripts') return send(200, { scripts: world.scripts(owner) });
          if (pathname === '/api/world' || pathname === '/api/world/region') return send(200, world.snapshot(owner, url.searchParams.get('entity'), auth.publicName));
          if (pathname === '/api/me') return send(200, { id: owner });
          if (pathname === '/api/me/entities') return send(200, { entities: world.entities(owner) });
          const match = pathname.match(/^\/api\/(survivors|zombies)(?:\/([^/]+))?$/);
          if (match) {
            const entities = world.entities(owner).filter(e => e.kind === (match[1] === 'survivors' ? 'survivor' : 'zombie'));
            const entity = match[2] ? entities.find(e => e.id === match[2]) : entities;
            return send(entity ? 200 : 404, entity ?? { error: 'Entity not found.' });
          }
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const body = await readBody();
          if (pathname === '/api/scripts' && req.method === 'POST') {
            if (Object.keys(body).some(k => !['name', 'script', 'zombieScript'].includes(k))) return send(400, { error: 'Unsupported script field.' });
            return commit(201, world.saveScript(owner, body.name, body.script, body.zombieScript));
          }
          const match = pathname.match(/^\/api\/(survivors|zombies)(?:\/([^/]+)\/script)?$/);
          if (match) {
            const kind = match[1] === 'survivors' ? 'survivor' : 'zombie';
            const permitted = match[2] ? (kind === 'survivor' ? ['script', 'zombieScript'] : ['script']) : ['name', 'script', 'zombieScript'];
            if (Object.keys(body).some(k => !permitted.includes(k))) return send(400, { error: 'Unsupported field. Only names and scripts may be submitted.' });
            let result;
            if (req.method === 'PUT' && match[2]) {
              if (!world.entities(owner).some(e => e.id === match[2] && e.kind === kind)) return send(404, { error: 'Entity not found.' });
              result = world.deploy(match[2], owner, body.script, body.zombieScript);
            } else if (req.method === 'POST' && !match[2]) result = world.inject(owner, kind, body.name, body.script, body.zombieScript);
            else return send(405, { error: 'Method not allowed.' });
            return commit(req.method === 'POST' ? 202 : 200, result);
          }
        }
        return send(404, { error: 'Endpoint not found.' });
      }
      const pages = { '/': 'public/index.html', '/wiki': 'public/wiki.html', '/wiki.html': 'public/wiki.html', '/tutorial': 'public/tutorial.html', '/tutorial.html': 'public/tutorial.html', '/account': 'public/account.html', '/account.html': 'public/account.html', '/site.css': 'public/site.css', '/game.css': 'public/game.css', '/dist/main.js': 'dist/client/src/legacy.js', '/dist/ui/programming.js': 'dist/client/src/ui/programming.js', '/dist/ui/entityDetails.js': 'dist/client/src/ui/entityDetails.js', '/dist/ui/worldRenderer.js': 'dist/client/src/ui/worldRenderer.js' };
      const file = Object.hasOwn(pages, pathname) && pages[pathname];
      if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end('Not found'); return; }
      const content = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' }).end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { if (!res.headersSent) send(error.status ?? 400, { success: false, errors: [{ line: error.lineNumber ?? null, message: error.message }] }); }
  });
  server.requestTimeout = 10000;
  const timer = setInterval(() => {
    if (failed) return;
    try { world.advance(); if (world.state.tick % 6 === 0) save(); }
    catch (error) { failed = true; console.error('Simulation halted:', error); }
  }, tickMs);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, world, close: async () => { clearInterval(timer); await new Promise(resolve => server.close(resolve)); if (!failed) save(); db.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startServer();
  console.log(`Deadware is running at http://${process.env.HOST ?? '127.0.0.1'}:${app.server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
