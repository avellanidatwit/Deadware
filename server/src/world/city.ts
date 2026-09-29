import { Furniture } from "../entities/furniture.js";
import { Zombie } from "../entities/zombie.js";
import { Car } from "../entities/car.js";
import { Grid } from "./grid.js";
import { ItemContainer } from "../entities/container.js";
import { randomizeItems } from "../entities/item.js";

export interface CityOptions {
  width?: number;
  height?: number;
  seed?: number;
  /** Chance of a parked car on eligible road tiles, from 0 to 1. */
  carDensity?: number;
  buildingZombieChance?: number;
}
export interface CityBuilding { x: number; y: number; width: number; height: number; door: { x: number; y: number } }

/** Two-lane streets divide the world into separate building lots. */
export function generateCity({ width = 50, height = 50, seed = Math.floor(Math.random() * 4294967296), carDensity = 0.025, buildingZombieChance = 0.4 }: CityOptions = {}) {
  if (![width, height].every(size => Number.isInteger(size) && size >= 8 && size <= 300)) {
    throw new Error("City dimensions must be integers from 8 to 300.");
  }
  if (!Number.isFinite(seed) || !Number.isFinite(carDensity) || carDensity < 0 || carDensity > 1) {
    throw new Error("Use a finite seed and carDensity between 0 and 1.");
  }
  if (!Number.isFinite(buildingZombieChance) || buildingZombieChance < 0 || buildingZombieChance > 1) throw new Error("buildingZombieChance must be between 0 and 1.");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const grid = new Grid(width, height);
  const buildings: CityBuilding[] = [];
  const cars: Car[] = [];
  const containers: ItemContainer[] = [];
  const furniture: Furniture[] = [];
  const zombies: Zombie[] = [];
  const streetStarts = (size: number): number[] => {
    const starts: number[] = [];
    for (let position = Math.min(size - 3, 5 + Math.floor(random() * 4)); position <= size - 3;
      position += 8 + Math.floor(random() * 7)) starts.push(position);
    return starts;
  };
  const vertical = streetStarts(width), horizontal = streetStarts(height);
  const onStreet = (coordinate: number, starts: number[]) => starts.some(start => coordinate === start || coordinate === start + 1);
  const entrances = new Set<string>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (onStreet(x, vertical) || onStreet(y, horizontal)) grid.getCell(x, y)!.tileType = "road";
  }
  const xLots = [0, ...vertical.map(x => x + 2)];
  const yLots = [0, ...horizontal.map(y => y + 2)];
  // Lots above each horizontal street have a direct driveway; outer land stays unpaved.
  for (let row = 0; row < horizontal.length; row++) for (let column = 0; column < xLots.length; column++) {
    const top = yLots[row], left = xLots[column];
    const right = vertical[column] ?? width, bottom = horizontal[row];
    const lotWidth = right - left, lotHeight = bottom - top;
    if (lotWidth < 5 || lotHeight < 5) continue;
    if (buildings.length > 0 && random() < 0.12) continue; // Occasional vacant lots.
    // A one-tile wall on each side leaves at least a 3x3 interior.
    const buildingWidth = 5 + Math.floor(random() * (lotWidth - 4));
    const buildingHeight = 5 + Math.floor(random() * (lotHeight - 4));
    const x = left + Math.floor(random() * (lotWidth - buildingWidth + 1));
    const y = top + Math.floor(random() * (lotHeight - buildingHeight + 1));
    grid.createBuilding(x, y, buildingWidth, buildingHeight);
    const door = { x: x + Math.floor(buildingWidth / 2), y: y + buildingHeight - 1 };
    buildings.push({ x, y, width: buildingWidth, height: buildingHeight, door });
    // A straight driveway connects every door to the street below its lot.
    for (let pathY = door.y + 1; pathY <= bottom; pathY++) {
      grid.getCell(door.x, pathY)!.tileType = "road";
      entrances.add(`${door.x},${pathY}`);
    }
    // Furnish alternating side-wall tiles; keep the middle and doorway approach clear.
    let furnishingIndex = 0;
    for (let furnitureY = y + 1; furnitureY < door.y; furnitureY += 2) {
      for (const furnitureX of [x + 1, x + buildingWidth - 2]) {
        if (furnitureX === door.x && furnitureY === door.y - 1) continue;
        const id = `building-${buildings.length}-furniture-${furnishingIndex}`;
        if (furnishingIndex % 2 === 0) {
          const names = ["Desk", "Cabinet", "Dresser", "Bookshelf"];
          const container = new ItemContainer(id, furnitureX, furnitureY,
            names[Math.floor(random() * names.length)], randomizeItems(1 + Math.floor(random() * 3), random));
          grid.addEntity(container);
          containers.push(container);
        } else {
          const names = ["Chair", "Sofa", "Bed", "Table"];
          const decoration = new Furniture(id, furnitureX, furnitureY, names[Math.floor(random() * names.length)]);
          grid.addEntity(decoration);
          furniture.push(decoration);
        }
        furnishingIndex++;
      }
    }
    if (random() < buildingZombieChance) {
      const spawnTiles = [];
      for (let spawnY = y + 1; spawnY < door.y; spawnY++) for (let spawnX = x + 1; spawnX < x + buildingWidth - 1; spawnX++) {
        if (grid.isWalkable(spawnX, spawnY) && grid.getCell(spawnX, spawnY)!.entities.length === 0) spawnTiles.push({ x: spawnX, y: spawnY });
      }
      const spawn = spawnTiles[Math.floor(random() * spawnTiles.length)];
      if (spawn) {
        const zombie = new Zombie(`building-${buildings.length}-zombie`, spawn.x, spawn.y);
        grid.addEntity(zombie);
        zombies.push(zombie);
      }
    }
  }
  // Park on the second vertical lane, with two clear tiles and no junction/driveway overlap.
  for (const streetX of vertical) for (let y = 1; y < height - 1; y++) {
    const x = streetX + 1;
    if ([y, y + 1].some(row => onStreet(row, horizontal) || entrances.has(`${x},${row}`) ||
        grid.getCell(x, row)!.entities.length > 0) || random() >= carDensity) continue;
    const car = new Car(`car-${cars.length + 1}`, x, y, randomizeItems(1 + Math.floor(random() * 3), random));
    grid.addEntity(car);
    grid.addEntity(car.body);
    cars.push(car);
    y++; // Skip occupied body tile.
  }
  // Horizontal roads use the same parking rule, keeping their first lane clear.
  for (const streetY of horizontal) for (let x = 1; x < width - 1; x++) {
    const y = streetY + 1;
    if ([x, x + 1].some(column => onStreet(column, vertical) || entrances.has(`${column},${y}`) ||
        grid.getCell(column, y)!.entities.length > 0) || random() >= carDensity) continue;
    const car = new Car(`car-${cars.length + 1}`, x, y,
      randomizeItems(1 + Math.floor(random() * 3), random), "horizontal");
    grid.addEntity(car);
    grid.addEntity(car.body);
    cars.push(car);
    x++;
  }
  return { grid, buildings, cars, containers, furniture, zombies, seed: seed >>> 0,
    survivorSpawn: { x: vertical[0], y: horizontal[0] },
    zombieSpawn: { x: vertical[0], y: horizontal[0] + 1 } };
}
