import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseSurvivorScript as parse,
  runSurvivorProgram as select,
  executeSurvivorAction as execute,
} from '../dist/server/src/scripting/survivorScript.js';
import { World, encode, compile } from '../dist/server/src/world.mjs';
import { Grid } from '../dist/server/src/world/grid.js';
import { Survivor } from '../dist/server/src/entities/survivor.js';
import { Zombie } from '../dist/server/src/entities/zombie.js';
import { ItemContainer } from '../dist/server/src/entities/container.js';
import { createItem } from '../dist/server/src/entities/item.js';
import { decideActor } from '../dist/server/src/simulation/movement.js';
function scene() {
  const grid = new Grid(20, 12),
    survivor = new Survivor('player', 2, 2);
  grid.addEntity(survivor);
  survivor.updateVision(grid);
  return { grid, survivor, survivors: [survivor], zombies: [], canMove: true };
}
const action = (source) => parse(`OTHERWISE\n ${source}`).rules[0].action;

test('targeted commands share one AST and removed syntax is rejected', () => {
  for (const [source, verb, type] of [
    ['MOVE_AWAY zombie', 'MOVE_AWAY', 'zombie'],
    ['MOVE_TO container', 'MOVE_TO', 'container'],
    ['ATTACK zombie', 'ATTACK', 'zombie'],
    ['OPEN door', 'OPEN', 'door'],
    ['SEARCH container', 'SEARCH', 'container'],
    ['FIND food', 'FIND', 'food'],
  ]) {
    assert.deepEqual(action(source), {
      type: 'targeted',
      verb,
      target: { type, selector: 'nearest' },
    });
  }
  for (const condition of [
    'hungry',
    'thirsty',
    'tired',
    'zombieNearby 5',
    'survivorNearby',
    'containerNearby',
    'doorNearby',
    'nearbydoor',
    'itemNearby food',
    'buildingNearby',
    'carNearby',
    'zombieCount 5 > 0',
    'survivorCount 5 > 0',
  ]) {
    assert.throws(() => parse(`WHEN ${condition}\n WAIT`), /Line 1/);
  }
  for (const source of [
    'CHASE survivor',
    'WANDER',
    'SEARCH food',
    'SEARCH water',
    'FIND container',
    'PICK_UP nearest food',
    'MOVE_TOO food',
  ])
    assert.throws(() => action(source));
  for (const expression of [
    'count zombie -1 > 0',
    'count zombie 5 > 1.5',
    'count home 5 > 0',
    'count zombie 9007199254740992 > 0',
    'distance nearest zombie < -1',
  ])
    assert.throws(() => parse(`WHEN ${expression}\n WAIT`));
});

test('generic count and distance respect sight, death, self and missing targets', () => {
  const c = scene();
  const z = new Zombie('z', 5, 2);
  c.zombies.push(z);
  c.grid.addEntity(z);
  function matches(expr) {
    return select(parse(`WHEN ${expr}\n MOVE east\nOTHERWISE\n WAIT`), c).type === 'move';
  }
  assert.equal(matches('count zombie 5 == 1'), true);
  assert.equal(matches('distance nearest zombie < 4'), true);
  assert.equal(matches('count survivor 5 == 0'), true);
  c.grid.getCell(4, 2).tileType = 'buildingWall';
  assert.equal(matches('count zombie 5 == 0'), true);
  assert.equal(matches('distance nearest zombie != 1'), false);
  c.grid.getCell(4, 2).tileType = 'empty';
  z.health = 0;
  assert.equal(matches('count zombie 5 == 0'), true);
  const enemy = new Survivor('far', 12, 2);
  c.grid.addEntity(enemy);
  const zp = parse('WHEN count survivor 100 > 0\n ATTACK survivor\nOTHERWISE\n WAIT', 'zombie');
  z.health = 100;
  assert.equal(select(zp, { ...c, survivor: z, survivors: [enemy] }).type, 'wait');
});

test('FIND navigates or explores, MOVE_TO never explores, SEARCH only interacts, PICK_UP collects', () => {
  const c = scene();
  let explores = 0;
  c.survivor.explore = () => {
    explores++;
    return true;
  };
  execute(action('MOVE_TO food'), c);
  assert.equal(explores, 0);
  execute(action('FIND food'), c);
  assert.equal(explores, 1);
  const food = createItem('food');
  c.grid.getCell(4, 2).items.push(food);
  execute(action('FIND food'), c);
  assert.equal(c.survivor.x, 3);
  assert.equal(c.survivor.inventory.length, 0);
  execute(action('MOVE_TO food'), c);
  assert.equal(c.survivor.x, 4);
  execute(action('PICK_UP food'), c);
  assert.equal(c.survivor.getItemCount('food'), 1);
  const container = new ItemContainer('box', 5, 2, 'Box', [createItem('water')]);
  c.grid.addEntity(container);
  execute(action('SEARCH container'), c);
  assert.equal(c.survivor.x, 4);
  assert.equal(c.survivor.getItemCount('water'), 0);
  execute(action('PICK_UP water'), c);
  assert.equal(c.survivor.getItemCount('water'), 1);
  const missing = execute(action('USE bandage'), c);
  assert.match(missing, /unavailable/);
  c.survivor.health = 20;
  assert.equal(
    select(parse('WHEN health < 50\n USE bandage\nOTHERWISE\n MOVE east'), c).verb,
    'USE',
  );
});

