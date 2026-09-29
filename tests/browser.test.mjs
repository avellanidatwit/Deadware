import { drawWorld } from "../dist/client/src/ui/worldRenderer.js";
import { Survivor } from "../dist/server/src/entities/survivor.js";
import { Zombie } from "../dist/server/src/entities/zombie.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/server/src/world/grid.js";

test('renderer preserves visibility using server-provided view methods', () => {
    const map = new Grid(30, 3), observer = new Survivor("observer", 1, 1);
    map.addEntity(observer);
    observer.updateVision(map);
    map.moveEntity(observer, 12, 1);
    observer.updateVision(map);
    map.addEntity(new Zombie("hidden", 1, 1));
    map.getCell(1, 1).items.push({ type: "food" });
    const fills = [], labels = [];
    const painter = {
      fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
      strokeRect() {},
      fillText(label) { labels.push(label); },
    };
    drawWorld(painter, map, observer);
    const terrain = (x, y) => fills.find(rect => rect.x === x * 16 && rect.y === y * 16 && rect.width === 16 && rect.height === 16).color;
    assert.equal(terrain(1, 1), "#303436", "remembered terrain is gray");
    assert.equal(terrain(12, 1), "#385849", "visible terrain is light");
    assert.equal(terrain(29, 1), "#080c0d", "unexplored terrain is dark");
    assert.ok(!labels.includes("Z") && !labels.includes("*"), "hidden entities and loot stay hidden");
    const outline = fills.filter(rect => rect.color === "#f06464");
    assert.ok(outline.length > 0);
    assert.ok(!outline.some(rect => rect.x === 12 * 16 && rect.y === 16), "no outline between adjacent visible tiles");

});


test('login opens an owned-entity viewer, switches perspectives and logs out', async () => {
  const originals = Object.fromEntries(['document', 'window', 'fetch', 'localStorage', 'location'].map(k => [k, globalThis[k]]));
  const elements = new Map(), calls = [], scheduled = [];
  const element = () => ({ value: '', hidden: false, disabled: false, handlers: {}, children: [], focus() {}, append(child) { this.children.push(child); }, replaceChildren() { this.children = []; this.value = ''; }, setAttribute() {}, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }), addEventListener(name, fn) { this.handlers[name] = fn; } });
  globalThis.document = { querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  globalThis.window = { setTimeout(fn) { scheduled.push(fn); return scheduled.length; }, clearTimeout() {} };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  globalThis.location = { origin: 'http://localhost' };
  let rejectLogin = true, expired = false, empty = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/login')) return { ok: !rejectLogin, status: rejectLogin ? 401 : 200, json: async () => rejectLogin ? { error: 'Invalid email or password.' } : { token: 'session-token', email: 'player@example.com' } };
    if (url.endsWith('/api/logout')) return { ok: true, json: async () => ({ success: true }) };
    const isZombie = url.includes('entity=z');
    return { ok: !expired, status: expired ? 401 : 200, json: async () => expired ? { error: 'Please log in again.' } : { tick: 12, width: 1, height: 1, cells: [{ x: 0, y: 0, tileType: 'empty', entities: [], items: [], visible: true, explored: true }], entities: empty ? [] : [{ id: 's', name: 'Scout', kind: 'survivor', health: 100 }, { id: 'z', name: 'Walker', kind: 'zombie', health: 50 }], observer: empty ? null : { id: isZombie ? 'z' : 's', name: isZombie ? 'Walker' : 'Scout', kind: isZombie ? 'zombie' : 'survivor', x: 0, y: 0, health: isZombie ? 50 : 100, maxHealth: 100, sightRange: 5, hunger: 0, thirst: 0, inventory: [], floor: [], message: 'Watching.' } } };
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  try {
    await import('../dist/client/src/legacy.js');
    assert.equal(calls.length, 0, 'no world requests before login');
    elements.get('#viewer-page').hidden = true;
    elements.get('#email').value = 'player@example.com'; elements.get('#password').value = 'correct-password';
    await elements.get('#login-form').handlers.submit({ preventDefault() {} });
    assert.equal(elements.get('#viewer-page').hidden, true);
    assert.match(elements.get('#login-feedback').textContent, /Invalid email/);
    rejectLogin = false;
    await elements.get('#login-form').handlers.submit({ preventDefault() {} }); await settle();
    assert.equal(elements.get('#login-page').hidden, true);
    assert.equal(elements.get('#viewer-page').hidden, false);
    assert.equal(elements.get('#password').value, '');
    assert.equal(elements.get('#view-entity').children.length, 2);
    assert.match(elements.get('#status-heading').textContent, /Scout/);
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer session-token');
    elements.get('#view-entity').value = 'z'; elements.get('#view-entity').handlers.change(); await settle();
    assert.match(calls.at(-1).url, /entity=z/);
    assert.equal(elements.get('#status-heading').textContent, 'Walker');
    assert.equal(elements.get('#entity-type').textContent, 'zombie');
    assert.equal(elements.get('#survivor-details').hidden, true);
    const healthBar = elements.get('#stats').children[0].children[1];
    assert.equal(healthBar.value, 50); assert.equal(healthBar.max, 100);
    empty = true; await scheduled.at(-1)(); await settle();
    assert.equal(elements.get('#empty-state').hidden, false);
    assert.equal(elements.get('#view-entity').disabled, true);
    expired = true; await scheduled.at(-1)(); await settle();
    assert.equal(elements.get('#viewer-page').hidden, true);
    assert.match(elements.get('#login-feedback').textContent, /session expired/);
    expired = false; elements.get('#password').value = 'correct-password';
    await elements.get('#login-form').handlers.submit({ preventDefault() {} }); await settle();
    await elements.get('#logout').handlers.click();
    assert.equal(elements.get('#viewer-page').hidden, true);
    assert.equal(elements.get('#login-page').hidden, false);
    assert.ok(calls.every(c => c.options.method === 'GET' || /\/api\/(login|logout)$/.test(c.url)), 'viewer never mutates the simulation');
  } finally { for (const [key, value] of Object.entries(originals)) globalThis[key] = value; }
});

