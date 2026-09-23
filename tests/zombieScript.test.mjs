import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { parseSurvivorScript } from "../dist/scripting/survivorScript.js";
import { findNearestSurvivor, runZombieTick } from "../dist/scripting/zombieScript.js";

function setup() {
  const grid = new Grid(12, 12);
  const zombie = new Zombie("z", 2, 2);
  grid.addEntity(zombie);
  const program = parseSurvivorScript(zombie.program, "zombie");
  return { grid, zombie, program };
}

test("nearest living survivor, inclusive detection boundary, and loss of range", () => {
  const { grid, zombie } = setup();
  const near = new Survivor("near", 4, 2);
  const edge = new Survivor("edge", 7, 2);
  const far = new Survivor("far", 8, 2);
  assert.equal(findNearestSurvivor(zombie, [far, edge, near], grid), near);
  near.takeDamage(100);
  assert.equal(findNearestSurvivor(zombie, [far, near, edge], grid), edge);
  assert.equal(findNearestSurvivor(zombie, [far, near], grid), undefined);
});

test("default script chases one tile then stops adjacent", () => {
  const { grid, zombie, program } = setup();
  const target = new Survivor("s", 5, 2);
  grid.addEntity(target);
  for (let i = 0; i < 5; i++) runZombieTick(zombie, program, grid, [target], [zombie]);
  assert.deepEqual([zombie.x, zombie.y], [4, 2]);
});

test("chase cannot detect a survivor behind an intervening wall", () => {
  const { grid, zombie, program } = setup();
  const target = new Survivor("s", 4, 2);
  grid.getCell(3, 2).tileType = "buildingWall";
  runZombieTick(zombie, program, grid, [target], [zombie]);
  // The default script wanders when sight is blocked; explicit chase must wait.
  grid.moveEntity(zombie, 2, 2);
  const chase = parseSurvivorScript("OTHERWISE\n CHASE survivor", "zombie");
  runZombieTick(zombie, chase, grid, [target], [zombie]);
  assert.deepEqual([zombie.x, zombie.y], [2, 2]);
});

test("no survivor in range wanders; trapped and dead zombies stay still", () => {
  const { grid, zombie, program } = setup();
  for (const [x,y] of [[2,1], [2,3], [1,2]]) grid.getCell(x,y).tileType = "buildingWall";
  runZombieTick(zombie, program, grid, [new Survivor("far", 11,11)], [zombie]);
  assert.deepEqual([zombie.x,zombie.y], [3,2]);
  for (const [x,y] of [[3,1], [3,3], [2,2], [4,2]]) grid.getCell(x,y).tileType = "buildingWall";
  runZombieTick(zombie, program, grid, [], [zombie]);
  assert.deepEqual([zombie.x,zombie.y], [3,2]);
  grid.getCell(4,2).tileType = "empty";
  zombie.takeDamage(100);
  runZombieTick(zombie, program, grid, [], [zombie]);
  assert.deepEqual([zombie.x,zombie.y], [3,2]);
});

test("health conditions use zombie health and replacement scripts change behavior", () => {
  const { grid, zombie } = setup();
  zombie.health = 10;
  const program = parseSurvivorScript("WHEN health < 20\n WAIT\nOTHERWISE\n MOVE east", "zombie");
  runZombieTick(zombie, program, grid, [], [zombie]);
  assert.equal(zombie.x, 2);
  const replacement = parseSurvivorScript("OTHERWISE\n MOVE east", "zombie");
  runZombieTick(zombie, replacement, grid, [], [zombie]);
  assert.equal(zombie.x, 3);
  assert.throws(() => parseSurvivorScript("OTHERWISE\n CHASE zombie", "zombie"), /CHASE requires survivor/);
  assert.throws(() => parseSurvivorScript("OTHERWISE\n ATTACK zombie", "zombie"), /Zombie actions/);
});
