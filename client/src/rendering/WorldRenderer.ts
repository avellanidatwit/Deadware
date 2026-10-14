import { CombatEffects } from './CombatEffects.js';
import { roofGroups, roofCutaway, drawRoof, type RoofGroup } from './RoofRenderer.js';
import { terrainTransitions } from './TerrainTransitions.js';
import type { VisualEvent } from '../../../shared/src/types/visualEvents.js';
import type { WorldResponse } from '../../../shared/src/types/api.js';
import type { ViewCell } from '../../../shared/src/types/world.js';
import { interpolateMotion } from '../ui/motion.js';
import { IsometricCamera, worldToIso } from './IsometricCamera.js';
import { SpriteManager, drawSprite, diamond } from './SpriteManager.js';
import { drawBuilding } from './BuildingRenderer.js';
import { atmosphere, shadow, damage } from './EffectsRenderer.js';
import {
  defaultSettings,
  noise,
  palette as P,
  type Point,
  type RenderSettings,
} from './renderConfig.js';
import {
  cellKey,
  isActor,
  permittedPosition,
  rememberTerrain,
  compareDepth,
  type VisualEntity,
} from './scene.js';
interface ActorState {
  entity: VisualEntity;
  position: Point;
  facing: number;
  moving: boolean;
  damageUntil: number;
}
interface Entry {
  x: number;
  y: number;
  layer: number;
  id: string;
  cell?: ViewCell;
  entity?: VisualEntity;
  actor?: ActorState;
  vegetation?: boolean;
  vehicle?: { body: VisualEntity; horizontal: boolean };
  death?: { event: VisualEvent; progress: number };
  roof?: { cell: ViewCell; group: RoofGroup };
}
export interface WorldHit {
  tile: Point;
  entityId?: string;
}
/** Client presentation only: consumes permission-filtered snapshots, never predicts simulation state. */
export class WorldRenderer {
  readonly camera = new IsometricCamera();
  readonly sprites = new SpriteManager();
  settings: RenderSettings = { ...defaultSettings };
  cells = new Map<string, ViewCell>();
  positions = new Map<string, Point>();
  hover: Point | null = null;
  selection: WorldHit | null = null;
  stats = { tiles: 0, actors: 0, objects: 0, frameMs: 0, terrainBuilds: 0 };
  private world: WorldResponse | null = null;
  private actors: ActorState[] = [];
  private objects: Entry[] = [];
  private entries: Entry[] = [];
  private drawn: Entry[] = [];
  private ground = document.createElement('canvas');
  private groundKey = '';
  private revision = 0;
  private previousTime: number | null = null;
  readonly combatEffects = new CombatEffects();
  private roofs: RoofGroup[] = [];
  private observerKey = '';
  constructor(readonly canvas: HTMLCanvasElement) {}
  setSnapshot(world: WorldResponse, now = performance.now()) {
    const observerKey = world.zombieObservers ? 'all-zombies' : (world.observer?.id ?? 'none');
    const reset =
      this.observerKey !== observerKey ||
      this.world?.width !== world.width ||
      this.world?.height !== world.height ||
      world.tick < (this.world?.tick ?? 0);
    if (reset) {
      this.combatEffects.reset();
      this.cells.clear();
      this.actors = [];
      this.selection = null;
      this.hover = null;
      this.positions.clear();
      this.observerKey = observerKey;
    }
    const next = rememberTerrain(world.cells, this.cells);
    let terrainChanged = reset || next.size !== this.cells.size;
    const previousActors = new Map(this.actors.map((a) => [a.entity.id, a]));
    this.objects = [];
    this.actors = [];
    for (const [key, cell] of next) {
      const old = this.cells.get(key);
      if (
        !old ||
        old.tileType !== cell.tileType ||
        old.visible !== cell.visible ||
        old.explored !== cell.explored
      )
        terrainChanged = true;
      if (cell.explored && ['buildingWall', 'door', 'openDoor'].includes(cell.tileType))
        this.objects.push({ x: cell.x, y: cell.y, layer: 1, id: `wall:${key}`, cell });
      if (cell.explored && cell.tileType === 'empty' && noise(cell.x, cell.y, 13) % 19 === 0)
        this.objects.push({
          x: cell.x,
          y: cell.y,
          layer: 0,
          id: `bush:${key}`,
          cell,
          vegetation: true,
        });
      if (!cell.visible) continue;
      for (const entity of cell.entities) {
        if (isActor(entity)) {
          const previous = previousActors.get(entity.id);
          this.actors.push({
            entity,
            position: previous?.position ?? entity.motion?.[0] ?? { x: entity.x, y: entity.y },
            facing: previous?.facing ?? 1,
            moving: false,
            damageUntil:
              previous &&
              entity.actor &&
              previous.entity.actor &&
              entity.actor.health < previous.entity.actor.health
                ? now + 350
                : (previous?.damageUntil ?? 0),
          });
        } else
          this.objects.push({ x: entity.x, y: entity.y, layer: 2, id: entity.id, entity, cell });
      }
    }
    const objectsById = new Map(this.objects.filter((e) => e.entity).map((e) => [e.id, e]));
    const pairedBodies = new Set<string>();
    for (const entry of this.objects) {
      if (entry.entity?.name !== 'Car') continue;
      const body = objectsById.get(`${entry.id}-body`);
      if (!body?.entity) continue;
      entry.vehicle = { body: body.entity, horizontal: Math.abs(body.x - entry.x) > 0.5 };
      entry.x = (entry.x + body.x) / 2;
      entry.y = (entry.y + body.y) / 2;
      pairedBodies.add(body.id);
    }
    this.objects = this.objects.filter((e) => !pairedBodies.has(e.id));
    this.world = world;
    this.cells = next;
    this.drawn.length = 0;
    this.positions.clear();
    if (terrainChanged) {
      this.revision++;
      this.roofs = roofGroups(next);
    } else
      for (const roof of this.roofs)
        roof.tiles = roof.tiles.map((c) => next.get(cellKey(c.x, c.y))!);
    this.combatEffects.receive(world.visualEvents, world.time ?? 0);
    if (reset) this.resetCamera();
  }
  invalidateAssets() {
    this.groundKey = '';
  }
  resetCamera() {
    const p = this.world?.observer ??
      this.world?.zombieObservers?.[0] ?? {
        x: (this.world?.width ?? 20) / 2,
        y: (this.world?.height ?? 20) / 2,
      };
    this.camera.zoom = 1;
    this.camera.center(p);
    this.groundKey = '';
  }
  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ground.width = this.canvas.width;
    this.ground.height = this.canvas.height;
    this.camera.resize(width, height);
    this.groundKey = '';
  }
  private inViewport(p: Point, pad = 100) {
    return (
      p.x > -pad && p.y > -pad && p.x < this.camera.width + pad && p.y < this.camera.height + pad
    );
  }
  private visibleCells() {
    const bounds = this.camera.bounds();
    const cells: ViewCell[] = [];
    if (!this.world) return cells;
    for (let y = Math.max(0, bounds.minY); y <= Math.min(this.world.height - 1, bounds.maxY); y++)
      for (
        let x = Math.max(0, bounds.minX);
        x <= Math.min(this.world.width - 1, bounds.maxX);
        x++
      ) {
        const cell = this.cells.get(cellKey(x, y));
        if (cell && this.inViewport(this.camera.toScreen(cell))) cells.push(cell);
      }
    return cells;
  }
  private transform(ctx: CanvasRenderingContext2D) {
    const dpr = this.canvas.width / this.camera.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.camera.width / 2, this.camera.height / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    ctx.imageSmoothingEnabled = false;
  }
  private rebuildGround(cells: ViewCell[]) {
    const ctx = this.ground.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = P.void;
    ctx.fillRect(0, 0, this.ground.width, this.ground.height);
    this.transform(ctx);
    for (const cell of cells) {
      const iso = worldToIso(cell);
      if (!cell.explored && !cell.visible) {
        diamond(ctx, iso.x, iso.y);
        ctx.fillStyle = '#1c2526';
        ctx.fill();
        continue;
      }
      drawSprite(ctx, this.sprites.terrain(cell.tileType, noise(cell.x, cell.y) % 8), iso.x, iso.y);
      terrainTransitions(ctx, cell, this.cells, iso.x, iso.y);
      if (!cell.visible) {
        diamond(ctx, iso.x, iso.y);
        ctx.fillStyle = '#16212bcc';
        ctx.fill();
      }
      if (this.settings.grid) {
        diamond(ctx, iso.x, iso.y);
        ctx.strokeStyle = '#a5afb233';
        ctx.lineWidth = 0.7 / this.camera.zoom;
        ctx.stroke();
      }
    }
    this.stats.terrainBuilds++;
  }
  render(now: number, time: number) {
    const start = performance.now(),
      ctx = this.canvas.getContext('2d');
    if (!ctx || !this.world) return;
    const dt = this.previousTime === null ? 0 : (now - this.previousTime) / 1000;
    this.previousTime = now;
    this.positions.clear();
    for (const actor of this.actors) {
      const p = interpolateMotion(actor.entity.motion ?? [], time, actor.entity),
        old = actor.position,
        dx = p.x - old.x,
        dy = p.y - old.y;
      actor.moving = Math.hypot(dx, dy) > 0.00001;
      if (actor.moving)
        actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      actor.position = p;
      if (permittedPosition(this.cells, p)) this.positions.set(actor.entity.id, p);
    }
    if (this.settings.follow) {
      const id =
        this.selection?.entityId ?? this.world.observer?.id ?? this.world.zombieObservers?.[0]?.id;
      const p = id ? this.positions.get(id) : undefined;
      if (p) this.camera.center(p, true);
    }
    this.camera.advance(dt);
    const cells = this.visibleCells(),
      key = `${this.revision}:${this.camera.x.toFixed(3)}:${this.camera.y.toFixed(3)}:${this.camera.zoom}:${this.settings.grid}`;
    if (key !== this.groundKey) {
      this.rebuildGround(cells);
      this.groundKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.ground, 0, 0);
    this.transform(ctx);
    this.entries.length = 0;
    this.drawn.length = 0;
    for (const entry of this.objects)
      if (this.inViewport(this.camera.toScreen(entry))) this.entries.push(entry);
    for (const actor of this.actors)
      if (
        this.positions.has(actor.entity.id) &&
        this.inViewport(this.camera.toScreen(actor.position))
      )
        this.entries.push({
          ...actor.position,
          layer: 3,
          id: actor.entity.id,
          actor,
          entity: actor.entity,
        });
    const combat = this.combatEffects.active(time, this.cells, now);
    for (const effect of combat)
      if (
        effect.event.type === 'death' &&
        !this.actors.some((a) => a.entity.id === effect.event.actor.id)
      )
        this.entries.push({
          ...effect.event.actor,
          layer: 3,
          id: `death:${effect.event.id}`,
          death: effect,
        });
    if (this.settings.roofs) {
      const occupants = [...this.positions.values(), ...combat.map((e) => e.event.actor)];
      for (const group of this.roofs)
        if (!roofCutaway(group, this.selection?.tile ?? this.hover, occupants))
          for (const cell of group.tiles)
            if (this.inViewport(this.camera.toScreen(cell)))
              this.entries.push({
                x: cell.x,
                y: cell.y,
                layer: 4,
                id: `roof:${cellKey(cell.x, cell.y)}`,
                roof: { cell, group },
              });
    }
    this.entries.sort(compareDepth);
    // Loot is ground-level and permission-filtered independently of decoration.
    for (const cell of cells)
      if (cell.visible && cell.items.length) {
        const p = worldToIso(cell);
        drawSprite(ctx, this.sprites.loot(cell.items[0].type), p.x, p.y);
      }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const entry of this.entries) {
      const p = worldToIso(entry);
      if (entry.roof) {
        drawRoof(ctx, entry.roof.cell, entry.roof.group);
      } else if (entry.death) {
        const { event, progress } = entry.death;
        ctx.save();
        ctx.globalAlpha = 1 - progress * 0.7;
        drawSprite(
          ctx,
          this.sprites.actor(
            event.actor.kind === 'zombie',
            1,
            Math.min(3, Math.floor(progress * 4)),
            hash(event.actor.id) % 6,
            progress > 0.35,
            'dying',
          ),
          p.x,
          p.y,
        );
        ctx.restore();
      } else if (entry.actor) {
        const a = entry.actor,
          dead = (a.entity.actor?.health ?? 1) <= 0;
        shadow(ctx, p.x, p.y);
        const frame =
          a.moving && !reduced
            ? Math.floor(
                time * (a.entity.symbol === 'Z' ? 5 : 8) + (noise(0, 0, hash(a.entity.id)) % 4),
              ) % 4
            : 0;
        const attack = combat.find(
          (e) => e.event.type === 'attack' && e.event.actor.id === a.entity.id,
        );
        const facing = attack?.event.target
          ? direction(attack.event.target.x - entry.x, attack.event.target.y - entry.y)
          : a.facing;
        drawSprite(
          ctx,
          this.sprites.actor(
            a.entity.symbol === 'Z',
            facing,
            attack ? Math.floor(attack.progress * 4) : frame,
            hash(a.entity.id) % 6,
            dead,
            attack ? 'attack' : 'idle',
          ),
          p.x,
          p.y,
        );
        if (attack?.event.weapon === 'gun' && attack.progress < 0.25) {
          ctx.fillStyle = P.loot;
          ctx.fillRect(p.x + (facing === 1 ? 17 : -20), p.y - 23, 5, 3);
        }
        if (attack) {
          ctx.strokeStyle = '#c8ad7180';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 20, 15, attack.progress, attack.progress + 0.7);
          ctx.stroke();
        }
        if (a.damageUntil > now) damage(ctx, p.x, p.y, a.damageUntil - now);
      } else if (entry.cell && !entry.entity && !entry.vegetation) {
        const transparent = this.actors.some(
          (a) =>
            this.positions.has(a.entity.id) &&
            a.position.x + a.position.y < entry.x + entry.y &&
            Math.abs(worldToIso(a.position).x - p.x) < 38 &&
            worldToIso(a.position).y > p.y - 42 &&
            worldToIso(a.position).y < p.y + 16,
        );
        drawBuilding(ctx, entry.cell, this.cells, p.x, p.y, transparent);
      } else {
        ctx.save();
        if (entry.cell && !entry.cell.visible) ctx.globalAlpha = 0.28;
        shadow(ctx, p.x, p.y, true);
        const name = entry.vegetation
          ? 'Bush'
          : (entry.entity?.name ?? (entry.entity?.symbol === 'V' ? 'Car body' : 'Cabinet'));
        drawSprite(
          ctx,
          entry.vehicle
            ? this.sprites.vehicle(entry.vehicle.horizontal)
            : this.sprites.object(name, hash(entry.id) % 3),
          p.x,
          p.y,
        );
        ctx.restore();
      }
      if (entry.entity) this.drawn.push(entry);
    }
    for (const { event, progress } of combat)
      if (event.type === 'attack' && event.target && (event.damage ?? 0) > 0) {
        const p = worldToIso(event.target);
        damage(ctx, p.x, p.y, (1 - progress) * 250);
      }
    if (this.settings.trails) {
      ctx.strokeStyle = P.survivor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      for (const a of this.actors) {
        ctx.beginPath();
        let started = false;
        for (const sample of a.entity.motion ?? []) {
          if (!permittedPosition(this.cells, sample)) {
            started = false;
            continue;
          }
          const p = worldToIso(sample);
          if (started) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
          started = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const dpr = this.canvas.width / this.camera.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    atmosphere(ctx, this.camera.width, this.camera.height, this.settings, now, reduced);
    this.overlays(ctx, cells);
    this.stats.tiles = cells.length;
    this.stats.actors = this.entries.filter((e) => e.actor).length;
    this.stats.objects = this.entries.length - this.stats.actors;
    this.stats.frameMs = performance.now() - start;
    if (this.settings.debug) {
      ctx.fillStyle = '#161d20dd';
      ctx.fillRect(8, 8, 300, 25);
      ctx.fillStyle = '#d0d3bd';
      ctx.font = '12px monospace';
      ctx.fillText(
        `${this.stats.tiles} tiles / ${this.stats.actors} actors / ${this.sprites.size} sprites / ${this.stats.frameMs.toFixed(1)}ms`,
        16,
        25,
      );
    }
  }
  private overlays(ctx: CanvasRenderingContext2D, cells: ViewCell[]) {
    const mark = (tile: Point, color: string) => {
      const p = this.camera.toScreen(tile);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      diamond(ctx);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.stroke();
      ctx.restore();
    };
    if (this.hover) mark(this.hover, '#c8ad7177');
    if (this.selection && !this.selection.entityId) mark(this.selection.tile, P.loot);
    if (this.selection?.entityId) {
      const p = this.positions.get(this.selection.entityId);
      if (p) mark(p, P.survivor);
    }
    if (this.settings.sight) {
      ctx.strokeStyle = '#a5afb2aa';
      ctx.lineWidth = 1;
      for (const c of cells)
        if (c.visible) {
          const p = this.camera.toScreen(c);
          const corners = [
            [-32, 0],
            [0, -16],
            [32, 0],
            [0, 16],
          ];
          const neighbors = [
            [-1, 0],
            [0, -1],
            [1, 0],
            [0, 1],
          ];
          for (let i = 0; i < 4; i++)
            if (!this.cells.get(cellKey(c.x + neighbors[i][0], c.y + neighbors[i][1]))?.visible) {
              ctx.beginPath();
              ctx.moveTo(
                p.x + corners[i][0] * this.camera.zoom,
                p.y + corners[i][1] * this.camera.zoom,
              );
              ctx.lineTo(
                p.x + corners[(i + 1) % 4][0] * this.camera.zoom,
                p.y + corners[(i + 1) % 4][1] * this.camera.zoom,
              );
              ctx.stroke();
            }
        }
    }
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    for (const entry of this.drawn) {
      if (!entry.actor) continue;
      const p = this.camera.toScreen(entry);
      if (this.settings.names) {
        const name = entry.entity?.name ?? 'Unknown';
        const w = ctx.measureText(name).width;
        ctx.fillStyle = '#161d20dd';
        ctx.fillRect(p.x - w / 2 - 4, p.y - 48 * this.camera.zoom - 13, w + 8, 15);
        ctx.fillStyle = '#d0d3bd';
        ctx.fillText(name, p.x, p.y - 48 * this.camera.zoom - 2);
      }
      if (this.settings.health && entry.entity?.actor) {
        const a = entry.entity.actor;
        ctx.fillStyle = P.charcoal;
        ctx.fillRect(p.x - 13, p.y - 43 * this.camera.zoom, 26, 3);
        ctx.fillStyle = a.kind === 'survivor' ? P.survivor : P.zombie;
        ctx.fillRect(
          p.x - 13,
          p.y - 43 * this.camera.zoom,
          26 * Math.max(0, a.health / a.maxHealth),
          3,
        );
      }
    }
    if (this.settings.coordinates && this.hover) {
      const p = this.camera.toScreen(this.hover);
      ctx.fillStyle = P.loot;
      ctx.fillText(`${this.hover.x}, ${this.hover.y}`, p.x, p.y + 24 * this.camera.zoom);
    }
    ctx.textAlign = 'start';
  }
  hit(screen: Point): WorldHit | null {
    const tile = this.camera.pick(screen);
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const e = this.drawn[i],
        p = this.camera.toScreen(e),
        z = this.camera.zoom;
      if (!permittedPosition(this.cells, e)) continue;
      if (
        Math.abs(screen.x - p.x) < (e.vehicle ? 52 : e.actor ? 15 : 25) * z &&
        screen.y > p.y - (e.actor ? 43 : 42) * z &&
        screen.y < p.y + 6 * z
      )
        return {
          tile: {
            x: Math.round(e.vehicle ? e.entity!.x : e.x),
            y: Math.round(e.vehicle ? e.entity!.y : e.y),
          },
          entityId: e.id,
        };
    }
    return this.cells.has(cellKey(tile.x, tile.y)) ? { tile } : null;
  }
}
function hash(text: string) {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (Math.imul(n, 31) + text.charCodeAt(i)) >>> 0;
  return n;
}

function direction(dx: number, dy: number) {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
}