test('declared modes initialize, switch one decision at a time, cancel motion and persist', () => {
  const c = scene();
  const source =
    'MODE scouting\nMODE resting\nWHEN mode == scouting AND health < 50\n SET_MODE resting\nWHEN mode == resting\n WAIT\nOTHERWISE\n MOVE east';
  const program = parse(source);
  c.survivor.program = source;
  decideActor(program, c, 0);
  assert.equal(c.survivor.mode, 'scouting');
  assert.ok(c.survivor.motion);
  c.survivor.health = 30;
  decideActor(program, c, 0.6);
  assert.equal(c.survivor.mode, 'resting');
  assert.equal(c.survivor.motion, undefined);
  assert.equal(select(program, c).type, 'wait');
  const w = new World();
  w.state.grid = c.grid;
  w.state.survivors = c.survivors;
  w.state.meta.player = { owner: 'owner', name: 'Player', bornTick: 0, version: 1 };
  const restored = new World(encode(w.state));
  assert.equal(restored.state.survivors[0].mode, 'resting');
  restored.deploy('player', 'owner', source);
  assert.equal(restored.state.survivors[0].mode, 'scouting');
  const z = new Zombie('z', 8, 2);
  const zp = parse(
    'MODE roaming\nMODE hunting\nWHEN mode == roaming\n SET_MODE hunting\nOTHERWISE\n WAIT',
    'zombie',
  );
  decideActor(zp, { ...c, survivor: z, zombies: [z] }, 0);
  assert.equal(z.mode, 'hunting');
});

test('mode declarations reject typos, duplicates, misplaced declarations and invalid names', () => {
  for (const source of [
    'MODE a\nMODE a\nOTHERWISE\n WAIT',
    'MODE A\nOTHERWISE\n WAIT',
    'MODE a\nWHEN mode == b\n WAIT',
    'OTHERWISE\n SET_MODE missing',
    'OTHERWISE\n WAIT\nMODE a',
    'MODE a\nOTHERWISE\n SPRINT SET_MODE a',
  ])
    assert.throws(() => parse(source));
  assert.throws(() =>
    parse(Array.from({ length: 17 }, (_, i) => `MODE m${i}`).join('\n') + '\nOTHERWISE\n WAIT'),
  );
  assert.throws(() => parse('MODE ' + 'a'.repeat(33) + '\nOTHERWISE\n WAIT'));
  assert.throws(() => parse('WHEN NOT itemCount water == 0\n WAIT', 'zombie'), /survivor script/);
  assert.throws(() => parse('OTHERWISE\n ATTACK zombie', 'zombie'), /opposing/);
  assert.throws(() => parse('OTHERWISE\n ATTACK survivor'), /opposing/);
});

test('saved invalid scripts wait instead of breaking world startup', () => {
  const w = new World(),
    s = new Survivor('old', 2, 2, 'WHEN hungry\n EAT food');
  w.state.grid.addEntity(s);
  w.state.survivors.push(s);
  w.state.meta.old = {
    owner: 'o',
    name: 'Old',
    bornTick: 0,
    version: 1,
    zombieScript: 'OTHERWISE\n WANDER',
  };
  const loaded = new World(encode(w.state));
  assert.equal(loaded.programs.get('old').rules[0].action.type, 'wait');
  assert.match(loaded.state.survivors[0].history.at(-1).message, /Script rejected/);
  loaded.state.survivors[0].health = 0;
  loaded.advance(); // The prepared zombie script is also safe.
});

test('published wiki and tutorial programs compile with current syntax', () => {
  for (const file of ['wiki', 'tutorial']) {
    const html = readFileSync(`client/src/content/${file}.html`, 'utf8');
    for (const [, snippet] of html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) {
      const source = snippet
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
      compile(source, source.includes('ATTACK nearest survivor') ? 'zombie' : 'survivor');
    }
  }
});

