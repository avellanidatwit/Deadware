import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";

test("vision has an eight-tile range, remembers terrain, and respects doors", () => {
  const grid = new Grid(25, 25), survivor = new Survivor("s", 10, 10);
  grid.addEntity(survivor);
  survivor.updateVision(grid);
  assert.equal(survivor.canSee(18, 10), true);
  assert.equal(survivor.canSee(19, 10), false);
  grid.moveEntity(survivor, 20, 20);
  survivor.updateVision(grid);
  assert.equal(survivor.canSee(10, 10), false);
  assert.equal(survivor.hasExplored(10, 10), true);
  grid.getCell(21, 20).tileType = "door";
  survivor.updateVision(grid);
  assert.equal(survivor.canSee(21, 20), true);
  assert.equal(survivor.canSee(22, 20), false);
  survivor.openDoor(grid);
  survivor.updateVision(grid);
  assert.equal(survivor.canSee(22, 20), true);
});

test("exploration reveals an open map and stops instead of wandering forever", () => {
  const grid = new Grid(25, 25), survivor = new Survivor("s", 12, 12);
  grid.addEntity(survivor);
  let stopped = false;
  for (let tick = 0; tick < 1000; tick++) {
    const before = { x: survivor.x, y: survivor.y };
    if (!survivor.explore(grid)) { stopped = true; break; }
    assert.equal(Math.abs(before.x - survivor.x) + Math.abs(before.y - survivor.y), 1);
  }
  assert.equal(stopped, true);
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) assert.equal(survivor.hasExplored(x, y), true);
});

test("enclosed and dead survivors do not explore through barriers", () => {
  const grid = new Grid(20, 20), survivor = new Survivor("s", 5, 5);
  grid.addEntity(survivor);
  for (const [x, y] of [[4,5], [6,5], [5,4], [5,6]]) grid.getCell(x,y).tileType = "buildingWall";
  assert.equal(survivor.explore(grid), false);
  survivor.health = 0;
  assert.equal(survivor.explore(grid), false);
  assert.equal(survivor.canSee(5, 5), false);
});
