import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { clientDeployment } from '../client/config/deployment.mjs';

const { base, apiUrl } = clientDeployment(process.env, true);
const root = new URL('../web-dist/', import.meta.url);
const site = new URL(base, 'https://example.github.io/');
const html = await readFile(new URL('index.html', root), 'utf8');
assert.match(html, /Content-Security-Policy/i, 'Missing client content security policy');
assert.ok(html.includes(apiUrl), 'Client security policy must allow its configured API');
const references = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
  (match) => match[1],
);
assert.ok(
  references.some((ref) => ref.endsWith('.js')),
  'Missing client JavaScript',
);
assert.ok(
  references.some((ref) => ref.endsWith('.css')),
  'Missing client stylesheet',
);
for (const ref of references) {
  const url = new URL(ref, site);
  assert.equal(url.origin, site.origin, 'Assets must stay on the Pages host');
  assert.ok(url.pathname.startsWith(site.pathname), `Asset is outside the site path: ${ref}`);
  const asset = new URL(url.pathname.slice(site.pathname.length), root);
  assert.ok((await stat(fileURLToPath(asset))).isFile(), `Missing built asset: ${ref}`);
  if (ref.endsWith('.js'))
    assert.ok(
      (await readFile(asset, 'utf8')).includes(apiUrl),
      'Public API URL was not embedded in the client',
    );
}
console.log(
  `Pages artifact verified for ${site.pathname}: ${references.length} assets and public API configuration.`,
);
