import { MotionClock } from './motion.js';
import { useEffect, useRef, useState } from 'react';
import type { WorldResponse } from '../../../shared/src/types/api.js';

import { ActionHistory } from './ActionHistory.js';
import { WorldRenderer, type WorldHit } from '../rendering/WorldRenderer.js';
import { defaultSettings, type Point, type RenderSettings } from '../rendering/renderConfig.js';

function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div className={`stat-meter ${label.toLowerCase()}`}>
      <div className="meter-label">
        <span>{label}</span>
        <span>
          {Math.floor(value)} / {max}
        </span>
      </div>
      <progress aria-label={label} value={value} max={max} />
    </div>
  );
}
const terrain = {
  empty: 'Open ground',
  road: 'Road',
  buildingWall: 'Building wall',
  buildingFloor: 'Building floor',
  door: 'Closed door',
  openDoor: 'Open door',
};
const legend = [
  ['#75a99a', 'Upright silhouette - Survivor'],
  ['#a26b67', 'Stooped silhouette - Zombie'],
  ['#c8ad71', 'Supplies / searchable storage'],
  ['#444c4a', 'Cracked pavement'],
  ['#53615d', 'Open ground'],
  ['#a4a18a', 'Masonry / interior'],
  ['#1c2526', 'Unexplored'],
  ['#23303a', 'Remembered terrain'],
];
const duration = (seconds: number | null) =>
  seconds == null ? 'Unknown' : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
