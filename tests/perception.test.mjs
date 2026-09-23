import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { hasLineOfSight, searchTargets, searchCells, searchEntities } from "../dist/world/perception.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("walls are visible but hide targets; doors transmit sight; custom blockers", () => {
  const grid = new Grid(10, 10), origin = { x: 1, y: 1 }, target = { x: 5, y: 1 };
  assert.equal(hasLineOfSight(grid, origin, target), true);
  grid.getCell(3, 1).tileType = "buildingWall";
  assert.equal(hasLineOfSight(grid, origin, target), false);
  assert.equal(hasLineOfSight(grid, origin, { x: 3, y: 1 }), true);
  assert.equal(hasLineOfSight(grid, origin, { x: 3, y: 1 }, { includeBlockingTarget: false }), false);
  grid.getCell(3, 1).tileType = "openDoor";
  assert.equal(hasLineOfSight(grid, origin, target), true);
  assert.equal(hasLineOfSight(grid, origin, target, { blocksSight: cell => cell.tileType === "openDoor" }), false);
});

test("corners, reversed rays, range metrics, zero, and invalid coordinates", () => {
  const grid = new Grid(10, 10), a = { x: 1, y: 1 }, b = { x: 3, y: 3 };
  assert.equal(hasLineOfSight(grid, a, b, { range: 3 }), false);
  assert.equal(hasLineOfSight(grid, a, b, { range: 3, metric: "euclidean" }), true);
  assert.equal(hasLineOfSight(grid, a, b, { range: 2, metric: "chebyshev" }), true);
  assert.equal(hasLineOfSight(grid, a, a, { range: 0 }), true);
  assert.equal(hasLineOfSight(grid, a, { x: -1, y: 1 }), false);
  assert.equal(hasLineOfSight(grid, a, { x: 1.5, y: 1 }), false);
  grid.getCell(2, 1).tileType = "buildingWall";
  assert.equal(hasLineOfSight(grid, a, b), false);
  assert.equal(hasLineOfSight(grid, b, a), false);
  // Check all directions and slopes for symmetry between transparent endpoints.
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (grid.getCell(x, y).tileType !== "buildingWall") {
      assert.equal(hasLineOfSight(grid, a, { x, y }), hasLineOfSight(grid, { x, y }, a));
    }
  }
});

test("generic item, entity, and building searches filter and sort visible results", () => {
  const grid = new Grid(10, 10), origin = { x: 1, y: 1 };
  const near = { x: 2, y: 1, kind: "food" }, hidden = { x: 5, y: 1, kind: "food" };
  grid.getCell(3, 1).tileType = "buildingWall";
  assert.deepEqual(searchTargets(grid, origin, [hidden, near], { predicate: item => item.kind === "food" }), [near]);
  assert.deepEqual(searchTargets(grid, origin, [hidden, near], { requireLineOfSight: false }), [near, hidden]);
  assert.equal(searchCells(grid, origin, { predicate: cell => cell.tileType === "buildingWall" }).length, 1);
  const zombie = new Zombie("z", 2, 1);
  grid.addEntity(zombie);
  assert.deepEqual(searchEntities(grid, origin, { predicate: entity => entity.symbol === "Z" }), [zombie]);
});

test("both script conditions require sight and exclude the observer", () => {
  const grid = new Grid(10, 10), survivor = new Survivor("s", 1, 1), zombie = new Zombie("z", 5, 1);
  const survivorProgram = parseSurvivorScript("WHEN zombieNearby 8\n MOVE east\nOTHERWISE\n WAIT");
  const zombieProgram = parseSurvivorScript("WHEN survivorNearby 8\n CHASE survivor\nOTHERWISE\n WAIT", "zombie");
  const context = { grid, survivor, survivors: [survivor], zombies: [zombie] };
  assert.equal(runSurvivorProgram(survivorProgram, context).type, "move");
  assert.equal(runSurvivorProgram(zombieProgram, { ...context, survivor: zombie }).type, "chase");
  grid.getCell(3, 1).tileType = "buildingWall";
  assert.equal(runSurvivorProgram(survivorProgram, context).type, "wait");
  assert.equal(runSurvivorProgram(zombieProgram, { ...context, survivor: zombie }).type, "wait");
  assert.equal(runSurvivorProgram(survivorProgram, { ...context, survivor: zombie }).type, "wait");
});
