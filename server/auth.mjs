import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const digest = token => createHash('sha256').update(token).digest('hex');
const normalize = email => typeof email === 'string' ? email.trim().toLowerCase() : '';

export async function createAuth(db, configuredUsers) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'display_name')) db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  let users = configuredUsers ? JSON.parse(configuredUsers) : [];
  if (!configuredUsers && !db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    const password = randomBytes(18).toString('base64url');
    users = [{ email: 'operator@deadware.local', password, owner: 'operator' }];
    console.log(`Initial login: operator@deadware.local\nInitial password (store securely): ${password}`);
  }
  if (!Array.isArray(users)) throw new Error('DEADWARE_USERS must be an array of {email, password, owner}.');
  for (const user of users) {
    const email = normalize(user.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof user.password !== 'string' || user.password.length < 12 || user.password.length > 128 || typeof user.owner !== 'string' || !user.owner.length) throw new Error('Each login needs an email, a 12-128 character password and an owner ID.');
    const old = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (user.displayName !== undefined && (typeof user.displayName !== 'string' || !user.displayName.trim() || user.displayName.length > 64)) throw new Error('Display names must contain 1-64 characters.');
    const salt = old?.salt ?? randomBytes(16).toString('hex');
    const passwordHash = (await derive(user.password, salt, 64)).toString('hex');
    if (old && (old.password_hash !== passwordHash || old.owner !== user.owner)) db.prepare('DELETE FROM sessions WHERE owner=?').run(old.owner);
    db.prepare('INSERT OR REPLACE INTO users (email, owner, salt, password_hash, display_name) VALUES (?, ?, ?, ?, ?)').run(email, user.owner, salt, passwordHash, user.displayName?.trim() ?? old?.display_name ?? user.owner);
  }
  const attempts = new Map();
  let active = 0;
  return {
    publicName(owner) { return db.prepare('SELECT display_name FROM users WHERE owner=?').get(owner)?.display_name || owner; },
    async login(body, address) {
      const now = Date.now();
      for (const [key, attempt] of attempts) if (attempt.until <= now) attempts.delete(key);
      const attempt = attempts.get(address) ?? { count: 0, until: now + 60000 };
      if (attempt.count >= 10 || active >= 4 || attempts.size >= 10000) throw Object.assign(new Error('Too many login attempts. Try again shortly.'), { status: 429 });
      attempt.count++; attempts.set(address, attempt);
      const email = normalize(body.email);
      if (typeof body.password !== 'string' || body.password.length > 128 || email.length > 254) throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
      active++;
      try {
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const candidate = await derive(body.password, user?.salt ?? 'missing-user-salt', 64);
        const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
        if (!timingSafeEqual(candidate, expected) || !user) throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
        // Bound sessions per account while allowing several devices.
        db.prepare('DELETE FROM sessions WHERE owner=? AND token NOT IN (SELECT token FROM sessions WHERE owner=? ORDER BY expires DESC LIMIT 4)').run(user.owner, user.owner);
        const token = randomBytes(32).toString('hex'), expires = now + 12 * 60 * 60 * 1000;
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), user.owner, expires);
        return { token, expires, email: user.email };
      } finally { active--; }
    },
    authenticate(token) { return db.prepare('SELECT owner FROM sessions WHERE token=? AND expires>?').get(digest(token), Date.now()); },
    logout(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token)); },
  };
}
