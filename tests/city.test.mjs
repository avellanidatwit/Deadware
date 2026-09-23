import test from "node:test";
import assert from "node:assert/strict";
import { generateCity } from "../dist/world/city.js";
import { Survivor } from "../dist/entities/survivor.js";

test("cities fit custom dimensions, separate buildings, and connect every entrance with cars present", () => {
  for (const [width, height] of [[50, 50], [8, 8], [31, 47], [80, 25]]) {
    for (const seed of [1, 10, 42]) {
      const { grid, buildings, cars, survivorSpawn, zombieSpawn } = generateCity({ width, height, seed, carDensity: 1 });
      assert.equal(grid.width, width); assert.equal(grid.height, height);
      assert.ok(buildings.length > 0);
      const occupied = new Set();
      assert.notEqual(grid.getCell(0, 0).tileType, "road");
      assert.notEqual(grid.getCell(width - 1, height - 1).tileType, "road");
      for (const building of buildings) {
        assert.ok(building.width - 2 >= 3 && building.height - 2 >= 3);
        for (let y = building.y; y < building.y + building.height; y++) {
          for (let x = building.x; x < building.x + building.width; x++) {
            const key = `${x},${y}`;
            assert.ok(!occupied.has(key)); occupied.add(key);
            assert.ok(grid.getCell(x, y));
            assert.notEqual(grid.getCell(x, y).tileType, "road");
          }
        }
      }
      const seen = new Set([`${survivorSpawn.x},${survivorSpawn.y}`]);
      const queue = [survivorSpawn];
      for (let i = 0; i < queue.length; i++) {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x = queue[i].x + dx, y = queue[i].y + dy, key = `${x},${y}`;
          if (!seen.has(key) && grid.isWalkable(x, y)) { seen.add(key); queue.push({ x, y }); }
        }
      }
      assert.ok(seen.has(`${zombieSpawn.x},${zombieSpawn.y}`));
      for (const { door } of buildings) assert.ok(seen.has(`${door.x},${door.y + 1}`));
      for (const car of cars) {
        assert.equal(grid.getCell(car.x, car.y).tileType, "road");
        assert.equal(grid.isWalkable(car.x, car.y), false);
        assert.equal(grid.isWalkable(car.body.x, car.body.y), false);
        assert.equal(grid.getCell(car.body.x, car.body.y).tileType, "road");
        const vertical = car.orientation === "vertical";
        assert.equal(car.body.x, car.x + (vertical ? 0 : 1));
        assert.equal(car.body.y, car.y + (vertical ? 1 : 0));
        const searchX = car.x - (vertical ? 1 : 0), searchY = car.y - (vertical ? 0 : 1);
        assert.ok(seen.has(`${searchX},${searchY}`));
        const survivor = new Survivor("searcher", searchX, searchY);
        assert.ok(survivor.searchContainer(grid, car).length > 0);
        assert.equal(car.contents.length, 0);
      }
    }
  }
});

test("defaults, reproducible layout and loot, optional cars, and invalid settings", () => {
  const first = generateCity({ seed: 123 }), second = generateCity({ seed: 123 });
  assert.equal(first.grid.width, 50); assert.equal(first.grid.height, 50);
  assert.ok(first.buildings.length >= 6);
  assert.ok(first.cars.length > 0);
  assert.deepEqual(first.buildings, second.buildings);
  assert.deepEqual(first.cars.map(car => [car.x, car.y, car.contents.map(item => item.type)]), second.cars.map(car => [car.x, car.y, car.contents.map(item => item.type)]));
  assert.equal(generateCity({ carDensity: 0 }).cars.length, 0);
  for (const options of [{ width: 0 }, { height: 3.5 }, { width: 301 }, { carDensity: 2 }, { seed: NaN }]) {
    assert.throws(() => generateCity(options));
  }
});


test("cars support both road orientations and default density is reduced", () => {
  const dense = generateCity({ seed: 42, carDensity: 1 });
  assert.ok(dense.cars.some(car => car.orientation === "horizontal"));
  assert.ok(dense.cars.some(car => car.orientation === "vertical"));
  let sparseTotal = 0, previousTotal = 0;
  for (let seed = 1; seed <= 20; seed++) {
    sparseTotal += generateCity({ seed }).cars.length;
    previousTotal += generateCity({ seed, carDensity: 0.12 }).cars.length;
  }
  assert.ok(sparseTotal < previousTotal / 2);
});
