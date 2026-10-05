import { survivorCode } from "../dist/server/src/data/survivorProgram.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/server/src/world/grid.js";
import { Survivor } from "../dist/server/src/entities/survivor.js";
import { Zombie } from "../dist/server/src/entities/zombie.js";
import { ItemContainer } from "../dist/server/src/entities/container.js";
import { createItem } from "../dist/server/src/entities/item.js";
import { parseSurvivorScript as parse, runSurvivorProgram as select, runSurvivorTick, executeSurvivorAction } from "../dist/server/src/scripting/survivorScript.js";
import { runZombieTick } from "../dist/server/src/scripting/zombieScript.js";
import { resolveTargets } from "../dist/server/src/scripting/runtime/targetResolver.js";
import { World, encode } from "../dist/server/src/world.mjs";

function setup() {
  const grid = new Grid(20, 12), survivor = new Survivor("s", 2, 2);
  grid.addEntity(survivor);
  return { grid, survivor, survivors: [survivor], zombies: [], canMove: true };
}
function act(context, source) { return executeSurvivorAction(select(parse(`OTHERWISE\n ${source}`), context), context); }
function matches(context, condition) { return select(parse(`WHEN ${condition}\n LOOK floor\nOTHERWISE\n WAIT`), context).type === "lookFloor"; }
function zombie(context, id, x, y, health = 100) {
  const z = new Zombie(id, x, y); z.health = health;
  context.zombies.push(z); context.grid.addEntity(z); return z;
}

test("Boolean precedence, recursive validation, and precise syntax errors", () => {
  const c = setup(); c.survivor.health = 20;
  assert.equal(matches(c, "health < 30 OR hungry AND hasItem food"), true);
  assert.equal(matches(c, "NOT health < 30 OR hungry"), false);
  assert.equal(matches(c, "NOT hungry AND NOT thirsty"), true);
  for (const expression of ["hungry OR", "NOT", "hungry AND OR thirsty", "(hungry)", "health > 9999999999999999999999", "zombieCount 3 > 9999999999999999999999"]) {
    assert.throws(() => parse(`# comment\nWHEN ${expression}\n WAIT`), /Line 2/);
  }
  for (const command of ["WAIT extra", "MOVE north extra", "EXPLORE extra", "MOVE_TO nearest food -1", "ATTACK weakest container", "EAT weapon", "USE gun", "EQUIP food", "SET anything = 1", "LOOP", "RELOAD extra"]) {
    assert.throws(() => parse(`OTHERWISE\n ${command}`), /Line 2/);
  }
  assert.throws(() => parse("WHEN health > 0 OR NOT inventoryFull\n WAIT", "zombie"), /survivor script/);
  assert.throws(() => parse("OTHERWISE\n USE bandage", "zombie"), /survivor script/);
});

test("selectors are stable, ignore dead targets, and obey sight and range", () => {
  const c = setup();
  const near = zombie(c, "near", 3, 2, 80), weak = zombie(c, "weak", 5, 2, 10);
  zombie(c, "dead", 2, 3, 0); zombie(c, "outside", 11, 2, 1);
  assert.equal(resolveTargets({ type: "zombie", selector: "nearest" }, c)[0], near);
  assert.equal(resolveTargets({ type: "zombie", selector: "farthest" }, c)[0], weak);
  assert.equal(resolveTargets({ type: "zombie", selector: "weakest" }, c)[0], weak);
  assert.equal(resolveTargets({ type: "zombie", selector: "strongest" }, c)[0], near);
  assert.equal(matches(c, "zombieCount 100 == 2"), true);
  assert.equal(matches(c, "distance nearest zombie == 1"), true);
  c.grid.getCell(4, 2).tileType = "buildingWall";
  assert.equal(matches(c, "zombieCount 8 == 1"), true);
  assert.equal(resolveTargets({ type: "zombie", selector: "weakest" }, c)[0], near);
  act(c, "ATTACK weakest zombie");
  assert.equal(near.health, 55); assert.equal(weak.health, 10);
});

