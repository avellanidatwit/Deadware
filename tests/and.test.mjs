import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";
import { Car } from "../dist/entities/car.js";
import { createItem } from "../dist/entities/item.js";

test("AND requires all conditions and preserves chase range and actor restrictions", () => {
  const grid = new Grid(20, 20), survivor = new Survivor("s", 8, 1), zombie = new Zombie("z", 1, 1);
  const program = parseSurvivorScript("WHEN health > 20 AND survivorNearby 10 AND survivorNearby 8\n CHASE survivor\nOTHERWISE\n WAIT", "zombie");
  const context = { grid, survivor: zombie, survivors: [survivor], zombies: [zombie] };
  assert.deepEqual(runSurvivorProgram(program, context), { type: "chase", target: "survivor", range: 8 });
  zombie.health = 20;
  assert.equal(runSurvivorProgram(program, context).type, "wait");
  for (const condition of ["AND health > 0", "health > 0 AND", "health > 0 AND AND zombieNearby"]) {
    assert.throws(() => parseSurvivorScript(`WHEN ${condition}\n WAIT`), /Line 1/);
  }
  assert.throws(() => parseSurvivorScript("WHEN health > 0 AND containerNearby\n WAIT", "zombie"));
  assert.doesNotThrow(() => parseSurvivorScript("WHEN health > 0 AND survivorNearby\n WAIT"));
  assert.throws(() => parseSurvivorScript("OTHERWISE\n CHASE survivor"));
});

test("only the car's container end can be searched", () => {
  const grid = new Grid(10, 10), car = new Car("car", 4, 3, [createItem("food")]);
  grid.addEntity(car); grid.addEntity(car.body);
  const survivor = new Survivor("s", 4, 5);
  assert.equal(survivor.findContainers(grid, 1).length, 0);
  assert.equal(survivor.searchContainer(grid, car), null);
  assert.equal(grid.isWalkable(4, 3), false);
  assert.equal(grid.isWalkable(4, 4), false);
  survivor.x = 3; survivor.y = 3;
  assert.equal(survivor.searchContainer(grid, car).length, 1);
  assert.equal(survivor.searchContainer(grid, car).length, 0);
});
