import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { ItemContainer } from "../dist/entities/container.js";
import { createItem, randomizeItems } from "../dist/entities/item.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("adjacent search transfers loot once onto survivor floor, preserving existing items", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 2, 2);
  const food = createItem("food"), weapon = createItem("weapon"), existing = createItem("food");
  const desk = new ItemContainer("desk", 3, 2, "Desk", [food, weapon]);
  grid.addEntity(survivor); grid.addEntity(desk);
  grid.getCell(2, 2).items.push(existing);
  assert.equal(grid.isWalkable(3, 2), false);
  assert.deepEqual(survivor.searchContainer(grid, desk), [food, weapon]);
  assert.deepEqual(desk.contents, []);
  assert.deepEqual(grid.getCell(3, 2).items, []);
  assert.deepEqual(survivor.lookAtFloor(grid), [existing, food, weapon]);
  assert.deepEqual(survivor.lookAtFloor(grid, "weapon"), [weapon]);
  assert.equal(survivor.lookAtFloor(grid).find(item => item.type === "food").id, existing.id);
  survivor.lookAtFloor(grid)[0].name = "Changed";
  assert.equal(existing.name, "Canned food");
  assert.deepEqual(survivor.searchContainer(grid, desk), []);
  assert.equal(survivor.lookAtFloor(grid).length, 3);
});

test("out of reach, diagonal, unregistered containers, and dead survivors cannot transfer loot", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 2, 2);
  const desk = new ItemContainer("d", 3, 3, "Desk", [createItem("food")]);
  grid.addEntity(desk);
  assert.equal(survivor.searchContainer(grid, desk), null);
  survivor.x = 0;
  assert.equal(survivor.searchContainer(grid, desk), null);
  survivor.x = 3;
  survivor.health = 0;
  assert.equal(survivor.searchContainer(grid, desk), null);
  survivor.health = 100;
  grid.removeEntity(desk.id);
  assert.equal(survivor.searchContainer(grid, desk), null);
  assert.equal(desk.contents.length, 1);
});

test("random loot supports catalog types and unique IDs", () => {
  const rolls = [0.1, 0.3];
  const items = randomizeItems(2, () => rolls.shift());
  assert.deepEqual(items.map(item => item.type), ["food", "weapon"]);
  assert.notEqual(items[0].id, items[1].id);
  assert.deepEqual(randomizeItems(0), []);
  assert.throws(() => randomizeItems(-1));
});

test("script searches nonempty containers then lists the floor", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 2, 2);
  const desk = new ItemContainer("d", 3, 2, "Desk", [createItem("food")]);
  grid.addEntity(desk);
  const program = parseSurvivorScript("WHEN containerNearby\n SEARCH container\nOTHERWISE\n LOOK floor food");
  const context = { grid, survivor, zombies: [] };
  assert.equal(runSurvivorProgram(program, context).type, "searchContainer");
  survivor.searchContainer(grid, desk);
  assert.deepEqual(runSurvivorProgram(program, context), { type: "lookFloor", itemType: "food" });
  assert.throws(() => parseSurvivorScript("OTHERWISE\n SEARCH container", "zombie"));
  assert.doesNotThrow(() => parseSurvivorScript("OTHERWISE\n LOOK floor ammo"));
  assert.throws(() => parseSurvivorScript("OTHERWISE\n LOOK floor unknown"));
});
