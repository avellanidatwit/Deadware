import type { Grid, GridCell, GridEntity } from "./grid.js";

export interface Position { x: number; y: number }
export interface SightOptions {
  range?: number;
  metric?: "manhattan" | "euclidean" | "chebyshev";
  /** Override opacity for smoke, closed doors, or other future terrain. */
  blocksSight?: (cell: GridCell) => boolean;
  /** Walls themselves are visible by default; tiles behind them are not. */
  includeBlockingTarget?: boolean;
}
export interface SearchOptions<T> extends SightOptions {
  predicate?: (target: T) => boolean;
  getPosition?: (target: T) => Position;
  requireLineOfSight?: boolean;
}

export function spatialDistance(a: Position, b: Position, metric: SightOptions["metric"] = "manhattan"): number {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return metric === "euclidean" ? Math.hypot(dx, dy) : metric === "chebyshev" ? Math.max(dx, dy) : dx + dy;
}

function validPosition(grid: Grid, position: Position): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y) && grid.isValidPosition(position.x, position.y);
}

/** Center-to-center grid ray. Both side tiles are checked at exact corner crossings. */
export function hasLineOfSight(grid: Grid, origin: Position, target: Position, options: SightOptions = {}): boolean {
  if (!validPosition(grid, origin) || !validPosition(grid, target)) return false;
  const range = options.range ?? Infinity;
  if (Number.isNaN(range) || range < 0 || spatialDistance(origin, target, options.metric) > range) return false;
  const blocks = options.blocksSight ?? (cell => cell.tileType === "buildingWall" || cell.tileType === "door");
  const blocked = (x: number, y: number): boolean => {
    const cell = grid.getCell(x, y);
    if (!cell) return true;
    if (x === target.x && y === target.y && (options.includeBlockingTarget ?? true)) return false;
    return blocks(cell);
  };
  if (origin.x === target.x && origin.y === target.y) return !blocked(target.x, target.y);
  if (blocks(grid.getCell(origin.x, origin.y)!)) return false;
  const dx = Math.abs(target.x - origin.x), dy = Math.abs(target.y - origin.y);
  const sx = Math.sign(target.x - origin.x), sy = Math.sign(target.y - origin.y);
  let x = origin.x, y = origin.y, ix = 0, iy = 0;
  while (ix < dx || iy < dy) {
    const crossing = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
    if (crossing === 0) {
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (crossing < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (blocked(x, y)) return false;
  }
  return true;
}

/** Filter any positioned objects (including future items), returning nearest first. */
export function searchTargets<T extends Position>(grid: Grid, origin: Position, targets: Iterable<T>, options: SearchOptions<T> = {}): T[] {
  const range = options.range ?? Infinity;
  if (!validPosition(grid, origin) || Number.isNaN(range) || range < 0) return [];
  const positionOf = options.getPosition ?? ((target: T) => target);
  return Array.from(targets).filter(target => {
    if (options.predicate && !options.predicate(target)) return false;
    const position = positionOf(target);
    return validPosition(grid, position) && spatialDistance(origin, position, options.metric) <= range &&
      (options.requireLineOfSight === false || hasLineOfSight(grid, origin, position, options));
  }).sort((a, b) => spatialDistance(origin, positionOf(a), options.metric) - spatialDistance(origin, positionOf(b), options.metric));
}

export function findNearestTarget<T extends Position>(grid: Grid, origin: Position, targets: Iterable<T>, options: SearchOptions<T> = {}): T | undefined {
  return searchTargets(grid, origin, targets, options)[0];
}

export function searchCells(grid: Grid, origin: Position, options: SearchOptions<GridCell> = {}): GridCell[] {
  function* cells(): Generator<GridCell> {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) yield grid.getCell(x, y)!;
    }
  }
  return searchTargets(grid, origin, cells(), options);
}

export function searchEntities(grid: Grid, origin: Position, options: SearchOptions<GridEntity> = {}): GridEntity[] {
  function* entities(): Generator<GridEntity> {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) yield* grid.getCell(x, y)!.entities;
    }
  }
  return searchTargets(grid, origin, entities(), options);
}
