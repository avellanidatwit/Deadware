import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server.mjs';
import { World, encode, compile } from '../server/world.mjs';
import { Survivor } from '../dist/entities/survivor.js';
import { Grid } from '../dist/world/grid.js';
import { Zombie } from '../dist/entities/zombie.js';
import { ItemContainer } from '../dist/entities/container.js';
const wait = 'OTHERWISE\n WAIT', token = 'a'.repeat(32), other = 'b'.repeat(32);
const users = JSON.stringify([{ email: 'player@example.com', password: 'test-password-123', owner: 'operator', displayName: 'Riley' }, { email: 'other@example.com', password: 'other-password-123', owner: 'other' }]);
function decision(world) { for (let i = 0; i < 6; i++) world.advance(); }
function spawn(world, owner = 'operator', script = wait, zombieScript = wait) {
  const { id } = world.inject(owner, 'survivor', 'Scout', script, zombieScript); decision(world);
  return world.state.survivors.find(e => e.id === id);
}

test('persistent API: ownership, validation, survivor-only injection, script library and recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deadware-'));
  const options = { port: 0, database: join(dir, 'world.sqlite'), tokens: JSON.stringify({ [token]: 'operator', [other]: 'other' }), users, tickMs: 100000, origins: 'https://example.github.io' };
  let app = await startServer(options);
  const request = (path, method = 'GET', body, key = token, headers = {}) => fetch(`http://127.0.0.1:${app.server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.deepEqual(app.world.entities('operator'), [], 'world starts without test actors');
    const actor = spawn(app.world), path = `/api/survivors/${actor.id}/script`;
    assert.equal((await request('/api/world', 'GET', undefined, 'invalid')).status, 401);
    assert.equal((await request('/api/world', 'GET', undefined, token, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/api/world', 'GET', undefined, token, { Origin: 'https://example.github.io' })).headers.get('access-control-allow-origin'), 'https://example.github.io');
    assert.equal((await request(path, 'PUT', { script: wait }, other)).status, 404);
    assert.equal((await request('/api/survivors', 'POST', { name: 'Cheater', script: wait, health: 500 })).status, 400);
    assert.equal((await request('/api/zombies', 'POST', { name: 'Forbidden', script: wait })).status, 403);
    const invalid = await request(path, 'PUT', { script: 'WHEN bogus\n WAIT' });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).errors[0].line, 1);
    assert.equal((await request(path, 'PUT', { script: wait, zombieScript: 'OTHERWISE\n WANDER' })).status, 200);
    assert.equal((await request(path, 'PUT', { script: 'OTHERWISE\n EXPLORE', zombieScript: 'bad' })).status, 400);
    assert.equal(actor.program, wait, 'invalid future zombie program must not partially deploy survivor code');
    const saved = await request('/api/scripts', 'POST', { name: 'Reusable', script: wait, zombieScript: wait });
    assert.equal(saved.status, 201);
    assert.equal((await (await request('/api/scripts', 'GET', undefined, other)).json()).scripts.length, 0);
    const queued = await request('/api/survivors', 'POST', { name: 'New survivor', script: wait, zombieScript: wait }, other);
    assert.equal(queued.status, 202); const { id } = await queued.json();
    const before = encode(app.world.state);
    await app.close(); app = null;
    app = await startServer(options);
    assert.equal(encode(app.world.state), before, 'queue, library and world restore exactly');
    decision(app.world);
    assert.ok(app.world.entities('other').some(e => e.id === id));
    assert.ok(app.world.state.survivors[0] instanceof Survivor);
    assert.ok(app.world.state.survivors[0].exploredTiles instanceof Set);
    const survivor = app.world.state.survivors[0];
    assert.ok(app.world.state.grid.getCell(survivor.x, survivor.y).entities.includes(survivor));
    assert.ok(app.world.state.grid.cells.flat().some(c => c.entities.some(e => e instanceof ItemContainer)));
    assert.equal((await request('/dist/world/grid.js')).status, 404);
    assert.equal((await request('/dist/ui/programming.js')).status, 200);
    assert.equal((await (await request('/api/programming')).json()).scripts[0].name, 'Reusable');
  } finally { if (app) await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('death raises exactly one owned zombie at the corpse, archives scripts and survives recovery', () => {
  const world = new World();
  world.state.grid = new Grid(6, 6);
  const actor = spawn(world); world.state.grid.moveEntity(actor, 2, 2);
  const corpse = { x: actor.x, y: actor.y };
  const zombieCode = 'OTHERWISE\n MOVE east';
  world.deploy(actor.id, 'operator', wait, zombieCode);
  actor.health = 1; actor.thirst = 100; decision(world);
  assert.equal(actor.health, 0);
  const undead = world.state.zombies[0];
  assert.equal(undead.x, corpse.x); assert.equal(undead.y, corpse.y);
  assert.equal(undead.program, zombieCode);
  assert.equal(world.state.meta[undead.id].sourceSurvivorId, actor.id);
  assert.equal(world.state.meta[undead.id].owner, 'operator');
  assert.ok(!world.state.grid.getCell(actor.x, actor.y).entities.includes(actor));
  assert.ok(world.state.grid.getCell(actor.x, actor.y).entities.includes(undead));
  assert.equal(world.scripts('operator')[0].script, wait);
  assert.equal(world.scripts('operator')[0].zombieScript, zombieCode);
  assert.throws(() => world.deploy(actor.id, 'operator', wait), /dead/);
  assert.throws(() => world.deploy(undead.id, 'other', wait), /not found/);
  const restored = new World(encode(world.state));
  decision(restored);
  assert.equal(restored.state.zombies[0].x, corpse.x + 1, 'prepared zombie script executes on its first decision');
  decision(restored);
  assert.equal(restored.state.zombies.length, 1); assert.equal(restored.scripts('operator').length, 1);
  restored.deploy(undead.id, 'operator', wait);
  assert.equal(restored.state.zombies[0].program, wait);
  assert.ok(!restored.programming('operator').entities.some(e => e.id === actor.id));
  assert.throws(() => world.inject('operator', 'zombie', 'No', wait), /cannot be injected/);
});

test('random injection selects different free locations and prototype migration preserves player entities', t => {
  const world = new World();
  t.mock.method(Math, 'random', () => 0);
  const first = spawn(world);
  Math.random.mock.mockImplementation(() => 0.99999);
  const last = spawn(world);
  assert.notDeepEqual([first.x, first.y], [last.x, last.y]);
  assert.ok(world.state.grid.isWalkable(last.x, last.y));
  for (const e of [new Survivor('survivor-1', first.x, first.y, wait), new Zombie('zombie-1', first.x, first.y), new Zombie('building-1-zombie', first.x, first.y)]) {
    (e instanceof Survivor ? world.state.survivors : world.state.zombies).push(e);
    world.state.grid.getCell(e.x, e.y).entities.push(e);
    world.state.meta[e.id] = { owner: 'operator', name: e.id, version: 1 };
  }
  const migrated = new World(encode(world.state));
  assert.equal(migrated.state.survivors.length, 2); assert.equal(migrated.state.zombies.length, 0);
  assert.ok(migrated.state.grid.cells.flat().every(c => c.entities.every(e => !['survivor-1', 'zombie-1', 'building-1-zombie'].includes(e.id))));
  assert.equal(new World(encode(migrated.state)).state.survivors.length, 2);
  assert.throws(() => compile('x'.repeat(16385), 'survivor'));
  assert.throws(() => compile(Array(101).fill(wait).join('\n'), 'survivor'));
  assert.throws(() => compile('WHEN health > 1 AND health > 2 AND health > 3 AND health > 4 AND health > 5 AND health > 6\n WAIT', 'survivor'));
});

test('email login, logout, selected-entity ownership and offline server ticks', async () => {
  const app = await startServer({ port: 0, database: ':memory:', users, tickMs: 10 });
  const request = (path, method = 'GET', body, key) => fetch(`http://127.0.0.1:${app.server.address().port}${path}`, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try {
    const actor = spawn(app.world);
    const bad = await request('/api/login', 'POST', { email: 'player@example.com', password: 'wrong' });
    const missing = await request('/api/login', 'POST', { email: 'missing@example.com', password: 'wrong' });
    assert.equal(bad.status, 401); assert.deepEqual(await missing.json(), await bad.json());
    const session = await (await request('/api/login', 'POST', { email: ' PLAYER@EXAMPLE.COM ', password: 'test-password-123' })).json();
    const survivor = await (await request(`/api/world?entity=${actor.id}`, 'GET', undefined, session.token)).json();
    assert.equal(survivor.observer.kind, 'survivor');
    assert.equal(survivor.observer.ownerName, 'Riley');
    actor.health = 0; decision(app.world); const undead = app.world.state.zombies[0];
    const zombie = await (await request(`/api/world?entity=${undead.id}`, 'GET', undefined, session.token)).json();
    assert.equal(zombie.observer.kind, 'zombie'); assert.ok(zombie.cells.some(c => c.visible));
    assert.ok(zombie.cells.filter(c => !c.visible).every(c => !c.entities.length && !c.items.length));
    const otherSession = await (await request('/api/login', 'POST', { email: 'other@example.com', password: 'other-password-123' })).json();
    assert.equal((await request(`/api/world?entity=${undead.id}`, 'GET', undefined, otherSession.token)).status, 404);
    assert.equal((await (await request('/api/world', 'GET', undefined, otherSession.token)).json()).observer, null);
    const tick = app.world.state.tick; await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(app.world.state.tick > tick);
    assert.equal((await request('/api/logout', 'POST', undefined, session.token)).status, 200);
    assert.equal((await request('/api/world', 'GET', undefined, session.token)).status, 401);
  } finally { await app.close(); }
});

