import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualEventBuffer } from '../dist/server/src/simulation/visualEvents.js';
import { World, encode } from '../dist/server/src/world.mjs';
import { Grid } from '../dist/server/src/world/grid.js';
import { Survivor } from '../dist/server/src/entities/survivor.js';
import { Zombie } from '../dist/server/src/entities/zombie.js';
import { parseSurvivorScript } from '../dist/server/src/scripting/parser/parser.js';
function scene(script = 'WHEN distance nearest zombie <= 1\n ATTACK zombie\nOTHERWISE\n WAIT') {
  const world = new World();
  world.state.grid = new Grid(16, 16);
  world.state.timing = { tickMs: 100, decisionTicks: 6 };
  function add(Actor, id, x, y, program, owner = 'player') {
    const a = new Actor(id, x, y, program);
    world.state.grid.addEntity(a);
    (a instanceof Survivor ? world.state.survivors : world.state.zombies).push(a);
    world.state.meta[id] = {
      owner,
      name: id,
      bornTick: 0,
      version: 1,
      zombieScript: 'OTHERWISE\n WAIT',
    };
    world.programs.set(
      id,
      parseSurvivorScript(program, a instanceof Zombie ? 'zombie' : 'survivor'),
    );
    return a;
  }
  const human = add(Survivor, 'human', 4, 4, script),
    zombie = add(Zombie, 'enemy', 5, 4, 'OTHERWISE\n WAIT', 'enemy-owner');
  world.vision();
  return {
    world,
    human,
    zombie,
    add,
    advance(n) {
      for (let i = 0; i < n; i++) world.advance();
    },
  };
}
test('visual buffer requires occurrence-time witness AND current sight, with opaque IDs and copies', () => {
  const b = new VisualEventBuffer(),
    actor = { id: 'a', kind: 'survivor', x: 1, y: 1 },
    target = { id: 'b', kind: 'zombie', x: 2, y: 1 };
  b.publish({ type: 'attack', actor, target, weapon: 'melee', damage: 25, time: 1 }, ['witness']);
  assert.equal(b.snapshot(['new-viewer'], () => true, 2).events.length, 0);
  assert.equal(b.snapshot(['witness'], (p) => p.id !== 'b', 2).events.length, 0);
  const event = b.snapshot(['witness'], () => true, 2).events[0];
  assert.match(event.id, /^[a-f0-9-]{36}$/);
  assert.equal('witnesses' in event, false);
  assert.equal('sequence' in event, false);
  event.actor.x = 999;
  assert.equal(b.snapshot(['witness'], () => true, 2).events[0].actor.x, 1);
  assert.equal(b.snapshot(['witness'], () => true, 32).events.length, 0);
});
test('successful actual combat emits attacks and exactly one death after actor removal', () => {
  const s = scene();
  s.advance(6);
  let events = s.world.snapshot('player', 'human').visualEvents.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'attack');
  assert.equal(events[0].damage, 25);
  assert.equal(events[0].weapon, 'melee');
  s.advance(5);
  assert.equal(s.world.snapshot('player', 'human').visualEvents.events.length, 1);
  for (let i = 0; i < 60 && s.zombie.isAlive(); i++) s.advance(1);
  events = s.world.snapshot('player', 'human').visualEvents.events;
  assert.equal(events.filter((e) => e.type === 'attack').length, 4);
  assert.equal(events.filter((e) => e.type === 'death').length, 1);
  assert.equal(events.find((e) => e.type === 'death').actor.id, 'enemy');
  assert.equal(
    s.world
      .snapshot('player', 'human')
      .cells.flatMap((c) => c.entities)
      .some((e) => e.id === 'enemy'),
    false,
  );
  const recovered = new World(encode(s.world.state));
  assert.equal(recovered.snapshot('player', 'human').visualEvents.events.length, 0);
});
test('failed shots, missing targets and new observers do not receive fabricated or historical combat', () => {
  const failed = scene('WHEN visible zombie\n SHOOT zombie\nOTHERWISE\n WAIT');
  failed.advance(12);
  assert.equal(failed.world.snapshot('player', 'human').visualEvents.events.length, 0);
  const s = scene();
  s.advance(6);
  s.add(Survivor, 'late', 4, 5, 'OTHERWISE\n WAIT');
  s.world.vision();
  assert.equal(s.world.snapshot('player', 'late').visualEvents.events.length, 0);
  s.world.state.grid.moveEntity(s.human, 14, 14);
  s.world.vision();
  assert.equal(s.world.snapshot('player', 'human').visualEvents.events.length, 0);
});
test('zombie execution emits real attack/death events and all-zombies uses occurrence-time union witnesses', () => {
  const s = scene('OTHERWISE\n WAIT');
  s.human.health = 20;
  s.world.programs.set(
    'enemy',
    parseSurvivorScript(
      'WHEN distance survivor <= 1\n ATTACK survivor\nOTHERWISE\n WAIT',
      'zombie',
    ),
  );
  s.world.state.meta.enemy.owner = 'player';
  s.advance(6);
  const snapshot = s.world.snapshot('player', undefined, (id) => id, true),
    events = snapshot.visualEvents.events;
  assert.ok(events.some((e) => e.type === 'attack' && e.actor.id === 'enemy' && e.damage === 20));
  assert.ok(events.some((e) => e.type === 'death' && e.actor.id === 'human'));
  assert.equal(events.filter((e) => e.type === 'death').length, 1);
});
