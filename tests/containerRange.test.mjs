import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";
import { Survivor } from "../dist/entities/survivor.js";
import { ItemContainer } from "../dist/entities/container.js";
import { createItem } from "../dist/entities/item.js";
import { parseSurvivorScript, runSurvivorProgram } from "../dist/scripting/survivorScript.js";

test("container range respects defaults, boundaries, visibility, empty contents, and search reach", () => {
  const grid = new Grid(12, 12), survivor = new Survivor("s", 1, 1);
  const container = new ItemContainer("c", 5, 1, "Desk", [createItem("food")]);
  grid.addEntity(container);
  const matches = suffix => runSurvivorProgram(parseSurvivorScript(`WHEN containerNearby${suffix}\n LOOK floor\nOTHERWISE\n WAIT`), { grid, survivor, zombies: [] }).type === "lookFloor";
  assert.equal(matches(""), false);
  assert.equal(matches(" 3"), false);
  assert.equal(matches(" 4"), true);
  assert.equal(matches(" 10"), true);
  assert.equal(matches(" 0"), false);
  assert.equal(survivor.searchContainer(grid, container), null);
  grid.getCell(3, 1).tileType = "buildingWall";
  assert.equal(matches(" 10"), false);
  grid.getCell(3, 1).tileType = "empty";
  survivor.x = 4;
  assert.equal(matches(""), true);
  survivor.searchContainer(grid, container);
  assert.equal(matches(" 10"), false);
});

test("container ranges reject invalid values and zombie usage", () => {
  for (const value of ["-1", "2.5", "NaN", "5 extra", "9007199254740992"]) {
    assert.throws(() => parseSurvivorScript(`WHEN containerNearby ${value}\n WAIT`), /Line 1: Nearby range/);
  }
  assert.throws(() => parseSurvivorScript("WHEN containerNearby 8\n WAIT", "zombie"), /require a survivor/);
});