test("headless simulation scavenges, eats, and continues for hundreds of ticks", () => {
  const c = setup(); c.survivor.hunger = 80;
  const box = new ItemContainer("box", 5, 2, "Box", [createItem("food"), createItem("water")]);
  c.grid.addEntity(box);
  const program = parse(`WHEN hungry AND hasItem food
 EAT food
WHEN thirsty AND hasItem water
 USE water
WHEN itemsOnFloor AND inventorySpace
 PICK_UP items
WHEN containerNearby
 SEARCH nearest container
WHEN containerNearby 8
 MOVE_TO nearest container
OTHERWISE
 WAIT`);
  for (let tick = 0; tick < 250; tick++) runSurvivorTick(program, { ...c, tick, canMove: tick % 2 === 1 });
  assert.equal(box.contents.length, 0);
  assert.equal(c.survivor.isAlive(), true);
  assert.ok(c.survivor.hunger < 100);
  assert.equal(c.survivor.inventory.some(item => item.type === "food"), false);
  assert.ok(c.grid.getCell(c.survivor.x, c.survivor.y).entities.includes(c.survivor));

  // The actual starter script must find a door and physically enter a small room,
  // even when opening the door reveals every floor tile from outside.
  const buildingGrid = new Grid(18, 18);
  buildingGrid.createBuilding(4, 3, 5, 5);
  const explorer = new Survivor("explorer", 6, 10);
  buildingGrid.addEntity(explorer);
  const starter = parse(survivorCode);
  const visitedInterior = new Set();
  for (let tick = 0; tick < 100; tick++) {
    runSurvivorTick(starter, { grid: buildingGrid, survivor: explorer, survivors: [explorer], zombies: [], tick, canMove: tick % 2 === 1 });
    if (buildingGrid.getCell(explorer.x, explorer.y).tileType === "buildingFloor") visitedInterior.add(`${explorer.x},${explorer.y}`);
  }
  assert.equal(buildingGrid.getCell(6, 7).tileType, "openDoor");
  assert.equal(visitedInterior.size, 9, "explore walks through the whole accessible interior");

});

test("survivor history records decisions and persists through recovery", () => {
  const c = setup();
  c.survivor.program = "OTHERWISE\n WAIT";
  runSurvivorTick(parse("OTHERWISE\n WAIT"), { ...c, tick: 7 });
  assert.deepEqual(c.survivor.history.at(-1), { tick: 7, message: "WAIT" });
  for (let tick = 8; tick < 120; tick++) c.survivor.recordEvent(tick, `Event ${tick}`);
  assert.equal(c.survivor.history.length, 100);
  assert.equal(c.survivor.history[0].tick, 20);
  const restored = new World(encode({ grid: c.grid, survivors: [c.survivor], zombies: [], tick: 120, queue: [], meta: { s: { owner: "owner", name: "Scout", version: 1, zombieScript: "OTHERWISE\n WAIT" } } }));
  assert.deepEqual(restored.state.survivors[0].history, c.survivor.history);
});

test("default zombie attacks for 20 per tick and removes a survivor after five hits", () => {
  const grid = new Grid(10, 10), zombie = new Zombie("z", 2, 2), survivor = new Survivor("s", 3, 2);
  grid.addEntity(zombie); grid.addEntity(survivor);
  const program = parse(zombie.program, "zombie");
  for (let i = 1; i <= 5; i++) {
    runZombieTick(zombie, program, grid, [survivor], [zombie]);
    assert.equal(survivor.health, 100 - i * 20);
    assert.deepEqual([zombie.x, zombie.y], [2, 2]);
  }
  assert.equal(grid.getCell(3, 2).entities.includes(survivor), false);
});

test('fleeing respects movement cooldown, turns at edges and prioritizes safety', t => {
  t.mock.method(Math, 'random', () => 0);
  const context = setup();
  const { grid, survivor } = context;
  grid.moveEntity(survivor, 10, 10);
  const enemy = zombie(context, 'pursuer', 13, 10);
  const program = parse('WHEN zombieNearby 6\n MOVE_AWAY zombie\nOTHERWISE\n WAIT');
  let tick = 0;
  const moveUpdate = () => {
    const before = [survivor.x, survivor.y];
    runSurvivorTick(program, { ...context, tick: tick++, canMove: false });
    assert.deepEqual([survivor.x, survivor.y], before);
    runSurvivorTick(program, { ...context, tick: tick++, canMove: true });
  };
  for (let i = 0; i < 10; i++) { grid.moveEntity(enemy, 13, survivor.y); moveUpdate(); }
  assert.deepEqual([survivor.x, survivor.y], [10, 0]);
  grid.moveEntity(enemy, 13, 0); moveUpdate();
  assert.deepEqual([survivor.x, survivor.y], [9, 0]);
  moveUpdate(); assert.deepEqual([survivor.x, survivor.y], [8, 0]);
  grid.moveEntity(enemy, 7, 0); grid.getCell(8, 1).tileType = 'buildingWall'; moveUpdate();
  assert.deepEqual([survivor.x, survivor.y], [9, 0]);
  for (const [x, y] of [[8, 0], [10, 0], [9, 1]]) grid.getCell(x, y).tileType = 'buildingWall';
  moveUpdate(); assert.deepEqual([survivor.x, survivor.y], [9, 0]);
});


