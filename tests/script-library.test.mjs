import test from 'node:test';
import assert from 'node:assert/strict';
import { World, encode } from '../dist/server/src/world.mjs';
import { parseSurvivorScript as parse } from '../dist/server/src/scripting/parser/parser.js';
import { zombieBehaviorPresets } from '../dist/shared/src/behaviorPresets.js';
const survivorCode = 'WHEN health < 30 AND hasItem bandage\n USE bandage\nOTHERWISE\n EXPLORE';
const zombieCode = 'WHEN distance nearest survivor <= 1\n ATTACK survivor\nOTHERWISE\n EXPLORE';

test('survivor and zombie library entries save, update and delete independently', () => {
  const world = new World();
  const survivor = world.saveBehavior('owner', 'survivor', 'Scout', survivorCode);
  const zombie = world.saveBehavior('owner', 'zombie', 'Hunter', zombieCode);
  assert.deepEqual(world.programming('owner').behaviorScripts, [survivor, zombie]);
  world.updateBehavior('owner', 'survivor', survivor.id, 'Rest', 'OTHERWISE\n WAIT');
  assert.deepEqual(
    world.behaviorScripts('owner').find((entry) => entry.kind === 'zombie'),
    zombie,
  );
  world.deleteBehavior('owner', 'survivor', survivor.id);
  assert.deepEqual(world.behaviorScripts('owner'), [zombie]);
  assert.deepEqual(new World(encode(world.state)).behaviorScripts('owner'), [zombie]);
});

test('each independent save validates only that actor language and rejects invalid mutations atomically', () => {
  const world = new World();
  assert.throws(
    () => world.saveBehavior('owner', 'zombie', 'Invalid', survivorCode),
    /survivor script/,
  );
  assert.equal(world.behaviorScripts('owner').length, 0);
  const survivor = world.saveBehavior('owner', 'survivor', 'Medic', survivorCode);
  assert.throws(() => world.updateBehavior('owner', 'survivor', survivor.id, 'Broken', 'bad code'));
  assert.deepEqual(world.behaviorScripts('owner'), [survivor]);
  // Zombie saves have no dependency on any survivor draft, or vice versa.
  const zombie = world.saveBehavior('owner', 'zombie', 'Hunter', zombieCode);
  assert.equal(world.behaviorScripts('owner').length, 2);
  assert.throws(
    () => world.updateBehavior('owner', 'survivor', zombie.id, 'Wrong kind', survivorCode),
    /not found/,
  );
  assert.throws(() => world.deleteBehavior('other', 'zombie', zombie.id), /not found/);
  assert.throws(
    () => world.updateBehavior('other', 'survivor', survivor.id, 'Stolen', survivorCode),
    /not found/,
  );
  assert.deepEqual(world.behaviorScripts('other'), []);
});

test('legacy paired scripts expose independent names, edits and deletion while retaining legacy APIs', () => {
  const world = new World();
  const pair = world.saveScript('owner', 'Original', survivorCode, zombieCode);
  const originalZombie = world.behaviorScripts('owner').find((entry) => entry.kind === 'zombie');
  world.updateBehavior('owner', 'survivor', pair.id, 'New survivor name', 'OTHERWISE\n WAIT');
  assert.deepEqual(
    world.behaviorScripts('owner').find((entry) => entry.kind === 'zombie'),
    originalZombie,
  );
  assert.equal(world.scripts('owner')[0].zombieScript, zombieCode);
  world.deleteBehavior('owner', 'survivor', pair.id);
  assert.deepEqual(world.behaviorScripts('owner'), [originalZombie]);
  world.updateBehavior('owner', 'zombie', pair.id, 'New zombie name', 'OTHERWISE\n WAIT');
  const recovered = new World(encode(world.state));
  assert.deepEqual(recovered.behaviorScripts('owner'), [
    { id: pair.id, name: 'New zombie name', kind: 'zombie', code: 'OTHERWISE\n WAIT' },
  ]);
  assert.equal(recovered.scripts('owner').length, 1);
});

test('all basic zombie behaviors validate and deploy to risen zombies', () => {
  for (const preset of zombieBehaviorPresets) {
    assert.doesNotThrow(() => parse(preset.script, 'zombie'));
    const world = new World();
    world.saveBehavior('owner', 'zombie', preset.name, preset.script);
    world.inject('owner', 'survivor', 'Scout', 'OTHERWISE\n WAIT', preset.script);
    while (!world.state.survivors.length) world.advance();
    world.state.survivors[0].health = 0;
    world.raiseDead();
    const risen = world.state.zombies.find(
      (zombie) => world.state.meta[zombie.id]?.owner === 'owner',
    );
    assert.ok(risen);
    world.deploy(risen.id, 'owner', preset.script);
    assert.equal(risen.program, preset.script);
  }
});
