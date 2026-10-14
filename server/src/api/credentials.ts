import argon2 from 'argon2';
import { z } from 'zod';
export const password = z.string().min(12).max(128);
export const username = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,32}$/)
  .transform((value) => value.toLowerCase());
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const hashing = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
export const sessionCookieName = 'deadware.sid';