test("history preserves the selected action source and distinguishes implicit waits", () => {
  const c = setup();
  for (const command of ["MOVE east", "MOVE_TO nearest container 8", "LOOK floor food", "SET home = position", "REMEMBER nearest container AS target", "USE water"]) {
    const program = parse(`WHEN health < 1\n WAIT\nOTHERWISE\n    ${command}`);
    runSurvivorTick(program, { ...c, tick: 2 });
    assert.equal(c.survivor.history.at(-1).message, command);
  }
  const movement = parse("OTHERWISE\n MOVE west");
  runSurvivorTick(movement, { ...c, tick: 3, canMove: false });
  assert.equal(c.survivor.history.at(-1).message, "WAIT (no eligible rule matched)");
});


test("saved programs edit and delete only owned entries and survive recovery", () => {
  const world = new World(), source = 'OTHERWISE\n WAIT';
  const pair = world.saveScript('alice', 'Original', source, source);
  const other = world.saveScript('bob', 'Other', source, source);
  assert.throws(() => world.updateScript('bob', pair.id, 'Bad', source, source), error => error.status === 404);
  assert.throws(() => world.deleteScript('bob', pair.id), error => error.status === 404);
  assert.throws(() => world.updateScript('alice', pair.id, 'Bad', source, 'INVALID'));
  assert.equal(pair.name, 'Original');
  world.updateScript('alice', pair.id, 'Edited', 'OTHERWISE\n MOVE east', source);
  const restored = new World(encode(world.state));
  assert.equal(restored.scripts('alice')[0].script, 'OTHERWISE\n MOVE east');
  restored.deleteScript('alice', pair.id);
  const deleted = new World(encode(restored.state));
  assert.deepEqual(deleted.scripts('alice'), []);
  assert.equal(deleted.scripts('bob')[0].id, other.id);
  assert.throws(() => deleted.deleteScript('alice', pair.id), error => error.status === 404);
});


test("survivor limit includes queued spawns, frees slots on death and excludes zombies", () => {
  const world = new World(), script = 'OTHERWISE\n WAIT';
  for (let i = 0; i < 10; i++) world.inject('alice', 'survivor', `Scout ${i}`, script, script);
  assert.throws(() => world.inject('alice', 'survivor', 'Extra', script), /10 active survivors/);
  assert.doesNotThrow(() => world.inject('bob', 'survivor', 'Bob', script, script));
  for (let i = 0; i < 66; i++) world.advance();
  assert.throws(() => world.inject('alice', 'survivor', 'Extra', script), /10 active survivors/);
  world.state.survivors.find(entity => world.state.meta[entity.id].owner === 'alice').health = 0;
  assert.doesNotThrow(() => world.inject('alice', 'survivor', 'Replacement', script, script));
  assert.throws(() => world.inject('alice', 'survivor', 'Extra', script), /10 active survivors/);
  for (let round = 0; round < 2; round++) {
    for (const entity of world.state.survivors) if (world.state.meta[entity.id].owner === 'alice') entity.health = 0;
    world.raiseDead();
    while (world.state.queue.filter(entry => entry.owner === 'alice').length < 10) world.inject('alice', 'survivor', 'Replacement', script, script);
    for (let i = 0; i < 60; i++) world.advance();
  }
  assert.equal(world.state.zombies.length, 20);
  const recovered = new World(encode(world.state));
  assert.throws(() => recovered.inject('alice', 'survivor', 'Extra', script), /10 active survivors/);
  assert.equal(recovered.state.zombies.length, 20);
});


