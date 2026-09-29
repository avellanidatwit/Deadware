import { cp, mkdir, rm } from 'node:fs/promises';
// A separate artifact contains only static client assets for GitHub Pages.
await rm(new URL('../web-dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../web-dist/dist/ui/', import.meta.url), { recursive: true });
await cp(new URL('../public/', import.meta.url), new URL('../web-dist/', import.meta.url), { recursive: true });
for (const name of ['main.js', 'ui/worldRenderer.js', 'ui/programming.js', 'ui/entityDetails.js']) await cp(new URL(`../dist/client/src/${name === 'main.js' ? 'legacy.js' : name}`, import.meta.url), new URL(`../web-dist/dist/${name}`, import.meta.url));
