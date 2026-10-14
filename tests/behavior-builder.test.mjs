import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSurvivorScript as parse } from '../dist/server/src/scripting/parser/parser.js';
import {
  serializeProgram,
  builderCompatible,
  renameMode,
} from '../dist/server/src/scripting/language/serializer.js';
import { actionItems, actionTargets } from '../dist/server/src/scripting/language/options.js';
import { behaviorPresets } from '../dist/shared/src/behaviorPresets.js';
import { World } from '../dist/server/src/world.mjs';
const behavior = (p) => ({
  modes: p.modes,
  rules: p.rules.map(({ condition, action }) => ({ condition, action })),
});
const scripts = [
  'WHEN health < 30\n USE bandage',
  'WHEN distance weakest zombie 8 <= 5\n ATTACK weakest zombie 1',
  'WHEN count zombie 6 >= 3 AND stamina >= 20\n SPRINT MOVE_AWAY nearest zombie',
  'WHEN hunger > 70 AND hasItem food\n EAT food\nOTHERWISE\n EXPLORE',
  'WHEN health < 30 OR stamina < 20\n WAIT',
  'MODE scavenging\nMODE fleeing\nWHEN count zombie 6 >= 3\n SET_MODE fleeing\nWHEN mode == fleeing\n MOVE_AWAY zombie\nOTHERWISE\n EXPLORE',
  'WHEN NOT remembered home\n REMEMBER position AS home\nWHEN visible container\n REMEMBER nearest container 8 AS target\nWHEN remembered target\n PATROL target\nOTHERWISE\n RETURN home',
  'WHEN itemCount water < 2 AND NOT equipped weapon\n FIND water\nWHEN inventorySpace AND itemsOnFloor\n PICK_UP items\nWHEN inventoryFull\n DROP food\nOTHERWISE\n LOOK floor food',
  'WHEN visible door\n OPEN door\nWHEN distance nearest car <= 1\n SEARCH car\nOTHERWISE\n MOVE east',
];
for (const script of scripts)
  test('builder round trip: ' + script.split('\n')[0], () => {
    const p = parse(script);
    assert.equal(builderCompatible(p), true);
    const text = serializeProgram(p);
    assert.equal(serializeProgram(parse(text)), text);
    assert.deepEqual(behavior(parse(text)), behavior(p));
  });
test('visual rules serialize into the same executable language', () => {
  const p = {
    modes: ['scavenging', 'fleeing'],
    rules: [
      {
        condition: { type: 'stat', stat: 'health', operator: '<', value: 30 },
        action: { type: 'item', verb: 'USE', itemType: 'bandage' },
      },
      {
        condition: {
          type: 'distance',
          target: { type: 'zombie', selector: 'nearest' },
          operator: '<=',
          value: 5,
        },
        action: {
          type: 'targeted',
          verb: 'ATTACK',
          target: { type: 'zombie', selector: 'weakest' },
        },
      },
      {
        condition: {
          type: 'count',
          target: { type: 'zombie', selector: 'nearest', range: 6 },
          operator: '>=',
          value: 3,
        },
        action: { type: 'setMode', mode: 'fleeing' },
      },
      {
        condition: { type: 'remembered', slot: 'home' },
        action: { type: 'remember', slot: 'target', target: 'position' },
      },
      { condition: { type: 'always' }, action: { type: 'explore' } },
    ],
  };
  assert.deepEqual(behavior(parse(serializeProgram(p))), p);
});
test('all presets parse, round trip, queue and deploy through the real world pipeline', () => {
  for (const preset of behaviorPresets) {
    const p = parse(preset.script);
    assert.equal(builderCompatible(p), true);
    assert.deepEqual(behavior(parse(serializeProgram(p))), behavior(p));
    const world = new World();
    world.inject('owner', 'survivor', preset.name, preset.script);
    for (let i = 0; i < 10 && !world.state.survivors.length; i++) world.advance();
    const survivor = world.state.survivors[0];
    assert.ok(survivor);
    world.deploy(survivor.id, 'owner', preset.script, 'OTHERWISE\n WAIT');
    assert.equal(survivor.program, preset.script);
  }
});
test('mode renames update references; default mode and invalid references remain validated', () => {
  const p = parse(scripts[5]);
  const renamed = renameMode(p, 'fleeing', 'retreat');
  assert.deepEqual(renamed.modes, ['scavenging', 'retreat']);
  assert.equal(renamed.rules[0].action.mode, 'retreat');
  assert.equal(renamed.rules[1].condition.value, 'retreat');
  assert.doesNotThrow(() => parse(serializeProgram(renamed)));
  assert.throws(() => renameMode(p, 'fleeing', 'scavenging'));
  assert.throws(() => renameMode(p, 'fleeing', 'Bad name'));
  assert.throws(() => parse(serializeProgram({ ...p, modes: ['scavenging'] })), /Undeclared mode/);
});
test('unsupported scripts are refused without changing their contents', () => {
  for (const script of [
    'WHEN health < 30 OR stamina < 20 AND hasItem food\n WAIT',
    'OTHERWISE\n WAIT\nWHEN health < 30\n EXPLORE',
    'OTHERWISE\n WAIT\nOTHERWISE\n EXPLORE',
  ]) {
    const p = parse(script),
      before = structuredClone(p);
    assert.equal(builderCompatible(p), false);
    assert.deepEqual(p, before);
    assert.deepEqual(behavior(parse(serializeProgram(p))), behavior(p));
  }
  assert.throws(
    () =>
      serializeProgram({
        modes: [],
        rules: [
          {
            condition: {
              type: 'and',
              conditions: [
                { type: 'stat', stat: 'health', operator: '<', value: 30 },
                { type: 'or', conditions: [] },
              ],
            },
            action: { type: 'wait' },
          },
        ],
      }),
    /parentheses/,
  );
});
test('every offered item and target combination passes the canonical parser', () => {
  for (const verb of ['EAT', 'USE', 'EQUIP', 'DROP', 'PICK_UP'])
    for (const item of actionItems(verb))
      assert.doesNotThrow(() => parse(`OTHERWISE\n ${verb} ${item}`));
  for (const verb of [
    'ATTACK',
    'SHOOT',
    'SEARCH',
    'FIND',
    'OPEN',
    'FOLLOW',
    'MOVE_TO',
    'MOVE_AWAY',
    'RETURN',
    'PATROL',
  ])
    for (const target of actionTargets(verb))
      assert.doesNotThrow(() => parse(`OTHERWISE\n ${verb} nearest ${target}`));
  assert.deepEqual(actionTargets('ATTACK'), ['zombie']);
  assert.deepEqual(actionItems('USE'), ['bandage', 'water']);
});

test('priority reorder preserves complete rule data and never moves the fallback', async () => {
  const { reorderRules } = await import('../dist/shared/src/behaviorEditing.js');
  const program = parse(scripts[5]),
    original = structuredClone(program);
  const reordered = reorderRules(program.rules, 0, 1);
  assert.equal(reordered[1], program.rules[0]);
  assert.equal(reordered[0], program.rules[1]);
  assert.deepEqual(program, original);
  assert.deepEqual(
    behavior(parse(serializeProgram({ ...program, rules: reordered }))).rules,
    behavior({ ...program, rules: reordered }).rules,
  );
  for (const [from, to] of [
    [0, 2],
    [2, 0],
    [-1, 0],
    [0, 99],
    [0, 0],
  ])
    assert.equal(reorderRules(program.rules, from, to), program.rules);
});
