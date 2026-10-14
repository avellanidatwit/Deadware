import { TILE_WIDTH, TILE_HEIGHT, type Point } from './renderConfig.js';

// Integer world coordinates are tile CENTERS, matching Grid.getCell's rounding.
export function worldToIso(p: Point): Point {
  return { x: ((p.x - p.y) * TILE_WIDTH) / 2, y: ((p.x + p.y) * TILE_HEIGHT) / 2 };
}
export function isoToWorld(p: Point): Point {
  return { x: p.x / TILE_WIDTH + p.y / TILE_HEIGHT, y: p.y / TILE_HEIGHT - p.x / TILE_WIDTH };
}
export class IsometricCamera {
  x = 0;
  y = 0;
  zoom = 1;
  width = 800;
  height = 560;
  readonly minZoom = 0.35;
  readonly maxZoom = 3;
  private target: Point | null = null;
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  center(p: Point, smooth = false) {
    const iso = worldToIso(p);
    if (smooth) this.target = iso;
    else {
      this.x = iso.x;
      this.y = iso.y;
      this.target = null;
    }
  }
  advance(dt: number) {
    if (!this.target) return;
    const f = 1 - Math.exp(-Math.min(dt, 0.1) * 10);
    this.x += (this.target.x - this.x) * f;
    this.y += (this.target.y - this.y) * f;
    if (Math.hypot(this.target.x - this.x, this.target.y - this.y) < 0.05) this.target = null;
  }
  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.target = null;
  }
  toScreen(p: Point): Point {
    const iso = worldToIso(p);
    return {
      x: (iso.x - this.x) * this.zoom + this.width / 2,
      y: (iso.y - this.y) * this.zoom + this.height / 2,
    };
  }
  toWorld(p: Point): Point {
    return isoToWorld({
      x: (p.x - this.width / 2) / this.zoom + this.x,
      y: (p.y - this.height / 2) / this.zoom + this.y,
    });
  }
  pick(p: Point): Point {
    const w = this.toWorld(p);
    return { x: Math.round(w.x), y: Math.round(w.y) };
  }
  zoomAt(p: Point, factor: number) {
    const anchor = this.toWorld(p);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const iso = worldToIso(anchor);
    this.x = iso.x - (p.x - this.width / 2) / this.zoom;
    this.y = iso.y - (p.y - this.height / 2) / this.zoom;
    this.target = null;
  }
  bounds(padding = 100) {
    const corners = [
      this.toWorld({ x: -padding, y: -padding }),
      this.toWorld({ x: this.width + padding, y: -padding }),
      this.toWorld({ x: -padding, y: this.height + padding }),
      this.toWorld({ x: this.width + padding, y: this.height + padding }),
    ];
    return {
      minX: Math.floor(Math.min(...corners.map((p) => p.x))),
      maxX: Math.ceil(Math.max(...corners.map((p) => p.x))),
      minY: Math.floor(Math.min(...corners.map((p) => p.y))),
      maxY: Math.ceil(Math.max(...corners.map((p) => p.y))),
    };
  }
}
