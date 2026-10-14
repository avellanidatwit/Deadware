import type { RequestHandler, ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { Configuration } from '../config/environment.js';
import type { Runtime } from '../simulation/runtime.js';
export function apiSecurity(config: Configuration, runtime: Runtime): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    if (config.NODE_ENV === 'production')
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    const origin = req.headers.origin,
      safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      (origin && origin !== config.CLIENT_ORIGIN) ||
      (!safe && (origin !== config.CLIENT_ORIGIN || req.headers['x-deadware-client'] !== 'web'))
    ) {
      res.status(403).json({ error: 'Origin not allowed.' });
      return;
    }
    res.vary('Origin');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Deadware-Client');
      res.setHeader('Access-Control-Max-Age', '600');
      res.sendStatus(204);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) {
      res.status(415).json({ error: 'Use application/json.' });
      return;
    }
    if (runtime.failed) {
      res.status(503).json({ error: 'Simulation unavailable.' });
      return;
    }
    next();
  };
}
export const apiErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      errors: error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', status }));
  const message =
    status >= 500
      ? 'Server unavailable.'
      : error.type === 'entity.parse.failed'
        ? 'Invalid JSON.'
        : status === 413
          ? 'Request too large.'
          : error.message;
  res
    .status(status)
    .json({ success: false, errors: [{ line: error.lineNumber ?? null, message }] });
};
