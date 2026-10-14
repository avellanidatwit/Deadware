import { configuration } from './config/environment.js';
import { connect } from './database/connection.js';
import { databaseReadiness } from './database/readiness.js';
import { z } from 'zod';
async function main() {
  const production = process.argv.includes('--production');
  let failed = false;
  const fail = (message: string) => {
    failed = true;
    console.error(`FAIL ${message}`);
  };
  let config;
  try {
    config = configuration();
  } catch (error) {
    fail(
      error instanceof z.ZodError
        ? `Missing/invalid environment fields: ${error.issues.map((i) => i.path.join('.')).join(', ')}`
        : (error as Error).message,
    );
    process.exitCode = 1;
    return;
  }
  if (production) {
    if (config.NODE_ENV !== 'production')
      fail('Set NODE_ENV=production in the server deployment .env.');
    const api = process.env.PUBLIC_API_ORIGIN ?? '';
    try {
      const url = new URL(api);
      if (
        url.protocol !== 'https:' ||
        url.origin !== api ||
        url.username ||
        url.password ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        /(^|\.)example\.(com|net|org)$|\.(invalid|test|localhost)$/.test(url.hostname)
      )
        throw new Error();
      console.log(`API ${api}`);
    } catch {
      fail('Set PUBLIC_API_ORIGIN to the public HTTPS API origin before launch.');
    }
    if (!config.CLIENT_ORIGIN.startsWith('https://'))
      fail(
        'CLIENT_ORIGIN must be the HTTPS Pages/custom-domain origin, without a repository path.',
      );
    if (
      new URL(config.CLIENT_ORIGIN).hostname.endsWith('.github.io') &&
      config.COOKIE_SAME_SITE !== 'none'
    )
      fail(
        'Default github.io Pages and a separate API need COOKIE_SAME_SITE=none; a shared custom domain is recommended for browser cookie compatibility.',
      );
  }
  const pool = connect(config);
  try {
    await databaseReadiness(pool);
    console.log('PASS Database connection, restricted role and migrations.');
  } catch (error) {
    fail(
      (error as Error).message.startsWith('Use ') ||
        (error as Error).message.startsWith('Pending ') ||
        (error as Error).message.startsWith('Database schema')
        ? (error as Error).message
        : 'Database connection failed. Check PostgreSQL and the server .env; credentials were not printed.',
    );
  } finally {
    await pool.end();
  }
  console.log('INFO Node binds only 127.0.0.1. Production access goes through the HTTPS proxy.');
  process.exitCode = failed ? 1 : 0;
}
void main().catch(() => {
  console.error('FAIL Readiness check failed; no credentials printed.');
  process.exitCode = 1;
});
