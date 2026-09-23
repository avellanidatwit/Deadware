import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { hasLineOfSight } from "../dist/world/perception.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("nearbydoor opens an adjacent door, allowing movement and sight without repeated matches", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 2, 2);
  grid.addEntity(survivor);
  grid.getCell(3, 2).tileType = "door";
  const program = parseSurvivorScript("WHEN nearbydoor\n OPEN door\nOTHERWISE\n WAIT");
  const context = { grid, survivor, zombies: [] };
  assert.equal(grid.moveEntity(survivor, 3, 2), false);
  assert.equal(hasLineOfSight(grid, survivor, { x: 4, y: 2 }), false);
  assert.equal(runSurvivorProgram(program, context).type, "openDoor");
  assert.equal(survivor.openDoor(grid), true);
  assert.deepEqual([survivor.x, survivor.y], [2, 2]);
  assert.equal(hasLineOfSight(grid, survivor, { x: 4, y: 2 }), true);
  assert.equal(runSurvivorProgram(program, context).type, "wait");
  assert.equal(survivor.openDoor(grid), false);
  assert.equal(grid.moveEntity(survivor, 3, 2), true);
});

test("doors must be cardinally adjacent; dead survivors and zombie scripts cannot open doors", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 2, 2);
  grid.getCell(3, 3).tileType = "door";
  grid.getCell(4, 2).tileType = "door";
  assert.equal(survivor.openDoor(grid), false);
  grid.getCell(3, 2).tileType = "door";
  survivor.health = 0;
  assert.equal(survivor.openDoor(grid), false);
  assert.throws(() => parseSurvivorScript("WHEN nearbydoor\n WAIT", "zombie"));
  assert.throws(() => parseSurvivorScript("OTHERWISE\n OPEN door", "zombie"));
  assert.throws(() => parseSurvivorScript("OTHERWISE\n OPEN cabinet"));
});
