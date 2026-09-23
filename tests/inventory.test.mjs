import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { ItemContainer } from "../dist/entities/container.js";
import { randomizeItems } from "../dist/entities/item.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("looting script approaches nearest container, empties it, and picks up only five items", () => {
  const grid = new Grid(15, 15), survivor = new Survivor("s", 1, 1);
  const desk = new ItemContainer("desk", 4, 1, "Desk", randomizeItems(7));
  const cabinet = new ItemContainer("cabinet", 8, 1, "Cabinet", randomizeItems(2));
  for (const entity of [survivor, desk, cabinet]) grid.addEntity(entity);
  const program = parseSurvivorScript(`WHEN inventoryFull
 WAIT
WHEN itemsOnFloor
 PICK_UP items
WHEN containerNearby
 SEARCH container
OTHERWISE
 MOVE_TO container 10`);
  const actions = [];
  for (let tick = 0; tick < 6; tick++) {
    const action = runSurvivorProgram(program, { grid, survivor, zombies: [] });
    actions.push(action.type);
    if (action.type === "moveToContainer") survivor.moveToContainer(grid, action.range);
    if (action.type === "searchContainer") survivor.searchContainer(grid, desk);
    if (action.type === "pickUpItems") survivor.pickUpItems(grid);
  }
  assert.deepEqual(actions, ["moveToContainer", "moveToContainer", "searchContainer", "pickUpItems", "wait", "wait"]);
  assert.equal(survivor.inventory.length, 5);
  assert.equal(desk.contents.length, 0);
  assert.equal(cabinet.contents.length, 2);
  assert.equal(survivor.lookAtFloor(grid).length, 2);
  assert.deepEqual(survivor.pickUpItems(grid), []);
  assert.equal(new Set([...survivor.inventory, ...survivor.lookAtFloor(grid)].map(item => item.id)).size, 7);
  survivor.inventory[0].name = "Changed";
  assert.notEqual(survivor.inventory[0].name, "Changed");
});

test("container approach respects sight, range, empty containers, and dead survivors", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 1, 1);
  const desk = new ItemContainer("d", 4, 1, "Desk", randomizeItems(1));
  grid.addEntity(survivor); grid.addEntity(desk);
  assert.equal(survivor.moveToContainer(grid, 2), false);
  grid.getCell(2, 1).tileType = "buildingWall";
  assert.equal(survivor.moveToContainer(grid, 10), false);
  grid.getCell(2, 1).tileType = "empty";
  desk.empty();
  assert.equal(survivor.moveToContainer(grid, 10), false);
  survivor.health = 0;
  grid.getCell(1, 1).items.push(...randomizeItems(2));
  assert.deepEqual(survivor.pickUpItems(grid), []);
  assert.throws(() => parseSurvivorScript("OTHERWISE\n PICK_UP items", "zombie"));
  assert.throws(() => parseSurvivorScript("OTHERWISE\n MOVE_TO container -1"));
});
