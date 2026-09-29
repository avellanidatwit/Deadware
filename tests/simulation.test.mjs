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