export function WorldView({
  world,
  allZombies = false,
}: {
  world: WorldResponse | null;
  allZombies?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<WorldRenderer | null>(null);
  const clock = useRef(new MotionClock());
  const drag = useRef<{ start: Point; last: Point; moved: boolean } | null>(null);
  const [hover, setHover] = useState<WorldHit | null>(null);
  const [selection, setSelection] = useState<WorldHit | null>(null);
  const [settings, setSettings] = useState<RenderSettings>({ ...defaultSettings });
  const [hoveredZombie, setHoveredZombie] = useState('');
  const inspectedId = selection?.entityId ?? (!selection ? hover?.entityId : undefined);
  const actorCell = inspectedId
    ? world?.cells.find(
        (cell) => cell.visible && cell.entities.some((entity) => entity.id === inspectedId),
      )
    : undefined;
  const point = actorCell ?? selection?.tile ?? hover?.tile ?? null;
  const observer: WorldResponse['observer'] | undefined = allZombies
    ? world?.zombieObservers?.find((zombie) => zombie.id === hoveredZombie)
    : world?.observer;
  const rawCell = point
    ? world?.cells.find((cell) => cell.x === point.x && cell.y === point.y)
    : null;
  const remembered = point ? renderer.current?.cells.get(`${point.x},${point.y}`) : null;
  // Always use current authoritative visibility/occupants, even before the renderer effect runs.
  const cell = rawCell
    ? {
        ...rawCell,
        tileType:
          !rawCell.visible && rawCell.explored && remembered?.explored
            ? remembered.tileType
            : rawCell.tileType,
      }
    : null;
  useEffect(() => {
    const target = canvas.current!;
    const view = new WorldRenderer(target);
    renderer.current = view;
    const resize = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      view.resize(box.width, box.height);
    });
    resize.observe(target);
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      view.camera.zoomAt(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        Math.exp(-event.deltaY * 0.0015),
      );
      setSettings((s) => (s.follow ? { ...s, follow: false } : s));
    }
    target.addEventListener('wheel', wheel, { passive: false });
    let frame = 0;
    function render(now: number) {
      view.render(now, clock.current.advance(now));
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      target.removeEventListener('wheel', wheel);
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    if (world) {
      clock.current.receive(world.time ?? 0, performance.now(), world.pollMs);
      renderer.current?.setSnapshot(world);
    } else {
      clock.current = new MotionClock();
      setHover(null);
      setSelection(null);
    }
  }, [world]);
  useEffect(() => {
    if (renderer.current) renderer.current.settings = settings;
  }, [settings]);
  function local(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  function inspect(p: Point, select = false) {
    const view = renderer.current;
    if (!view || !world) return;
    const hit = view.hit(p);
    view.hover = hit?.tile ?? null;
    setHover((old) =>
      old?.tile.x === hit?.tile.x && old?.tile.y === hit?.tile.y && old?.entityId === hit?.entityId
        ? old
        : hit,
    );
    if (allZombies && hit?.entityId && world.zombieObservers?.some((z) => z.id === hit.entityId))
      setHoveredZombie(hit.entityId);
    if (select) {
      view.selection = hit;
      setSelection(hit);
    }
  }
  function toggle(key: keyof RenderSettings) {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  }
  return (
    <div className="world-stage">
      <div className="world-controls" aria-label="World camera and display">
        <div className="camera-buttons">
          <button type="button" onClick={() => renderer.current?.resetCamera()}>
            Reset camera
          </button>
          <button
            type="button"
            onClick={() =>
              renderer.current?.camera.zoomAt(
                { x: renderer.current.camera.width / 2, y: renderer.current.camera.height / 2 },
                1.25,
              )
            }
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() =>
              renderer.current?.camera.zoomAt(
                { x: renderer.current.camera.width / 2, y: renderer.current.camera.height / 2 },
                0.8,
              )
            }
            aria-label="Zoom out"
          >
            &#8722;
          </button>
          <label>
            <input type="checkbox" checked={settings.follow} onChange={() => toggle('follow')} />
            Follow selected
          </label>
        </div>
        <label>
          Light
          <select
            aria-label="Ambient lighting"
            value={settings.lighting}
            onChange={(e) =>
              setSettings((s) => ({ ...s, lighting: e.target.value as RenderSettings['lighting'] }))
            }
          >
            <option value="day">Day</option>
            <option value="dusk">Dusk</option>
            <option value="night">Night</option>
          </select>
        </label>
        <label>
          Weather
          <select
            aria-label="Cosmetic weather"
            value={settings.weather}
            onChange={(e) =>
              setSettings((s) => ({ ...s, weather: e.target.value as RenderSettings['weather'] }))
            }
          >
            <option value="clear">Clear</option>
            <option value="rain">Rain</option>
            <option value="fog">Fog</option>
          </select>
        </label>
        <details className="world-overlays">
          <summary>Overlays</summary>
          <div>
            {(
              [
                'roofs',
                'grid',
                'names',
                'health',
                'sight',
                'trails',
                'coordinates',
                'debug',
              ] as const
            ).map((key) => (
              <label key={key}>
                <input type="checkbox" checked={settings[key]} onChange={() => toggle(key)} />
                {
                  {
                    roofs: 'Roofs (automatic cutaway)',
                    grid: 'Grid lines',
                    names: 'Entity names',
                    health: 'Health bars',
                    sight: 'Sight boundary',
                    trails: 'Observed movement trails',
                    coordinates: 'Coordinates',
                    debug: 'Render statistics',
                  }[key]
                }
              </label>
            ))}
          </div>
        </details>
      </div>
      <p className="camera-help">
        Drag to pan / Scroll to zoom / Click to pin an inspection / Arrow keys inspect / + and -
        zoom / 0 reset. Light and weather are cosmetic.
      </p>
      <div className="layout world-layout">
        <div className="world-column">
          <div className="map isometric-map">
            <canvas
              ref={canvas}
              tabIndex={0}
              role="img"
              aria-label="Isometric world"
              aria-describedby="tile-description"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const p = local(event);
                drag.current = { start: p, last: p, moved: false };
              }}
              onPointerMove={(event) => {
                const p = local(event),
                  d = drag.current;
                if (d) {
                  if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 4) d.moved = true;
                  if (d.moved) {
                    renderer.current?.camera.pan(p.x - d.last.x, p.y - d.last.y);
                    setSettings((s) => (s.follow ? { ...s, follow: false } : s));
                  }
                  d.last = p;
                }
                if (!d?.moved) inspect(p);
              }}
              onPointerUp={(event) => {
                if (drag.current && !drag.current.moved) inspect(local(event), true);
                drag.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerLeave={() => {
                if (!drag.current) {
                  if (renderer.current) renderer.current.hover = null;
                  setHover(null);
                }
              }}
              onKeyDown={(event) => {
                const view = renderer.current;
                if (!view || !world) return;
                if (['+', '=', '-', '0'].includes(event.key)) {
                  event.preventDefault();
                  if (event.key === '0') view.resetCamera();
                  else
                    view.camera.zoomAt(
                      { x: view.camera.width / 2, y: view.camera.height / 2 },
                      event.key === '-' ? 0.8 : 1.25,
                    );
                  return;
                }
                if (event.key === 'Escape') {
                  view.selection = null;
                  view.hover = null;
                  setSelection(null);
                  setHover(null);
                  return;
                }
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
                  return;
                event.preventDefault();
                const p = point ?? observer ?? { x: 0, y: 0 };
                const next = {
                  x: Math.max(
                    0,
                    Math.min(
                      world.width - 1,
                      Math.round(p.x) +
                        (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      world.height - 1,
                      Math.round(p.y) +
                        (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0),
                    ),
                  ),
                };
                const hit = { tile: next };
                view.selection = hit;
                setSelection(hit);
                view.camera.center(next, true);
              }}
            />
          </div>
          <section className="map-inspector">
            <div className="inspector-topline">
              <span className="eyebrow">Tile information</span>
              <span>
                {cell && `(${cell.x}, ${cell.y})`}
                {selection && (
                  <button
                    type="button"
                    onClick={() => {
                      if (renderer.current) renderer.current.selection = null;
                      setSelection(null);
                    }}
                  >
                    Clear selection
                  </button>
                )}
              </span>
            </div>
            <h2>
              {cell
                ? cell.explored
                  ? terrain[cell.tileType]
                  : 'Unexplored tile'
                : 'Inspect the world'}
            </h2>
            <p id="tile-description">
              {!cell
                ? 'Hover or click a tile or character to inspect it. Click pins the selection; Escape clears it.'
                : !cell.explored
                  ? 'Terrain and occupants are unknown.'
                  : !cell.visible
                    ? 'Previously explored; occupants are outside current sight.'
                    : 'Currently visible.'}
            </p>
            <div id="tile-contents">
              {cell?.visible &&
                cell.entities.map((entity) => (
                  <article
                    className={`inspect-actor${selection?.entityId === entity.id ? ' selected-actor' : ''}`}
                    key={entity.id}
                  >
                    <h3>{entity.actor?.name ?? entity.name ?? entity.symbol}</h3>
                    {entity.actor && (
                      <>
                        <p>
                          {entity.actor.kind} - Owner: {entity.actor.ownerName}
                        </p>
                        <Meter
                          label="Health"
                          value={entity.actor.health}
                          max={entity.actor.maxHealth}
                        />
                        <p>
                          Kills: {entity.actor.kills} - Time alive:{' '}
                          {duration(entity.actor.aliveSeconds)}
                        </p>
                      </>
                    )}
                  </article>
                ))}
            </div>
            {cell?.visible && cell.items.length > 0 && (
              <p>Floor items: {cell.items.map((item) => item.name).join(', ')}</p>
            )}
          </section>
          {observer?.kind === 'survivor' && (
            <ActionHistory key={observer.id} events={observer.history ?? []} />
          )}
        </div>
        <aside aria-label="Entity status and grid key">
          <section className="status-panel entity-card">
            <div className="identity-row">
              <span className="entity-avatar" data-kind={observer?.kind}>
                {observer?.kind === 'zombie' ? 'Z' : 'S'}
              </span>
              <div className="identity-copy">
                <span className="eyebrow">{observer?.kind ?? 'Your entity'}</span>
                <h2>
                  {observer?.name ?? (allZombies ? 'Hover over a zombie' : 'Select an entity')}
                </h2>
                <p id="owner-name">{observer && `Owner: ${observer.ownerName}`}</p>
              </div>
              <span
                className="life-badge"
                data-state={observer && observer.health > 0 ? 'alive' : 'dead'}
              >
                {observer ? (observer.health > 0 ? 'Alive' : 'Dead') : 'Waiting'}
              </span>
            </div>
            {observer && (
              <>
                <dl className="entity-facts">
                  <div>
                    <dt>Position</dt>
                    <dd>
                      {observer.x.toFixed(1)}, {observer.y.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt>Kills</dt>
                    <dd>{observer.kills}</dd>
                  </div>
                  <div>
                    <dt>Time alive</dt>
                    <dd>{duration(observer.aliveSeconds)}</dd>
                  </div>
                </dl>
                <Meter label="Health" value={observer.health} max={observer.maxHealth} />
                {observer.kind === 'survivor' && (
                  <>
                    <Meter label="Stamina" value={observer.stamina ?? 0} />
                    <Meter label="Hunger" value={observer.hunger ?? 0} />
                    <Meter label="Thirst" value={observer.thirst ?? 0} />
                    <p className="needs-hint">Lower hunger and thirst are better.</p>
                    <div className="inventory-heading">
                      <h3>Inventory</h3>
                      <span>{observer.inventory?.length ?? 0} / 5</span>
                    </div>
                    <ul className="inventory-grid">
                      {Array.from({ length: 5 }, (_, i) => {
                        const item = observer.inventory?.[i];
                        return (
                          <li
                            key={i}
                            className={`inventory-slot ${item ? `item-${item.type}` : 'empty-slot'}`}
                          >
                            <span className="item-name">{item?.name ?? 'Empty'}</span>
                            <span className="item-category">
                              {item &&
                              (item.id === observer.equippedItemId ||
                                item.id === observer.equippedArmorId)
                                ? 'Equipped'
                                : (item?.type ?? `Slot ${i + 1}`)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {observer.combat && (
                      <div className="equipment-stats">
                        <h3>Equipment stats</h3>
                        <dl className="entity-facts">
                          <div>
                            <dt>Damage</dt>
                            <dd>
                              {observer.combat.damage} ({observer.combat.baseDamage} base +{' '}
                              {observer.combat.weaponBonus} weapon)
                            </dd>
                          </div>
                          <div>
                            <dt>Armor</dt>
                            <dd>{observer.combat.armor} blocked per hit</dd>
                          </div>
                          <div>
                            <dt>Attack range</dt>
                            <dd>{observer.combat.attackRange} tiles</dd>
                          </div>
                        </dl>
                        <p>
                          Weapon:{' '}
                          {observer.inventory?.find((item) => item.id === observer.equippedItemId)
                            ?.name ?? 'Unarmed'}
                        </p>
                        <p>
                          Armor:{' '}
                          {observer.inventory?.find((item) => item.id === observer.equippedArmorId)
                            ?.name ?? 'None equipped'}
                        </p>
                        {observer.inventory?.find((item) => item.id === observer.equippedItemId)
                          ?.type === 'gun' && (
                          <p>
                            Melee damage: {observer.combat.meleeDamage}. Shooting requires loaded
                            ammunition.
                          </p>
                        )}
                      </div>
                    )}
                    {observer.inventory?.some((item) => item.type === 'gun') && (
                      <div className="ammo-row">
                        <span>Loaded ammunition</span>
                        <strong>
                          {observer.ammo ?? 0} / {observer.combat?.magazineCapacity ?? 6}
                        </strong>
                      </div>
                    )}
                    <p className="status-label">On this tile</p>
                    <p>
                      {observer.floor?.map((item) => item.name).join(', ') || 'Nothing underfoot'}
                    </p>
                  </>
                )}
              </>
            )}
            {observer?.message && <p className="current-action">{observer.message}</p>}
          </section>
          <section className="status-panel">
            <h2>Field key</h2>
            <ul>
              {legend.map(([color, label]) => (
                <li key={label}>
                  <span className="swatch" style={{ background: color }} />
                  {label}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
