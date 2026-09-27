import { drawWorld } from "../dist/ui/worldRenderer.js";
import { Survivor } from "../dist/entities/survivor.js";
import { Zombie } from "../dist/entities/zombie.js";
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
    assert.equal(typeof update, "function", "browser entry point must start the simulation timer");
    assert.match(elements.get("#stats").textContent, /Tick 0/);
    assert.match(elements.get("#script-code").value, /ATTACK zombie/);
    assert.match(elements.get("#inventory").textContent, /0\/5/);
    // This regression uses an open arena rather than the generated city.
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      const cell = grid.getCell(x, y);
      cell.tileType = "empty";
      cell.entities = cell.entities.filter(entity => entity === survivor || entity === zombie);
    }
    grid.moveEntity(survivor, 10, 10);
    grid.moveEntity(zombie, 13, 10);
    // Hold the zombie still during each update so the flee decision can be isolated.
    const select = elements.get("#script-entity");
    select.value = zombie.id;
    select.handlers.change();
    elements.get("#script-code").value = "OTHERWISE\n WAIT";
    elements.get("#apply-script").handlers.click();
    // Isolate fleeing from the user's editable starter script (which now attacks).
    select.value = survivor.id;
    select.handlers.change();
    elements.get("#script-code").value = "WHEN zombieNearby 6\n MOVE_AWAY zombie\nOTHERWISE\n WAIT";
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

    const beforePause = elements.get("#stats").textContent;
    elements.get("#pause").handlers.click();
    update();
    assert.equal(elements.get("#stats").textContent, beforePause);
    elements.get("#step").handlers.click();
    assert.notEqual(elements.get("#stats").textContent, beforePause);
    elements.get("#pause").handlers.click();
    // No walkable neighbors: stay still without throwing.
    for (const [x, y] of [[8, 0], [10, 0], [9, 1]]) grid.getCell(x, y).tileType = "buildingWall";
    moveUpdate();
    assert.deepEqual([survivor.x, survivor.y], [9, 0]);

    const map = new Grid(30, 3), observer = new Survivor("observer", 1, 1);
    map.addEntity(observer);
    observer.updateVision(map);
    map.moveEntity(observer, 12, 1);
    observer.updateVision(map);
    map.addEntity(new Zombie("hidden", 1, 1));
    map.getCell(1, 1).items.push({ type: "food" });
    const fills = [], labels = [];
    const painter = {
      fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
      strokeRect() {},
      fillText(label) { labels.push(label); },
    };
    drawWorld(painter, map, observer);
    const terrain = (x, y) => fills.find(rect => rect.x === x * 16 && rect.y === y * 16 && rect.width === 16 && rect.height === 16).color;
    assert.equal(terrain(1, 1), "#303436", "remembered terrain is gray");
    assert.equal(terrain(12, 1), "#385849", "visible terrain is light");
    assert.equal(terrain(29, 1), "#080c0d", "unexplored terrain is dark");
    assert.ok(!labels.includes("Z") && !labels.includes("*"), "hidden entities and loot stay hidden");
    const outline = fills.filter(rect => rect.color === "#f06464");
    assert.ok(outline.length > 0);
    assert.ok(!outline.some(rect => rect.x === 12 * 16 && rect.y === 16), "no outline between adjacent visible tiles");
  } finally {
    Grid.prototype.addEntity = originalAdd;
    Math.random = originalRandom;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
