import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../dist/world/city.js";
import { ITEM_CATALOG } from "../dist/data/itemCatalog.js";
import { createItemByKey, randomizeItems } from "../dist/entities/item.js";
import { ItemContainer } from "../dist/entities/container.js";

test("furnished rooms have searchable storage, decoration, and reachable furniture", () => {
  const city = generateCity({ seed: 42, buildingZombieChance: 1 });
  assert.equal(city.zombies.length, city.buildings.length);
  for (const building of city.buildings) {
    const inside = entity => entity.x > building.x && entity.x < building.x + building.width - 1 && entity.y > building.y && entity.y < building.door.y;
    assert.ok(city.containers.some(inside));
    assert.ok(city.furniture.some(inside));
    assert.equal(city.zombies.filter(inside).length, 1);
    const start = { x: building.door.x, y: building.door.y - 1 };
    const seen = new Set([`${start.x},${start.y}`]), queue = [start];
    assert.ok(city.grid.isWalkable(start.x, start.y));
    for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next = { x: queue[i].x + dx, y: queue[i].y + dy }, key = `${next.x},${next.y}`;
      if (inside(next) && city.grid.isWalkable(next.x, next.y) && !seen.has(key)) { seen.add(key); queue.push(next); }
    }
    for (const entity of [...city.containers, ...city.furniture].filter(inside)) {
      assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => seen.has(`${entity.x + dx},${entity.y + dy}`)));
    }
  }
  assert.ok(city.furniture.every(entity => !(entity instanceof ItemContainer)));
  assert.equal(generateCity({ seed: 42, buildingZombieChance: 0 }).zombies.length, 0);
});

test("default building zombie chance is approximately forty percent across seeds", () => {
  let total = 0, infested = 0;
  for (let seed = 0; seed < 100; seed++) {
    const city = generateCity({ seed }); total += city.buildings.length; infested += city.zombies.length;
  }
  assert.ok(infested / total > 0.33 && infested / total < 0.47);
});

test("catalog drives created and randomized item definitions", () => {
  for (const definition of ITEM_CATALOG) {
    const item = createItemByKey(definition.key);
    assert.equal(item.name, definition.name);
    assert.equal(item.type, definition.type);
  }
  for (const item of randomizeItems(20)) assert.ok(ITEM_CATALOG.some(definition => definition.key === item.catalogKey));
  assert.throws(() => createItemByKey("missing"));
});
