import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function probe(failure) {
  const fixture = `globalThis.fetch = async (url, options = {}) => {
    const failure = ${JSON.stringify(failure)};
    if (url.endsWith('/api/health')) return Response.json({status:'ready'}, {status:failure==='health'?503:200});
    if (options.method==='OPTIONS') return new Response(null, {status:204,headers:{'access-control-allow-origin':failure==='cors'?'https://other.example.com':'https://play.example.com','access-control-allow-credentials':'true'}});
    if (url.endsWith('/api/me')) return Response.json({}, {status:failure==='auth'?200:401});
    throw new Error('The unpublished client must not be requested.');
  };`;
  return spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,' + encodeURIComponent(fixture),
      'scripts/check-deployment.mjs',
      '--api-only',
      '--api',
      'https://api.example.com',
      '--client',
      'https://play.example.com',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
}

test('Pages launch gate allows a ready API before the first client publication', () => {
  const result = probe(null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});

test('Pages launch gate refuses an unavailable API, wrong origin or public private route', () => {
  for (const failure of ['health', 'cors', 'auth']) {
    const result = probe(failure);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL/);
  }
});