test('visible is generic and never treats remembered coordinates as current sight', () => {
  const c = scene();
  const food = createItem('food');
  c.grid.getCell(4, 2).items.push(food);
  const yes = (expr) =>
    select(parse(`WHEN ${expr}\n MOVE east\nOTHERWISE\n WAIT`), c).type === 'move';
  assert.equal(yes('visible nearest food'), true);
  assert.equal(yes('count food 5 >= 1'), true);
  assert.equal(yes('visible nearest food 1'), false);
  c.grid.getCell(3, 2).tileType = 'buildingWall';
  assert.equal(yes('visible nearest food'), false);
  for (const slot of ['home', 'target', 'lastZombie', 'lastContainer'])
    assert.throws(() => parse(`WHEN visible ${slot}\n WAIT`), /memory slot/);
  assert.doesNotThrow(() => parse('WHEN visible nearest survivor\n ATTACK survivor', 'zombie'));
  assert.throws(() => parse('WHEN visible nearest food\n WAIT', 'zombie'), /survivor script/);
  for (const selector of ['nearest', 'weakest', 'strongest', 'farthest']) {
    assert.equal(action(`ATTACK ${selector} zombie`).type, 'targeted');
    assert.equal(action(`ATTACK ${selector} zombie`).target.selector, selector);
  }
});

test('condition budget counts operators and leaves across rules instead of limiting each rule', () => {
  const six = Array(6).fill('health > 0').join(' AND ');
  assert.doesNotThrow(() => compile(`WHEN ${six}\n WAIT`, 'survivor'));
  // 50 rules, each with OR + NOT + three leaves = exactly 250 nodes.
  const five = 'WHEN NOT health > 0 OR health > 1 OR health > 2\n WAIT';
  assert.doesNotThrow(() => compile(Array(50).fill(five).join('\n'), 'survivor'));
  assert.throws(
    () => compile(Array(50).fill(five).join('\n') + '\nOTHERWISE\n WAIT', 'survivor'),
    /condition nodes/,
  );
  assert.throws(
    () => parse('WHEN NOT health > 0\n WAIT', 'survivor', { maxConditionNodes: 1 }),
    /condition nodes/,
  );
  assert.throws(() => parse('OTHERWISE\n WAIT', 'survivor', { maxConditionNodes: NaN }), /budget/);
});

test('mode lifecycle covers no-mode redeploy, death and an independent zombie default', () => {
  const c = scene(),
    w = new World();
  w.state.grid = c.grid;
  w.state.survivors = c.survivors;
  const source = 'MODE alive\nOTHERWISE\n WAIT';
  c.survivor.program = source;
  c.survivor.mode = 'alive';
  w.programs.set('player', parse(source));
  w.state.meta.player = {
    owner: 'o',
    name: 'Player',
    bornTick: 0,
    version: 1,
    zombieScript: 'MODE hunting\nOTHERWISE\n WAIT',
  };
  w.deploy('player', 'o', 'OTHERWISE\n WAIT');
  assert.equal(c.survivor.mode, undefined);
  w.deploy('player', 'o', source);
  assert.equal(c.survivor.mode, 'alive');
  c.survivor.health = 0;
  w.raiseDead();
  assert.equal(c.survivor.mode, 'alive');
  assert.equal(w.state.zombies[0].mode, 'hunting');
  const restored = new World(encode(w.state));
  assert.equal(restored.state.zombies[0].mode, 'hunting');
});

test('decision traces report actual evaluated values, short circuits, selection and failures', () => {
  const c = scene();
  c.survivor.health = 30;
  const program = parse(
    'WHEN health < 20 AND count zombie 5 > 0\n ATTACK zombie\nWHEN health < 50\n USE bandage\nOTHERWISE\n WAIT',
  );
  const trace = { rules: [] };
  const normal = select(program, c);
  assert.equal(select(program, c, trace), normal);
  assert.equal(trace.rules[0].matched, false);
  assert.equal(trace.rules[0].condition.children.length, 1);
  assert.equal(trace.rules[0].condition.children[0].actual, 30);
  assert.equal(trace.selectedRule, 2);
  assert.equal(trace.rules.length, 2);
  decideActor(program, c, 1, trace);
  assert.match(trace.failureReason, /unavailable/);
  assert.equal(trace.selectedAction.verb, 'USE');
  decideActor(parse('MODE exploring\nMODE resting\nOTHERWISE\n SET_MODE resting'), c, 2, trace);
  assert.equal(trace.mode, 'exploring');
  assert.equal(trace.modeAfter, 'resting');
  assert.equal(trace.failureReason, undefined);
  select(parse('WHEN itemsOnFloor\n PICK_UP items\nOTHERWISE\n WAIT'), c, trace);
  assert.match(trace.rules[0].skippedReason, /eligible/);
  assert.equal(trace.rules[0].matched, undefined);
  c.survivor.health = 0;
  decideActor(program, c, 3, trace);
  assert.match(trace.failureReason, /dead/);
  assert.equal(trace.rules.length, 0);
});
