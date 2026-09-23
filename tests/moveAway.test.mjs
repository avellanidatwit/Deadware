import test from "node:test";
import assert from "node:assert/strict";
import { Grid } from "../dist/world/grid.js";

test("fleeing turns along the top edge, continues forward, and prioritizes safety", async () => {
  const originalAdd = Grid.prototype.addEntity;
  const originalRandom = Math.random;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  let grid, survivor, zombie, update;
  const elements = new Map();
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {} };
  const element = () => ({
    value: "", handlers: {}, append() {}, setAttribute() {}, removeAttribute() {},
    getContext: () => ctx,
    addEventListener(event, handler) { this.handlers[event] = handler; },
  });
  Grid.prototype.addEntity = function(entity) {
    grid = this;
    if (entity.symbol === "S") survivor = entity;
    else zombie = entity;
    return originalAdd.call(this, entity);
  };
  globalThis.document = {
    querySelector(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
  };
  globalThis.window = { setInterval(fn) { update = fn; return 1; }, clearInterval() {} };
  Math.random = () => 0;
  try {
    await import("../dist/main.js");
    // Hold the zombie still during each update so the flee decision can be isolated.
    const select = elements.get("#script-entity");
    select.value = zombie.id;
    select.handlers.change();
    elements.get("#script-code").value = "OTHERWISE\n WAIT";
    elements.get("#apply-script").handlers.click();
    const moveUpdate = () => {
      const before = [survivor.x, survivor.y];
      update();
      assert.deepEqual([survivor.x, survivor.y], before, "survivor skips odd-numbered movement ticks");
      update();
    };
    for (let i = 0; i < 10; i++) {
      grid.moveEntity(zombie, 13, survivor.y);
      moveUpdate();
    }
    assert.deepEqual([survivor.x, survivor.y], [10, 0]);
    grid.moveEntity(zombie, 13, 0);
    moveUpdate();
    assert.deepEqual([survivor.x, survivor.y], [9, 0], "turn west rather than back south");
    moveUpdate();
    assert.deepEqual([survivor.x, survivor.y], [8, 0], "continue west despite equally safe south move");
    // A safer reversal must beat movement history.
    grid.moveEntity(zombie, 7, 0);
    grid.getCell(8, 1).tileType = "buildingWall";
    moveUpdate();
    assert.deepEqual([survivor.x, survivor.y], [9, 0]);
    // No walkable neighbors: stay still without throwing.
    for (const [x, y] of [[8, 0], [10, 0], [9, 1]]) grid.getCell(x, y).tileType = "buildingWall";
    moveUpdate();
    assert.deepEqual([survivor.x, survivor.y], [9, 0]);
  } finally {
    Grid.prototype.addEntity = originalAdd;
    Math.random = originalRandom;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
