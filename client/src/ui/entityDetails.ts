import type { Item } from '../../../shared/src/types/world.js';
import type { PublicActor, ViewCell, WorldSnapshot } from '../../../shared/src/types/world.js';

const get = <T extends HTMLElement>(id: string) => document.querySelector<T>(id)!;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
}
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unknown';
  const total = Math.max(0, Math.floor(seconds)), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60);
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${total % 60}s` : `${total}s`;
}
function bar(label: string, value: number, max: number, tone: string): HTMLElement {
  const safeMax = Math.max(1, max), safeValue = Math.max(0, Math.min(safeMax, Number.isFinite(value) ? value : 0));
  const row = node('div', `stat-meter ${tone}`), header = node('div', 'meter-label');
  header.append(node('span', '', label)); header.append(node('span', 'meter-value', `${Math.floor(safeValue)} / ${safeMax}`));
  const progress = node('progress'); progress.max = safeMax; progress.value = safeValue;
  progress.setAttribute('aria-label', label); progress.textContent = `${Math.round(safeValue / safeMax * 100)}%`;
  row.append(header); row.append(progress); return row;
}
function fact(list: HTMLElement, label: string, value: string): void {
  const entry = node('div'); entry.append(node('dt', '', label)); entry.append(node('dd', '', value)); list.append(entry);
}
const itemIcons: Record<Item['type'], string> = { food: '◉', water: '≋', bandage: '✚', weapon: '⚒', gun: '⌁', ammo: '▥' };
function itemCard(item: Item | undefined, equipped: boolean, slot: number): HTMLElement {
  const card = node('li', `inventory-slot ${item ? `item-${item.type}` : 'empty-slot'}`);
  card.append(node('span', 'item-icon', item ? itemIcons[item.type] : '+'));
  card.append(node('span', 'item-name', item?.name ?? 'Empty'));
  card.append(node('span', 'item-category', equipped ? 'Equipped' : item?.type ?? `Slot ${slot}`));
  card.setAttribute('aria-label', item ? `${item.name}, ${item.type}${equipped ? ', equipped' : ''}` : `Slot ${slot}, empty`);
  return card;
}
export function renderStatus(s: WorldSnapshot['observer']): void {
  get('#status-heading').textContent = s?.name ?? 'No entity selected';
  get('#entity-avatar').textContent = s ? s.kind === 'survivor' ? 'S' : 'Z' : '-';
  get('#entity-avatar').setAttribute('data-kind', s?.kind ?? 'none');
  get('#entity-type').textContent = s?.kind ?? 'Your entity';
  get('#owner-name').textContent = s ? `Owner: ${s.ownerName ?? 'Unknown'}` : 'Choose an entity to view its status';
  get('#life-state').textContent = s ? s.health > 0 ? 'Alive' : 'Dead' : 'Waiting';
  get('#life-state').setAttribute('data-state', s && s.health > 0 ? 'alive' : 'dead');
  const facts = get('#entity-facts'); facts.replaceChildren();
  if (s) {
    fact(facts, 'Position', `${s.x}, ${s.y}`); fact(facts, 'Kills', String(s.kills ?? 0));
    fact(facts, 'Time alive', duration(s.aliveSeconds));
  }
  const stats = get('#stats'); stats.replaceChildren();
  if (s) stats.append(bar('Health', s.health, s.maxHealth, s.health <= s.maxHealth * 0.3 ? 'danger' : 'health'));
  get('#status').textContent = s?.message ?? 'Create a survivor in Programming to get started.';
  get('#survivor-details').hidden = s?.kind !== 'survivor';
  const needs = get('#needs'); needs.replaceChildren();
  const inventory = get('#inventory'); inventory.replaceChildren();
  const floor = get('#floor-items'); floor.replaceChildren();
  get('#inventory-count').textContent = '';
  if (s?.kind !== 'survivor') return;
  needs.append(bar('Stamina', s.stamina ?? 0, 100, 'stamina'));
  needs.append(bar('Hunger', s.hunger ?? 0, 100, (s.hunger ?? 0) >= 70 ? 'danger' : 'hunger'));
  needs.append(bar('Thirst', s.thirst ?? 0, 100, (s.thirst ?? 0) >= 70 ? 'danger' : 'thirst'));
  get('#ammo-count').textContent = `${s.ammo ?? 0} / 6 rounds`;
  get('#inventory-count').textContent = `${s.inventory?.length ?? 0} / 5`;
  for (let i = 0; i < 5; i++) {
    const item = s.inventory?.[i]; inventory.append(itemCard(item, !!item && item.id === s.equippedItemId, i + 1));
  }
  if (!s.floor?.length) floor.append(node('span', 'muted', 'Nothing underfoot'));
  for (const item of s.floor ?? []) floor.append(node('span', 'floor-chip', `${itemIcons[item.type]} ${item.name}`));
}
const terrain: Record<ViewCell['tileType'], [string, string]> = {
  empty: ['Open ground', 'Open terrain that entities can cross.'], road: ['Road', 'A street through the city.'],
  buildingWall: ['Building wall', 'Blocks movement and sight.'], buildingFloor: ['Building floor', 'Interior terrain. Furniture may block movement.'],
  door: ['Closed door', 'Blocks movement and sight until opened.'], openDoor: ['Open door', 'Allows movement and sight.'],
};
export function tileAtPointer(canvas: HTMLCanvasElement, data: WorldSnapshot, clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const borderX = canvas.clientLeft || 0, borderY = canvas.clientTop || 0;
  const width = rect.width - borderX * 2, height = rect.height - borderY * 2;
  if (width <= 0 || height <= 0) return null;
  const x = Math.floor((clientX - rect.left - borderX) / width * data.width);
  const y = Math.floor((clientY - rect.top - borderY) / height * data.height);
  return x >= 0 && y >= 0 && x < data.width && y < data.height ? { x, y } : null;
}
function actorCard(actor: PublicActor): HTMLElement {
  const card = node('article', 'inspect-actor');
  const heading = node('div', 'inspect-actor-heading');
  heading.append(node('span', `actor-symbol ${actor.kind}`, actor.kind === 'survivor' ? 'S' : 'Z'));
  heading.append(node('h3', '', actor.name)); card.append(heading);
  card.append(node('p', 'muted', `${actor.kind === 'survivor' ? 'Survivor' : 'Zombie'} · Owner: ${actor.ownerName}`));
  card.append(bar('Health', actor.health, actor.maxHealth, 'health'));
  const facts = node('dl', 'entity-facts'); fact(facts, 'Kills', String(actor.kills)); fact(facts, 'Time alive', duration(actor.aliveSeconds)); card.append(facts);
  return card;
}
export function renderInspection(cell: ViewCell | null): void {
  const details = get('#tile-contents'); details.replaceChildren();
  get('#tile-coordinate').textContent = cell ? `(${cell.x}, ${cell.y})` : '';
  get('#tile-heading').textContent = cell ? cell.explored ? terrain[cell.tileType][0] : 'Unexplored tile' : 'Inspect the world';
  get('#tile-description').textContent = !cell ? 'Hover over a tile to see its terrain and visible occupants. Tap on touchscreens, or focus the grid and use arrow keys.'
    : !cell.explored ? 'This tile has not been seen. Its terrain and occupants are unknown.'
    : `${terrain[cell.tileType][1]}${cell.visible ? '' : ' Previously explored; occupants are outside current sight.'}`;
  if (!cell?.visible) return;
  for (const entity of cell.entities) {
    if (entity.actor) details.append(actorCard(entity.actor));
    else details.append(node('p', 'terrain-occupant', entity.symbol === 'V' ? 'Car body · blocks movement' : `${entity.name ?? (entity.symbol === 'C' ? 'Container' : 'Furniture')} · ${entity.symbol === 'C' ? 'searchable storage' : 'blocks movement'}`));
  }
}
export function setupInspector(canvas: HTMLCanvasElement) {
  let snapshot: WorldSnapshot | undefined, selected: { x: number; y: number } | null = null;
  const render = () => renderInspection(snapshot && selected ? snapshot.cells[selected.y * snapshot.width + selected.x] ?? null : null);
  const point = (event: PointerEvent) => {
    if (!snapshot) return;
    selected = tileAtPointer(canvas, snapshot, event.clientX, event.clientY); render();
  };
  canvas.addEventListener('pointermove', point); canvas.addEventListener('pointerdown', point);
  canvas.addEventListener('pointerleave', () => { selected = null; render(); });
  canvas.addEventListener('keydown', event => {
    if (!snapshot || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') selected = null;
    else {
      selected ??= { x: snapshot.observer?.x ?? 0, y: snapshot.observer?.y ?? 0 };
      selected.x = Math.max(0, Math.min(snapshot.width - 1, selected.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
      selected.y = Math.max(0, Math.min(snapshot.height - 1, selected.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
    }
    render();
  });
  return { update(data: WorldSnapshot) { if (snapshot?.observer?.id !== data.observer?.id) selected = null; snapshot = data; render(); },
    reset() { snapshot = undefined; selected = null; render(); } };
}
