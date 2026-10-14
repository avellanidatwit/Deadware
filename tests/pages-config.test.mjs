import test from 'node:test';
import assert from 'node:assert/strict';
import { clientDeployment } from '../client/config/deployment.mjs';

test('local client keeps relative assets and the Vite API proxy', () => {
  assert.deepEqual(clientDeployment({}), { base: './', apiUrl: '' });
  assert.equal(
    clientDeployment({ VITE_API_URL: 'http://localhost:3000' }).apiUrl,
    'http://localhost:3000',
  );
});

test('Pages supports repository paths and custom-domain roots', () => {
  for (const base of ['/Deadware/', '/'])
    assert.deepEqual(
      clientDeployment({ VITE_BASE_PATH: base, VITE_API_URL: 'https://api.example.com' }, true),
      { base, apiUrl: 'https://api.example.com' },
    );
});

test('Pages refuses a missing or invalid API origin before building', () => {
  assert.throws(() => clientDeployment({}, true), /repository variable VITE_API_URL/);
  for (const api of [
    'http://api.example.com',
    'https://api.example.com/',
    'https://api.example.com/api',
    'https://user:password@api.example.com',
    'https://api.example.com?token=example',
    'invalid',
  ]) {
    assert.throws(() => clientDeployment({ VITE_API_URL: api }, true));
  }
});

test('invalid asset paths cannot produce a broken Pages deployment', () => {
  for (const base of [
    'Deadware',
    '/Deadware',
    '//example.com/',
    '/Deadware/?x=1',
    '/Deadware/#code',
  ]) {
    assert.throws(() => clientDeployment({ VITE_BASE_PATH: base }), /VITE_BASE_PATH/);
  }
});

test('production CSP allows only the configured API and local scripts, without eval', async () => {
  const { contentSecurityPolicy } = await import('../client/config/contentSecurityPolicy.mjs');
  const policy = contentSecurityPolicy('https://api.example.com');
  assert.ok(policy.includes("connect-src 'self' https://api.example.com"));
  assert.ok(policy.includes("script-src 'self'"));
  assert.ok(!policy.includes('unsafe-eval'));
  assert.ok(policy.includes("object-src 'none'"));
});
