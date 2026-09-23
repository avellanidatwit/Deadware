import test from "node:test";
import assert from "node:assert/strict";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { Grid } from "../dist/world/grid.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";
import { runZombieTick } from "../dist/scripting/zombieScript.js";

for (const condition of ["zombieNearby", "survivorNearby"]) {
  test(`${condition}: defaults, custom ranges, boundary, zero, and dead targets`, () => {
    const actor = condition === "zombieNearby" ? "survivor" : "zombie";
    const self = actor === "survivor" ? new Survivor("self", 0, 0) : new Zombie("self", 0, 0);
    const target = actor === "survivor" ? new Zombie("target", 5, 0) : new Survivor("target", 5, 0);
    const context = { grid: new Grid(20, 20), survivor: self, zombies: [target], survivors: [target] };
    const evaluate = suffix => runSurvivorProgram(parseSurvivorScript(`WHEN ${condition}${suffix}\n MOVE east\nOTHERWISE\n WAIT`, actor), context).type;
    assert.equal(evaluate(""), "move");
    target.x = 6;
    assert.equal(evaluate(""), "wait");
    assert.equal(evaluate(" 6"), "move");
    assert.equal(evaluate(" 3"), "wait");
    target.x = 0;
    assert.equal(evaluate(" 0"), "move");
    target.y = 1;
    assert.equal(evaluate(" 0"), "wait");
    target.takeDamage(100);
    assert.equal(evaluate(" 10"), "wait");
  });

  test(`${condition}: invalid ranges report their source line`, () => {
    for (const range of ["-1", "2.5", "abc", "Infinity", "5 extra", "9007199254740992"]) {
      assert.throws(() => parseSurvivorScript(`WHEN ${condition} ${range}\n WAIT`, "zombie"), /Line 1: Nearby range/);
    }
  });
}

test("chase honors larger rule range and does not leak it into later rules", () => {
  const grid = new Grid(20, 20);
  const zombie = new Zombie("z", 0, 0);
  const survivor = new Survivor("s", 8, 0);
  grid.addEntity(zombie);
  grid.addEntity(survivor);
  const program = parseSurvivorScript("WHEN survivorNearby 8\n CHASE survivor\nOTHERWISE\n WAIT", "zombie");
  runZombieTick(zombie, program, grid, [survivor], [zombie]);
  assert.equal(zombie.x, 1);
  assert.equal(zombie.detectionRange, 5);
  const fallback = parseSurvivorScript("WHEN survivorNearby 2\n CHASE survivor\nOTHERWISE\n CHASE survivor", "zombie");
  runZombieTick(zombie, fallback, grid, [survivor], [zombie]);
  assert.equal(zombie.x, 1);
});