test('programming tab creates only survivors, edits both life stages and reuses saved programs', async () => {
  const originalDocument = globalThis.document;
  const elements = new Map(), calls = [];
  const element = () => ({ value: '', textContent: '', hidden: false, disabled: false, handlers: {}, children: [], append(child) { this.children.push(child); }, replaceChildren() { this.children = []; this.value = ''; }, addEventListener(name, fn) { this.handlers[name] = fn; } });
  globalThis.document = { querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  const wait = 'OTHERWISE\n WAIT';
  const workspace = { entities: [{ id: 's', name: 'Scout', kind: 'survivor', health: 100, program: wait, zombieScript: wait }, { id: 'z', name: 'Walker', kind: 'zombie', health: 100, program: wait }], scripts: [{ id: 'saved', name: 'Archive', script: wait, zombieScript: 'OTHERWISE\n WANDER', sourceSurvivorId: 'dead' }], queue: [], defaults: { script: wait, zombieScript: wait } };
  const request = async (path, method = 'GET', body) => { calls.push({ path, method, body }); return path === '/api/programming' ? structuredClone(workspace) : { id: 'queued', scriptVersion: 2 }; };
  try {
    const { setupProgramming } = await import('../dist/client/src/ui/programming.js');
    const programming = setupProgramming(request); await programming.refresh();
    assert.equal(elements.get('#program-entity').children[0].textContent, 'Create a survivor');
    elements.get('#survivor-name').value = 'New scout';
    elements.get('#survivor-script').value = 'OTHERWISE\n EXPLORE';
    elements.get('#zombie-script').value = 'OTHERWISE\n WANDER';
    await elements.get('#inject-survivor').handlers.click();
    assert.deepEqual(calls.find(c => c.method === 'POST'), { path: '/api/survivors', method: 'POST', body: { name: 'New scout', script: 'OTHERWISE\n EXPLORE', zombieScript: 'OTHERWISE\n WANDER' } });
    elements.get('#program-entity').value = 's'; elements.get('#program-entity').handlers.change();
    elements.get('#zombie-script').value = 'OTHERWISE\n MOVE east';
    await elements.get('#deploy-program').handlers.click();
    assert.equal(calls.find(c => c.path === '/api/survivors/s/script').body.zombieScript, 'OTHERWISE\n MOVE east');
    elements.get('#script-name').value = 'My strategy'; await elements.get('#save-program').handlers.click();
    assert.equal(calls.find(c => c.path === '/api/scripts').body.name, 'My strategy');
    elements.get('#program-entity').value = 'z'; elements.get('#program-entity').handlers.change();
    assert.equal(elements.get('#inject-survivor').hidden, true);
    assert.equal(elements.get('#future-zombie-panel').hidden, true);
    elements.get('#survivor-script').value = 'OTHERWISE\n WANDER'; await elements.get('#deploy-program').handlers.click();
    assert.deepEqual(calls.find(c => c.path === '/api/zombies/z/script').body, { script: 'OTHERWISE\n WANDER' });
    elements.get('#saved-script').value = 'saved'; elements.get('#saved-script').handlers.change();
    assert.equal(elements.get('#saved-survivor-code').value, wait);
    elements.get('#load-program').handlers.click();
    assert.equal(elements.get('#program-entity').value, ''); assert.equal(elements.get('#zombie-script').value, 'OTHERWISE\n WANDER');
    elements.get('#program-entity').value = 's'; elements.get('#program-entity').handlers.change();
    elements.get('#survivor-script').value = 'OTHERWISE\n MOVE west';
    workspace.entities = workspace.entities.filter(e => e.id !== 's'); await programming.refresh();
    assert.equal(elements.get('#program-entity').value, '');
    assert.equal(elements.get('#survivor-script').value, 'OTHERWISE\n MOVE west', 'death does not discard local edits');
    assert.ok(!calls.some(c => c.path === '/api/zombies' && c.method === 'POST'));
    programming.reset(); assert.equal(elements.get('#survivor-script').value, ''); assert.equal(elements.get('#saved-survivor-code').value, '');
  } finally { globalThis.document = originalDocument; }
});

test('status bars and inventory stay private; hover only displays visible public details', async () => {
  const original = globalThis.document, elements = new Map();
  const element = () => ({ textContent: '', className: '', children: [], attributes: {}, handlers: {}, append(child) { this.children.push(child); }, replaceChildren() { this.children = []; this.textContent = ''; }, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, v) { this.handlers[k] = v; } });
  globalThis.document = { querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  const text = e => [e.textContent, ...e.children.map(text)].join(' ');
  try {
    const { renderStatus, renderInspection, setupInspector, tileAtPointer, duration } = await import('../dist/client/src/ui/entityDetails.js');
    const actor = { id: 's', kind: 'survivor', name: '<Scout>', ownerName: 'Riley', health: 42, maxHealth: 100, kills: 3, aliveSeconds: 122 };
    renderStatus({ ...actor, x: 2, y: 1, hunger: 20, thirst: 75, stamina: 60, ammo: 4, equippedItemId: 'crowbar', inventory: [{ id: 'crowbar', type: 'weapon', name: 'Crowbar' }], floor: [], message: 'Waiting.' });
    assert.equal(elements.get('#status-heading').textContent, '<Scout>');
    assert.equal(elements.get('#owner-name').textContent, 'Owner: Riley');
    assert.equal(elements.get('#stats').children[0].children[1].value, 42);
    assert.equal(elements.get('#needs').children.length, 3);
    assert.equal(elements.get('#inventory').children.length, 5);
    assert.match(text(elements.get('#inventory').children[0]), /Crowbar.*Equipped/);
    assert.match(text(elements.get('#entity-facts')), /2m 2s/);
    assert.equal(duration(null), 'Unknown');
    const cell = { x: 2, y: 1, tileType: 'door', explored: true, visible: true, items: [], entities: [{ id: 's', x: 2, y: 1, symbol: 'S', actor: { ...actor, inventory: ['Secret loot'], hunger: 999, program: 'Secret program' } }] };
    renderInspection(cell);
    assert.equal(elements.get('#tile-heading').textContent, 'Closed door');
    assert.match(text(elements.get('#tile-contents')), /Riley/);
    assert.match(text(elements.get('#tile-contents')), /Kills.*3/);
    assert.ok(!/Secret|999|Stamina|Inventory/.test(text(elements.get('#tile-contents'))));
    renderInspection({ ...cell, visible: false });
    assert.equal(elements.get('#tile-contents').children.length, 0);
    assert.match(elements.get('#tile-description').textContent, /outside current sight/);
    renderInspection({ ...cell, visible: false, explored: false });
    assert.equal(elements.get('#tile-heading').textContent, 'Unexplored tile');
    assert.ok(!/door/i.test(elements.get('#tile-description').textContent));
    const canvas = { ...element(), clientLeft: 1, clientTop: 1, getBoundingClientRect: () => ({ left: 10, top: 20, width: 202, height: 102 }) };
    const data = { width: 10, height: 5, observer: { ...actor, x: 2, y: 1 }, cells: Array.from({ length: 50 }, (_, i) => ({ ...cell, x: i % 10, y: Math.floor(i / 10), entities: [] })) };
    data.cells[12] = cell;
    assert.deepEqual(tileAtPointer(canvas, data, 61, 51), { x: 2, y: 1 });
    assert.equal(tileAtPointer(canvas, data, 10, 20), null, 'border is outside the grid');
    assert.equal(tileAtPointer(canvas, data, 220, 20), null);
    const inspector = setupInspector(canvas); inspector.update(data);
    canvas.handlers.pointermove({ clientX: 61, clientY: 51 });
    assert.match(text(elements.get('#tile-contents')), /Riley/);
    inspector.update({ ...data, cells: data.cells.map(c => ({ ...c, visible: false, entities: [] })) });
    assert.equal(elements.get('#tile-contents').children.length, 0, 'a stationary hover loses stale occupant information when sight is lost');
    canvas.handlers.pointerleave(); assert.equal(elements.get('#tile-heading').textContent, 'Inspect the world');
    inspector.reset(); renderStatus(null);
    assert.equal(elements.get('#inventory').children.length, 0);
    assert.equal(elements.get('#survivor-details').hidden, true);
  } finally { globalThis.document = original; }
});
