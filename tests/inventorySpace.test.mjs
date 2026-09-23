import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { createItem } from "../dist/entities/item.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("inventorySpace is the opposite of inventoryFull from zero through five items", () => {
  const grid = new Grid(5, 5), survivor = new Survivor("s", 1, 1);
  const context = { grid, survivor, zombies: [] };
  const space = parseSurvivorScript("WHEN inventorySpace\n LOOK floor\nOTHERWISE\n WAIT");
  const full = parseSurvivorScript("WHEN inventoryFull\n LOOK floor\nOTHERWISE\n WAIT");
  const pickup = parseSurvivorScript("WHEN itemsOnFloor AND inventorySpace\n PICK_UP items\nOTHERWISE\n WAIT");
  for (let count = 0; count <= 5; count++) {
    assert.equal(runSurvivorProgram(space, context).type === "lookFloor", count < 5);
    assert.equal(runSurvivorProgram(full, context).type === "lookFloor", count === 5);
    grid.getCell(1, 1).items.push(createItem("food"));
    assert.equal(runSurvivorProgram(pickup, context).type, count < 5 ? "pickUpItems" : "wait");
    survivor.pickUpItems(grid);
  }
  assert.equal(survivor.inventory.length, 5);
  assert.throws(() => parseSurvivorScript("WHEN health > 0 AND inventorySpace\n WAIT", "zombie"));
});
