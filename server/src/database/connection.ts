import pg from 'pg';
import type { Configuration } from '../config/environment.js';

export function connect(config: Configuration) {
  return new pg.Pool({ host: config.DATABASE_HOST, port: config.DATABASE_PORT,
    database: config.DATABASE_NAME, user: config.DATABASE_USER, password: config.DATABASE_PASSWORD,
    max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
}
