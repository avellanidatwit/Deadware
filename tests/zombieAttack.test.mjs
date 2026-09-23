import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { parseSurvivorScript } from "../dist/scripting/survivorScript.js";
import { runZombieTick } from "../dist/scripting/zombieScript.js";

test("default zombie attacks for 20 per tick and removes a survivor after five hits", () => {
  const grid = new Grid(10, 10), zombie = new Zombie("z", 2, 2), survivor = new Survivor("s", 3, 2);
  grid.addEntity(zombie); grid.addEntity(survivor);
  const program = parseSurvivorScript(zombie.program, "zombie");
  for (let i = 1; i <= 5; i++) {
    runZombieTick(zombie, program, grid, [survivor], [zombie]);
    assert.equal(survivor.health, 100 - i * 20);
    assert.deepEqual([zombie.x, zombie.y], [2, 2]);
  }
  assert.equal(grid.getCell(3, 2).entities.includes(survivor), false);
});

test("attack cannot hit diagonally, beyond melee range, or from a dead zombie", () => {
  const grid = new Grid(10, 10), zombie = new Zombie("z", 2, 2), survivor = new Survivor("s", 3, 3);
  const attack = parseSurvivorScript("OTHERWISE\n ATTACK survivor", "zombie");
  for (const [x, y] of [[3, 3], [4, 2]]) {
    survivor.x = x; survivor.y = y;
    runZombieTick(zombie, attack, grid, [survivor], [zombie]);
    assert.equal(survivor.health, 100);
  }
  survivor.x = 3; survivor.y = 2; zombie.health = 0;
  runZombieTick(zombie, attack, grid, [survivor], [zombie]);
  assert.equal(survivor.health, 100);
  assert.throws(() => parseSurvivorScript("OTHERWISE\n ATTACK survivor"));
});
