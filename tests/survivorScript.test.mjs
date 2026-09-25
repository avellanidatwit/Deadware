import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { ItemContainer } from "../dist/entities/container.js";
import { Car } from "../dist/entities/car.js";
import { createItem } from "../dist/entities/item.js";
import { parseSurvivorScript as parse, runSurvivorProgram as select, runSurvivorTick, executeSurvivorAction, progressionStages } from "../dist/scripting/survivorScript.js";
import { resolveTargets } from "../dist/scripting/runtime/targetResolver.js";

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

test("typed inventory actions conserve items and apply needs, healing, and equipment", () => {
  const c = setup(), s = c.survivor, floor = c.grid.getCell(2, 2).items;
  floor.push(...["weapon", "food", "bandage", "water"].map(createItem));
  act(c, "PICK_UP food");
  assert.deepEqual(s.inventory.map(item => item.type), ["food"]);
  assert.equal(floor.length, 3);
  s.hunger = 90; act(c, "EAT food"); assert.equal(s.hunger, 50);
  act(c, "PICK_UP items");
  s.health = 90; act(c, "USE bandage"); assert.equal(s.health, 100);
  s.thirst = 80; act(c, "USE water"); assert.equal(s.thirst, 30);
  floor.push(createItem("bandage"));
  assert.equal(act(c, "LOOK floor bandage"), "Bandage");
  floor.pop();
  act(c, "EQUIP weapon"); assert.equal(matches(c, "equipped weapon"), true);
  const itemId = s.inventory[0].id;
  act(c, "DROP weapon"); assert.equal(s.inventory.length, 0);
  assert.equal(s.equippedItem, undefined); assert.equal(floor[0].id, itemId);
  s.health = 0; act(c, "PICK_UP items"); assert.equal(s.inventory.length, 0);
});

test("ranged combat consumes loaded ammo, respects walls, and removes kills", () => {
  const c = setup(); c.grid.getCell(2, 2).items.push(createItem("gun"), createItem("ammo"));
  const z = zombie(c, "z", 5, 2, 40);
  act(c, "PICK_UP items"); act(c, "EQUIP gun");
  act(c, "SHOOT zombie"); assert.equal(z.health, 40);
  act(c, "RELOAD"); assert.equal(c.survivor.ammo, 6);
  c.grid.getCell(4, 2).tileType = "door";
  act(c, "SHOOT zombie"); assert.equal(c.survivor.ammo, 6);
  c.grid.getCell(4, 2).tileType = "openDoor";
  act(c, "SHOOT nearest zombie"); assert.equal(z.health, 0); assert.equal(c.survivor.ammo, 5);
  assert.equal(c.grid.getCell(5, 2).entities.includes(z), false);
});

test("memory stores last-known positions without tracking hidden entities", () => {
  const c = setup(), z = zombie(c, "z", 5, 2);
  act(c, "REMEMBER nearest zombie AS target");
  assert.deepEqual(c.survivor.memory.target, { x: 5, y: 2 });
  assert.deepEqual(c.survivor.memory.lastZombie, { x: 5, y: 2 });
  c.grid.getCell(4, 2).tileType = "door";
  c.grid.moveEntity(z, 6, 2);
  act(c, "WAIT");
  assert.deepEqual(c.survivor.memory.lastZombie, { x: 5, y: 2 });
  assert.deepEqual(c.survivor.memory.target, { x: 5, y: 2 });
  act(c, "MOVE_TO target");
  assert.equal(Math.abs(c.survivor.x - 2) + Math.abs(c.survivor.y - 2), 1);
  assert.notEqual(c.grid.getCell(c.survivor.x, c.survivor.y).tileType, "door");
  act(c, "SET home = position"); assert.deepEqual(c.survivor.memory.home, { x: c.survivor.x, y: c.survivor.y });
  assert.equal(matches(c, "remembered target"), true);
  const other = new Survivor("other", 1, 1);
  assert.equal(other.memory.target, undefined);
});

test("follow, patrol, return, and cooldown operate through real movement", () => {
  const c = setup(), friend = new Survivor("friend", 5, 2);
  c.survivors.push(friend); c.grid.addEntity(friend);
  assert.equal(matches(c, "survivorCount 8 == 1"), true);
  const program = parse("WHEN survivorNearby 8\n FOLLOW nearest survivor\nOTHERWISE\n WAIT");
  assert.equal(select(program, { ...c, canMove: false }).type, "wait");
  act(c, "FOLLOW nearest survivor"); act(c, "FOLLOW nearest survivor");
  assert.equal(c.survivor.x, 4);
  act(c, "FOLLOW nearest survivor"); assert.equal(c.survivor.x, 4);
  act(c, "SET target = position");
  act(c, "RETURN home"); act(c, "RETURN home"); assert.equal(c.survivor.x, 2);
  for (let i = 0; i < 4; i++) act(c, "PATROL target");
  assert.equal(c.survivor.x, 2);
});