test('a fatal zombie attack raises the victim once, without letting the new zombie act early', () => {
  const world = new World(); world.state.grid = new Grid(8, 8);
  const source = spawn(world, 'operator', wait, 'OTHERWISE\n ATTACK survivor');
  source.health = 0; decision(world);
  const attacker = world.state.zombies[0];
  const victim = spawn(world, 'other', wait, wait);
  world.state.grid.moveEntity(attacker, 3, 3); world.state.grid.moveEntity(victim, 4, 3);
  victim.health = 20; decision(world);
  const child = world.state.zombies.find(z => world.state.meta[z.id].sourceSurvivorId === victim.id);
  assert.ok(child); assert.deepEqual([child.x, child.y], [4, 3]);
  assert.equal(attacker.kills, 1);
  assert.equal(world.state.meta[child.id].owner, 'other');
  decision(world); assert.equal(world.state.zombies.length, 2);
});

test('public entity snapshots expose only identity, health, kills and persistent lifetime', () => {
  const world = new World(); world.state.grid = new Grid(20, 5);
  const viewer = spawn(world, 'operator'), otherActor = spawn(world, 'other');
  world.state.grid.moveEntity(viewer, 2, 2); world.state.grid.moveEntity(otherActor, 3, 2);
  otherActor.carriedItems.push({ id: 'secret', type: 'food', name: 'Secret inventory', catalogKey: 'canned-food' });
  otherActor.memory.home = { x: 19, y: 4 }; otherActor.kills = 7;
  world.vision();
  let snapshot = world.snapshot('operator', viewer.id, id => id === 'other' ? 'Alex' : 'Riley');
  const visible = snapshot.cells.find(c => c.x === 3 && c.y === 2).entities.find(e => e.id === otherActor.id);
  assert.deepEqual(Object.keys(visible.actor).sort(), ['aliveSeconds', 'health', 'id', 'kills', 'kind', 'maxHealth', 'name', 'ownerName'].sort());
  assert.equal(visible.actor.ownerName, 'Alex'); assert.equal(visible.actor.kills, 7);
  assert.ok(!JSON.stringify(visible).includes('Secret inventory'));
  assert.ok(!JSON.stringify(visible).includes('OTHERWISE'));
  assert.equal(snapshot.observer.ownerName, 'Riley');
  decision(world);
  assert.throws(() => world.snapshot('operator', otherActor.id), /not found/);
  const age = world.snapshot('other', otherActor.id).observer.aliveSeconds;
  assert.equal(age, 0.6);
  world.state.grid.moveEntity(otherActor, 19, 2); world.vision();
  snapshot = world.snapshot('operator', viewer.id);
  assert.ok(!snapshot.cells.some(c => c.entities.some(e => e.id === otherActor.id)), 'out-of-sight actors have no public details');
  otherActor.health = 0; decision(world);
  const deadAge = world.snapshot('other', otherActor.id).observer.aliveSeconds;
  const restored = new World(encode(world.state)); decision(restored);
  assert.equal(restored.snapshot('other', otherActor.id).observer.aliveSeconds, deadAge, 'lifetime stops at death and persists');
  assert.equal(restored.snapshot('other', otherActor.id).observer.kills, 7);
  delete restored.state.meta[viewer.id].bornTick;
  assert.equal(restored.snapshot('operator', viewer.id).observer.aliveSeconds, null, 'old saves do not invent historical lifetimes');
});

test('survivor combat records one kill per fatal blow and keeps it after recovery', () => {
  const world = new World(); world.state.grid = new Grid(8, 8);
  const source = spawn(world, 'other'); source.health = 0; decision(world);
  const target = world.state.zombies[0], attacker = spawn(world, 'operator');
  world.state.grid.moveEntity(attacker, 3, 3); world.state.grid.moveEntity(target, 4, 3); target.health = 25;
  world.deploy(attacker.id, 'operator', 'OTHERWISE\n ATTACK zombie'); decision(world);
  assert.equal(target.health, 0); assert.equal(attacker.kills, 1);
  decision(world); assert.equal(attacker.kills, 1);
  const restored = new World(encode(world.state));
  assert.equal(restored.snapshot('operator', attacker.id).observer.kills, 1);
});
