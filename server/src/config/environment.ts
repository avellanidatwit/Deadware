import { z } from 'zod';

const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const value = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: integer(3000, 0, 65535),
    DATABASE_HOST: z.string().default('127.0.0.1'), DATABASE_PORT: integer(5432, 1, 65535),
    DATABASE_NAME: z.string().default('deadware'), DATABASE_USER: z.string().default('deadware_app'),
    DATABASE_PASSWORD: z.string().min(1), SESSION_SECRET: z.string().min(32),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    SIMULATION_TICK_MS: integer(100, 20, 10000), DECISION_TICKS: integer(6, 1, 100),
    CHECKPOINT_MS: integer(30000, 1000, 300000), CLIENT_POLL_MS: integer(250, 100, 60000),
  }).parse(env);
  if (value.CLIENT_ORIGIN !== new URL(value.CLIENT_ORIGIN).origin) throw new Error('CLIENT_ORIGIN must be an exact origin without a trailing slash or path.');
  if (value.COOKIE_SAME_SITE === 'none' && value.NODE_ENV !== 'production') throw new Error('Cross-site cookies require production HTTPS.');
  if (value.NODE_ENV === 'production' && !value.CLIENT_ORIGIN.startsWith('https://')) throw new Error('Production client requires HTTPS.');
  return value;
}
export type Configuration = ReturnType<typeof configuration>;
