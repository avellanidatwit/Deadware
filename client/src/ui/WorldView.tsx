import { interpolateMotion } from './motion.js';
import { useEffect, useRef, useState } from 'react';
import type { WorldResponse } from '../../../shared/src/types/api.js';

import { ActionHistory } from './ActionHistory.js';
import { drawWorld } from './worldRenderer.js';

function Meter({label, value, max = 100}: {label: string; value: number; max?: number}) {
  return <div className={`stat-meter ${label.toLowerCase()}`}><div className="meter-label"><span>{label}</span><span>{Math.floor(value)} / {max}</span></div><progress aria-label={label} value={value} max={max}/></div>;
}
const terrain = { empty: 'Open ground', road: 'Road', buildingWall: 'Building wall', buildingFloor: 'Building floor', door: 'Closed door', openDoor: 'Open door' };
const legend = [['#79e5ab','S - Survivor'],['#ef7777','Z - Zombie'],['#b594d6','C - Container / V - Car'],['#a38c70','F - Furniture'],['#f1d878','* - Floor items'],['#68717c','Road'],['#385849','Open ground'],['#acbac6','Building wall'],['#657986','Building floor'],['#e6bd65','Closed door'],['#8ab39b','Open door'],['#080c0d','Unexplored'],['#41464a','Explored, out of sight'],['#f06464','Sight boundary']];
const duration = (seconds: number | null) => seconds == null ? 'Unknown' : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
export function WorldView({world, allZombies = false}: {world: WorldResponse | null; allZombies?: boolean}) {
  const latest = useRef<{world: WorldResponse; received: number} | null>(null);
  const displayed = useRef(new Map<string, {x:number;y:number}>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const [point, setPoint] = useState<{x:number;y:number} | null>(null);
  const [hoveredZombie, setHoveredZombie] = useState('');
  const observer: WorldResponse['observer'] | undefined = allZombies ? world?.zombieObservers?.find(zombie => zombie.id === hoveredZombie) : world?.observer;
  const cell = point ? world?.cells.find(cell => cell.x === point.x && cell.y === point.y) : null;
  useEffect(() => {
    latest.current = world ? {world, received: performance.now()} : null;
  }, [world]);
  useEffect(() => {
    let frame = 0;
    function render(now: number) {
      const snapshot = latest.current, context = canvas.current?.getContext('2d');
      if (snapshot && context) {
        const {world, received} = snapshot;
        const cells = new Map(world.cells.map(cell => [`${cell.x},${cell.y}`, cell]));
        const time = Math.min(world.time ?? 0, (world.time ?? 0) - world.pollMs / 1000 + (now-received)/1000);
        const positions = new Map<string,{x:number;y:number}>();
        for(const cell of world.cells) if(cell.visible) for(const entity of cell.entities) {
          if(entity.symbol==='S' || entity.symbol==='Z') positions.set(entity.id,interpolateMotion(entity.motion ?? [],time,entity));
        }
        displayed.current=positions;
        drawWorld(context, {width:world.width,height:world.height,getCell:(x,y)=>cells.get(`${x},${y}`)??null},
          {canSee:(x,y)=>cells.get(`${x},${y}`)?.visible??false,hasExplored:(x,y)=>cells.get(`${x},${y}`)?.explored??false}, positions);
      }
      frame=requestAnimationFrame(render);
    }
    frame=requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);
  function inspect(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!world) return;
    const target = event.currentTarget, rect = target.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left - target.clientLeft) / target.clientWidth * world.width);
    const y = Math.floor((event.clientY - rect.top - target.clientTop) / target.clientHeight * world.height);
    if (allZombies) {
      const px=(event.clientX-rect.left-target.clientLeft)/target.clientWidth*world.width-0.5;
      const py=(event.clientY-rect.top-target.clientTop)/target.clientHeight*world.height-0.5;
      const hit=[...displayed.current].find(([id,p])=>world.zombieObservers?.some(z=>z.id===id) && Math.abs(p.x-px)<0.4 && Math.abs(p.y-py)<0.4);
      if(hit) setHoveredZombie(hit[0]);
    }
    setPoint(x >= 0 && y >= 0 && x < world.width && y < world.height ? {x,y} : null);
  }
  return <div className="layout"><div className="world-column"><div className="map">
    <canvas ref={canvas} width={(world?.width ?? 50)*16} height={(world?.height ?? 50)*16} tabIndex={0} role="img" aria-label="World grid" aria-describedby="tile-description"
      onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={() => setPoint(null)} onKeyDown={event => {
        if (!world || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(event.key)) return;
        event.preventDefault(); if (event.key === 'Escape') {setPoint(null); return;}
        const position = point ?? observer ?? {x:0,y:0};
        setPoint({x:Math.max(0,Math.min(world.width-1,position.x+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0))),y:Math.max(0,Math.min(world.height-1,position.y+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)))});
      }}/></div>
    <section className="map-inspector"><div className="inspector-topline"><span className="eyebrow">Tile information</span><span>{cell && `(${cell.x}, ${cell.y})`}</span></div>
      <h2>{cell ? cell.explored ? terrain[cell.tileType] : 'Unexplored tile' : 'Inspect the world'}</h2>
      <p id="tile-description">{!cell ? 'Hover or tap a tile to inspect it. Use arrow keys when the grid is focused.' : !cell.explored ? 'Terrain and occupants are unknown.' : !cell.visible ? 'Previously explored; occupants are outside current sight.' : 'Currently visible.'}</p>
      <div id="tile-contents">{!allZombies && cell?.visible && cell.entities.map(entity => <article className="inspect-actor" key={entity.id}><h3>{entity.actor?.name ?? entity.name ?? entity.symbol}</h3>{entity.actor && <><p>{entity.actor.kind} - Owner: {entity.actor.ownerName}</p><Meter label="Health" value={entity.actor.health} max={entity.actor.maxHealth}/><p>Kills: {entity.actor.kills} - Time alive: {duration(entity.actor.aliveSeconds)}</p></>}</article>)}</div>
      {cell?.visible && cell.items.length > 0 && <p>Floor items: {cell.items.map(item => item.name).join(', ')}</p>}
    </section>
    {observer?.kind === 'survivor' && <ActionHistory key={observer.id} events={observer.history ?? []}/>}
    </div><aside aria-label="Entity status and grid key"><section className="status-panel entity-card">
      <div className="identity-row"><span className="entity-avatar" data-kind={observer?.kind}>{observer?.kind === 'zombie' ? 'Z' : 'S'}</span><div className="identity-copy"><span className="eyebrow">{observer?.kind ?? 'Your entity'}</span><h2>{observer?.name ?? (allZombies ? 'Hover over a zombie' : 'Select an entity')}</h2><p id="owner-name">{observer && `Owner: ${observer.ownerName}`}</p></div><span className="life-badge" data-state={observer && observer.health > 0 ? 'alive' : 'dead'}>{observer ? observer.health > 0 ? 'Alive' : 'Dead' : 'Waiting'}</span></div>
      {observer && <><dl className="entity-facts"><div><dt>Position</dt><dd>{observer.x.toFixed(1)}, {observer.y.toFixed(1)}</dd></div><div><dt>Kills</dt><dd>{observer.kills}</dd></div><div><dt>Time alive</dt><dd>{duration(observer.aliveSeconds)}</dd></div></dl>
      <Meter label="Health" value={observer.health} max={observer.maxHealth}/>
      {observer.kind === 'survivor' && <><Meter label="Stamina" value={observer.stamina ?? 0}/><Meter label="Hunger" value={observer.hunger ?? 0}/><Meter label="Thirst" value={observer.thirst ?? 0}/><p className="needs-hint">Lower hunger and thirst are better.</p>
      <div className="inventory-heading"><h3>Inventory</h3><span>{observer.inventory?.length ?? 0} / 5</span></div><ul className="inventory-grid">{Array.from({length:5},(_,i) => {const item=observer.inventory?.[i]; return <li key={i} className={`inventory-slot ${item ? `item-${item.type}` : 'empty-slot'}`}><span className="item-name">{item?.name ?? 'Empty'}</span><span className="item-category">{item && (item.id === observer.equippedItemId || item.id === observer.equippedArmorId) ? 'Equipped' : item?.type ?? `Slot ${i+1}`}</span></li>;})}</ul>
      {observer.combat && <div className="equipment-stats"><h3>Equipment stats</h3>
        <dl className="entity-facts"><div><dt>Damage</dt><dd>{observer.combat.damage} ({observer.combat.baseDamage} base + {observer.combat.weaponBonus} weapon)</dd></div>
        <div><dt>Armor</dt><dd>{observer.combat.armor} blocked per hit</dd></div>
        <div><dt>Attack range</dt><dd>{observer.combat.attackRange} tiles</dd></div></dl>
        <p>Weapon: {observer.inventory?.find(item => item.id === observer.equippedItemId)?.name ?? 'Unarmed'}</p>
        <p>Armor: {observer.inventory?.find(item => item.id === observer.equippedArmorId)?.name ?? 'None equipped'}</p>
        {observer.inventory?.find(item => item.id === observer.equippedItemId)?.type === 'gun' && <p>Melee damage: {observer.combat.meleeDamage}. Shooting requires loaded ammunition.</p>}
      </div>}
      {observer.inventory?.some(item => item.type === 'gun') && <div className="ammo-row"><span>Loaded ammunition</span><strong>{observer.ammo ?? 0} / {observer.combat?.magazineCapacity ?? 6}</strong></div>}<p className="status-label">On this tile</p><p>{observer.floor?.map(item=>item.name).join(', ') || 'Nothing underfoot'}</p></>}
      </>}
    </section><section className="status-panel"><h2>Grid key</h2><ul>{legend.map(([color,label])=><li key={label}><span className="swatch" style={{background:color}}/>{label}</li>)}</ul></section></aside></div>;
}