test("new sensing cannot see loot behind walls or inside containers", () => {
  const c = setup(), container = new ItemContainer("box", 3, 2, "Box", [createItem("food")]);
  c.grid.addEntity(container);
  assert.equal(matches(c, "itemNearby food 8"), false);
  act(c, "SEARCH nearest container");
  assert.equal(matches(c, "itemNearby food 0"), true);
  c.grid.getCell(6, 2).items.push(createItem("bandage"));
  c.grid.getCell(5, 2).tileType = "buildingWall";
  assert.equal(matches(c, "itemNearby bandage 8"), false);
  assert.equal(matches(c, "buildingNearby"), true);
  const car = new Car("car", 2, 4, []); c.grid.addEntity(car);
  assert.equal(matches(c, "carNearby 2"), true);
  c.grid.getCell(2, 3).tileType = "door";
  assert.equal(matches(c, "doorNearby"), true);
  act(c, "OPEN nearest door"); assert.equal(c.grid.getCell(2, 3).tileType, "openDoor");
});

test("needs update exactly once per tick; exhaustion and starvation remain bounded", () => {
  const c = setup(); c.survivor.stamina = 0;
  const program = parse("OTHERWISE\n MOVE east");
  runSurvivorTick(program, c);
  assert.equal(c.survivor.x, 2); assert.equal(c.survivor.stamina, 3);
  assert.equal(c.survivor.thirst, 0.25);
  runSurvivorTick(program, c); assert.equal(c.survivor.x, 3);
  c.survivor.thirst = 100; c.survivor.health = 1;
  runSurvivorTick(program, c);
  assert.equal(c.survivor.health, 0);
  assert.equal(c.grid.getCell(3, 2).entities.includes(c.survivor), false);
  runSurvivorTick(program, c); assert.equal(c.survivor.thirst, 100);
});

test("program limits and optional progression validate before installation", () => {
  const source = "WHEN zombieCount 5 >= 3\n MOVE_TO nearest container\nOTHERWISE\n WAIT";
  assert.equal(parse(source).memoryCost, 6);
  assert.throws(() => parse(source, "survivor", { maxRules: 1 }), /rules/);
  assert.throws(() => parse(source, "survivor", { memoryBudget: 5 }), /Program Memory/);
  assert.doesNotThrow(() => parse(source, "survivor", { memoryBudget: 6 }));
  assert.throws(() => parse(source, "survivor", { unlockedCapabilities: progressionStages[0] }), /locked: targeting/);
  assert.doesNotThrow(() => parse(source, "survivor", { unlockedCapabilities: progressionStages[4] }));
  assert.throws(() => parse(source, "survivor", { maxRules: -1 }), /whole numbers/);
});

test("OR and NOT do not leak inactive detection ranges into zombie CHASE", () => {
  const grid = new Grid(20, 10), actor = new Zombie("z", 1, 1), survivor = new Survivor("s", 8, 1);
  const c = { grid, survivor: actor, survivors: [survivor], zombies: [actor] };
  const program = parse("WHEN survivorNearby 1 OR survivorNearby 10\n CHASE survivor", "zombie");
  assert.equal(select(program, c).range, 10);
  const negated = parse("WHEN NOT survivorNearby 1\n CHASE survivor", "zombie");
  assert.equal(select(negated, c).range, undefined);
});

test("item seeking respects movement cooldown and follows visible floor loot", () => {
  const c = setup(); c.grid.getCell(4, 2).items.push(createItem("food"));
  const program = parse("WHEN hungry AND NOT hasItem food\n SEARCH food\nOTHERWISE\n WAIT");
  c.survivor.hunger = 80;
  assert.equal(select(program, { ...c, canMove: false }).type, "wait");
  runSurvivorTick(program, c); assert.equal(c.survivor.x, 3);
  runSurvivorTick(program, c); assert.equal(c.survivor.x, 4);
  assert.equal(c.survivor.inventory.length, 0);
  act(c, "PICK_UP food"); assert.equal(c.survivor.inventory.length, 1);
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
});
