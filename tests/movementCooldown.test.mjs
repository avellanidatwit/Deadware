import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("cooldown skips movement rules and selects a later matching non-movement action", () => {
  const context = { grid: new Grid(10, 10), survivor: new Survivor("s", 2, 2), zombies: [new Zombie("z", 3, 2)] };
  for (const movement of ["MOVE north", "MOVE_AWAY zombie", "MOVE_TO container", "EXPLORE", "WANDER"]) {
    const program = parseSurvivorScript(`WHEN zombieNearby\n ${movement}\nWHEN health < 20\n WAIT\nWHEN zombieNearby 1\n ATTACK zombie\nOTHERWISE\n LOOK floor`);
    assert.equal(runSurvivorProgram(program, { ...context, canMove: false }).type, "attack");
    assert.notEqual(runSurvivorProgram(program, { ...context, canMove: true }).type, "attack");
  }
  const onlyMovement = parseSurvivorScript("OTHERWISE\n MOVE east");
  assert.equal(runSurvivorProgram(onlyMovement, { ...context, canMove: false }).type, "wait");
  const fallback = parseSurvivorScript("WHEN zombieNearby\n MOVE_AWAY zombie\nOTHERWISE\n PICK_UP items");
  assert.equal(runSurvivorProgram(fallback, { ...context, canMove: false }).type, "pickUpItems");
});