test("one carried weapon, armor combat stats, and conditional full-magazine reloads", () => {
  const c = setup(), floor = c.grid.getCell(2,2);
  floor.items.push(createItem('gun'), createItem('weapon'), createItem('gun'), createItem('ammo'), createItem('ammo'), createItem('armor'));
  c.survivor.pickUpItems(c.grid);
  assert.equal(c.survivor.inventory.filter(item => ['weapon','gun'].includes(item.type)).length,1);
  assert.equal(floor.items.length,2);
  assert.equal(c.survivor.useItem('ammo'),false);
  assert.equal(c.survivor.inventory.filter(item=>item.type==='ammo').length,2);
  assert.equal(c.survivor.equip('gun'),true);
  c.survivor.ammo = 2;
  act(c,'RELOAD'); assert.equal(c.survivor.ammo,6);
  assert.equal(c.survivor.inventory.filter(item=>item.type==='ammo').length,1);
  act(c,'RELOAD'); assert.equal(c.survivor.inventory.filter(item=>item.type==='ammo').length,1);
  assert.equal(c.survivor.equip('armor'),true);
  assert.equal(matches(c,'equipped armor'),true);
  assert.equal(c.survivor.combatStats.damage,40);
  assert.equal(c.survivor.combatStats.meleeDamage,25);
  assert.equal(c.survivor.combatStats.armor,5);
  c.survivor.takeDamage(20); assert.equal(c.survivor.health,85);
  c.survivor.takeDamage(3); assert.equal(c.survivor.health,85);
  c.survivor.hunger=100; c.survivor.updateNeeds(); assert.equal(c.survivor.health,84);
  const target = zombie(c,'target',3,2);
  act(c,'SHOOT nearest zombie'); assert.equal(target.health,60); assert.equal(c.survivor.ammo,5);
  c.survivor.dropItem(c.grid,'gun'); assert.equal(c.survivor.ammo,0);
  assert.equal(c.survivor.useItem('ammo'),false);
  c.survivor.pickUpItems(c.grid,'weapon'); act(c,'EQUIP weapon');
  assert.equal(c.survivor.combatStats.meleeDamage,40);
  act(c,'ATTACK zombie'); assert.equal(target.health,20);
  c.survivor.dropItem(c.grid,'armor'); assert.equal(c.survivor.combatStats.armor,0);
});

test("recovery preserves equipped weapon and returns extra weapons to the floor", () => {
  const c = setup(), gun=createItem('gun'), melee=createItem('weapon');
  c.survivor.carriedItems=[melee,gun]; c.survivor.equippedItemId=gun.id; c.survivor.ammo=4;
  c.survivor.normalizeEquipment(c.grid);
  assert.equal(c.survivor.inventory.length,1); assert.equal(c.survivor.equippedItem.id,gun.id);
  assert.equal(c.grid.getCell(2,2).items[0].id,melee.id); assert.equal(c.survivor.ammo,4);
});


test("combined zombie view merges only living owned zombie sight", () => {
  const world = new World(); world.state.grid = new Grid(20,12);
  for (const [id,x,y,owner,health] of [['a',2,2,'alice',100],['b',16,2,'alice',100],['foreign',10,10,'bob',100],['dead',2,10,'alice',0]]) {
    const actor = new Zombie(id,x,y); actor.health=health; actor.detectionRange=2;
    world.state.zombies.push(actor); world.state.grid.addEntity(actor);
    world.state.meta[id]={owner,name:id,version:1,bornTick:0};
  }
  const a=world.snapshot('alice','a'), b=world.snapshot('alice','b');
  const combined=world.snapshot('alice',undefined,id=>id,true);
  assert.equal(combined.observer,null);
  assert.deepEqual(combined.zombieObservers.map(z=>z.id),['a','b']);
  for(let i=0;i<combined.cells.length;i++) {
    assert.equal(combined.cells[i].visible,a.cells[i].visible || b.cells[i].visible);
    assert.equal(combined.cells[i].explored,combined.cells[i].visible);
    if(!combined.cells[i].visible) assert.deepEqual(combined.cells[i].entities,[]);
  }
  assert.equal(combined.cells.find(c=>c.x===10 && c.y===10).visible,false);
  assert.equal(combined.cells.find(c=>c.x===2 && c.y===10).visible,false);
  assert.equal(combined.zombieObservers.some(z=>'program' in z || 'inventory' in z),false);
  const empty=world.snapshot('nobody',undefined,id=>id,true);
  assert.deepEqual(empty.zombieObservers,[]); assert.equal(empty.cells.some(c=>c.visible),false);
});


test("blocked weapon pickups fall through while eligible floor loot is still collected", () => {
  const c = setup(), floor = c.grid.getCell(2,2);
  floor.items.push(createItem('weapon')); c.survivor.pickUpItems(c.grid); c.survivor.equip('weapon');
  floor.items.push(createItem('weapon'));
  const program = parse('WHEN itemsOnFloor AND inventorySpace\n PICK_UP items\nOTHERWISE\n MOVE east');
  runSurvivorTick(program,c);
  assert.equal(c.survivor.x,3); assert.equal(floor.items.length,1);
  c.grid.moveEntity(c.survivor,2,2); floor.items.push(createItem('food'));
  runSurvivorTick(program,c);
  assert.equal(c.survivor.x,2); assert.equal(c.survivor.inventory.some(item=>item.type==='food'),true);
  assert.equal(floor.items.length,1);
  const typed = parse('WHEN itemsOnFloor\n PICK_UP weapon\nOTHERWISE\n WAIT');
  assert.equal(select(typed,c).type,'wait');
  c.survivor.dropItem(c.grid,'weapon');
  assert.equal(select(typed,c).type,'item');
});
