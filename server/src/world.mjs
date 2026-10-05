import { Grid } from './world/grid.js';
import { Survivor } from './entities/survivor.js';
import { Zombie } from './entities/zombie.js';
import { ItemContainer } from './entities/container.js';
import { Furniture } from './entities/furniture.js';
import { Car } from './entities/car.js';
import { generateCity } from './world/city.js';
import { survivorCode } from './data/survivorProgram.js';
import { parseSurvivorScript, runSurvivorTick } from './scripting/survivorScript.js';
import { runZombieTick } from './scripting/zombieScript.js';
import { conditionLeaves } from './scripting/language/conditions.js';
import { randomUUID } from 'node:crypto';
import { hasLineOfSight } from './world/perception.js';
export const defaultZombieScript = new Zombie('default', 0, 0).program;

export function compile(script, kind) {
  if (typeof script !== 'string' || Buffer.byteLength(script) > 16384) throw new Error('Script must be text of at most 16 KiB.');
  if (script.split('\n').some(line => line.length > 512)) throw new Error('Script lines may contain at most 512 characters.');
  const program = parseSurvivorScript(script, kind, { maxRules: 100 });
  if (!program.rules.length || program.rules.some(rule => conditionLeaves(rule.condition).length > 5)) throw new Error('Use 1–100 rules and at most 5 conditions per rule.');
  return program;
}

// Versioned, trusted server saves preserve class methods, Sets and shared references.
const classes = { Grid, Survivor, Zombie, ItemContainer, Furniture, Car };
export function encode(value) {
  const objects = [], seen = new Map();
  function visit(v) {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return { ref: seen.get(v) };
    const ref = objects.length; seen.set(v, ref); objects.push(null);
    objects[ref] = v instanceof Set ? { type: 'Set', values: [...v].map(visit) }
      : Array.isArray(v) ? { type: 'Array', values: v.map(visit) }
      : { type: v.constructor.name, values: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)])) };
    return { ref };
  }
  const root = visit(value);
  return JSON.stringify({ version: 1, root, objects });
}
export function decode(text) {
  const data = JSON.parse(text);
  if (data.version !== 1) throw new Error('Unsupported save version.');
  const objects = data.objects.map(o => o.type === 'Set' ? new Set() : o.type === 'Array' ? [] : Object.create(classes[o.type]?.prototype ?? Object.prototype));
  const resolve = v => v && typeof v === 'object' ? objects[v.ref] : v;
  data.objects.forEach((o, i) => {
    if (o.type === 'Set') o.values.forEach(v => objects[i].add(resolve(v)));
    else if (o.type === 'Array') o.values.forEach(v => objects[i].push(resolve(v)));
    else for (const [k, v] of Object.entries(o.values)) objects[i][k] = resolve(v);
  });
  return resolve(data.root);
}

export class World {
  constructor(saved) {
    if (saved) this.state = decode(saved);
    else {
      const city = generateCity({ width: 50, height: 50, buildingZombieChance: 0 });
      this.state = { grid: city.grid, survivors: [], zombies: [], tick: 0, queue: [], meta: {} };
    }
    this.state.library ??= [];
    // Remove only known prototype fixtures from existing saves, not player-created survivors.
    const fixture = id => id === 'survivor-1' || id === 'zombie-1' || /^building-\d+-zombie$/.test(id);
    for (const entity of [...this.state.survivors, ...this.state.zombies]) {
      if (fixture(entity.id)) { this.state.grid.removeEntity(entity.id); delete this.state.meta[entity.id]; }
    }
    this.state.survivors = this.state.survivors.filter(e => !fixture(e.id));
    this.state.zombies = this.state.zombies.filter(e => !fixture(e.id));
    for (const entity of [...this.state.survivors, ...this.state.zombies]) entity.kills ??= 0;
    this.state.queue = this.state.queue.filter(q => q.kind === 'survivor');
    for (const entity of this.state.survivors) this.state.meta[entity.id].zombieScript ??= defaultZombieScript;
    for (const survivor of this.state.survivors) survivor.normalizeEquipment(this.state.grid);
    this.programs = new Map([...this.state.survivors, ...this.state.zombies].map(e => [e.id, compile(e.program, e.symbol === 'S' ? 'survivor' : 'zombie')]));
    this.vision();
  }
  vision() { for (const s of this.state.survivors) s.updateVision(this.state.grid); }
  entities(owner) {
    return [...this.state.survivors, ...this.state.zombies].filter(e => this.state.meta[e.id].owner === owner).map(e => ({ id: e.id, kind: e.symbol === 'S' ? 'survivor' : 'zombie', program: e.program, health: e.health, ...this.state.meta[e.id] }));
  }
  deploy(id, owner, script, zombieScript) {
    const entity = [...this.state.survivors, ...this.state.zombies].find(e => e.id === id && this.state.meta[id].owner === owner);
    if (!entity) throw Object.assign(new Error('Entity not found.'), { status: 404 });
    if (!entity.isAlive()) throw Object.assign(new Error('This entity is dead. Load its saved scripts instead.'), { status: 409 });
    if (entity instanceof Zombie && !this.state.meta[id].sourceSurvivorId) throw Object.assign(new Error('Only zombies raised from your survivors may be programmed.'), { status: 409 });
    const program = compile(script, entity.symbol === 'S' ? 'survivor' : 'zombie');
    if (zombieScript !== undefined) {
      if (!(entity instanceof Survivor)) throw new Error('Only survivors have a future zombie script.');
      compile(zombieScript, 'zombie');
      this.state.meta[id].zombieScript = zombieScript;
    }
    entity.program = script; this.programs.set(id, program);
    return { success: true, entityId: id, scriptVersion: ++this.state.meta[id].version };
  }
  inject(owner, kind, name, script, zombieScript = defaultZombieScript) {
    if (kind !== 'survivor') throw Object.assign(new Error('Zombies cannot be injected. They rise when a survivor dies.'), { status: 403 });
    if (typeof name !== 'string' || !name.trim() || name.length > 64) throw new Error('Name must contain 1–64 characters.');
    compile(script, kind);
    compile(zombieScript, 'zombie');
    const active = this.state.survivors.filter(e => e.isAlive() && this.state.meta[e.id].owner === owner).length;
    const queued = this.state.queue.filter(q => q.owner === owner).length;
    if (active + queued >= 10) throw new Error('You can have at most 10 active survivors, including queued spawns.');
    if (this.state.queue.length >= 100) throw new Error('The spawn queue is full. Try again shortly.');
    const request = { id: randomUUID(), owner, kind, name: name.trim(), script, zombieScript };
    this.state.queue.push(request);
    return { success: true, id: request.id, status: 'queued' };
  }
  removeOwner(owner) {
    const ids = new Set(Object.entries(this.state.meta).filter(([, meta]) => meta.owner === owner).map(([id]) => id));
    for (const id of ids) { this.state.grid.removeEntity(id); this.programs.delete(id); delete this.state.meta[id]; }
    this.state.survivors = this.state.survivors.filter(entity => !ids.has(entity.id));
    this.state.zombies = this.state.zombies.filter(entity => !ids.has(entity.id));
    this.state.queue = this.state.queue.filter(entry => entry.owner !== owner);
    this.state.library = this.state.library.filter(entry => entry.owner !== owner);
  }
  scripts(owner) { return this.state.library.filter(entry => entry.owner === owner); }
  programming(owner) {
    return { entities: this.entities(owner).filter(e => e.health > 0 && (e.kind === 'survivor' || e.sourceSurvivorId)),
      scripts: this.scripts(owner), queue: this.state.queue.filter(q => q.owner === owner).map(({ id, name }) => ({ id, name })),
      defaults: { script: survivorCode, zombieScript: defaultZombieScript } };
  }
  saveScript(owner, name, script, zombieScript = defaultZombieScript) {
    if (typeof name !== 'string' || !name.trim() || name.length > 64) throw new Error('Use a script name of 1-64 characters.');
    compile(script, 'survivor'); compile(zombieScript, 'zombie');
    if (this.scripts(owner).filter(entry => !entry.sourceSurvivorId).length >= 100) throw new Error('Script library is full (100 saved programs).');
    const entry = { id: randomUUID(), owner, name: name.trim(), script, zombieScript, savedAt: this.state.tick };
    this.state.library.push(entry);
    return entry;
  }
  updateScript(owner, id, name, script, zombieScript) {
    const entry = this.scripts(owner).find(entry => entry.id === id);
    if (!entry) throw Object.assign(new Error('Saved program not found.'), { status: 404 });
    if (typeof name !== 'string' || !name.trim() || name.length > 64) throw new Error('Use a script name of 1-64 characters.');
    compile(script, 'survivor'); compile(zombieScript, 'zombie');
    Object.assign(entry, { name: name.trim(), script, zombieScript });
    return entry;
  }
  deleteScript(owner, id) {
    const entry = this.scripts(owner).find(entry => entry.id === id);
    if (!entry) throw Object.assign(new Error('Saved program not found.'), { status: 404 });
    this.state.library = this.state.library.filter(item => item !== entry);
    return { success: true };
  }
  raiseDead() {
    const s = this.state;
    for (const survivor of s.survivors) {
      const meta = s.meta[survivor.id];
      if (survivor.isAlive() || meta.zombieId) continue;
      s.grid.removeEntity(survivor.id);
      const zombie = new Zombie(randomUUID(), survivor.x, survivor.y, meta.zombieScript);
      // Corpse position is authoritative. Actors may share a tile; rebirth never relocates it.
      s.grid.getCell(zombie.x, zombie.y).entities.push(zombie);
      s.zombies.push(zombie); meta.zombieId = zombie.id;
      meta.diedTick ??= s.tick;
      survivor.recordEvent(s.tick, 'Died and rose as a zombie.');
      meta.message = 'Dead. Rose as a zombie.';
      s.meta[zombie.id] = { owner: meta.owner, name: `${meta.name} (zombie)`, bornTick: s.tick, version: 1, sourceSurvivorId: survivor.id, message: 'Rose from a survivor.' };
      this.programs.set(zombie.id, compile(zombie.program, 'zombie'));
      s.library.push({ id: randomUUID(), owner: meta.owner, name: meta.name, script: survivor.program, zombieScript: meta.zombieScript, sourceSurvivorId: survivor.id, savedAt: s.tick });
    }
  }
  advance() {
    const s = this.state;
    const decisionTicks = s.timing?.decisionTicks ?? 6;
    s.tick++;
    if (s.tick % decisionTicks !== 0) return;
    const request = s.queue[0];
    if (request) {
      const positions = [];
      for (let y = 0; y < s.grid.height; y++) for (let x = 0; x < s.grid.width; x++) {
        if (s.grid.isWalkable(x, y) && !s.grid.getCell(x, y).entities.length) positions.push({ x, y });
      }
      const position = positions[Math.floor(Math.random() * positions.length)];
      if (position) {
        const entity = new Survivor(request.id, position.x, position.y, request.script);
        s.grid.addEntity(entity); s.survivors.push(entity);
        s.meta[entity.id] = { owner: request.owner, name: request.name, bornTick: s.tick, zombieScript: request.zombieScript ?? defaultZombieScript, version: 1, message: 'Injected.' };
        entity.recordEvent(s.tick, 'Injected into the world.');
        this.programs.set(entity.id, compile(entity.program, request.kind)); s.queue.shift();
      }
    }
    for (const survivor of s.survivors) s.meta[survivor.id].message = runSurvivorTick(this.programs.get(survivor.id), { survivor, survivors: s.survivors, zombies: s.zombies, grid: s.grid, tick: s.tick / decisionTicks - 1, canMove: s.tick % (decisionTicks * 2) === 0 }).message;
    for (const zombie of s.zombies) runZombieTick(zombie, this.programs.get(zombie.id), s.grid, s.survivors, s.zombies, s.tick);
    this.raiseDead();
    for (const entity of [...s.survivors, ...s.zombies]) if (!entity.isAlive()) s.meta[entity.id].diedTick ??= s.tick;
    this.vision();
  }
  snapshot(owner, entityId, ownerName = id => id, allZombies = false) {
    const s = this.state;
    const owned = [...s.survivors, ...s.zombies].filter(e => s.meta[e.id].owner === owner);
    const observers = allZombies ? owned.filter(e => e instanceof Zombie && e.isAlive()) : [];
    const observer = allZombies ? undefined : entityId ? owned.find(e => e.id === entityId) : owned.find(e => e.isAlive()) ?? owned[0];
    if (entityId && !observer) throw Object.assign(new Error('Entity not found.'), { status: 404 });
    const isSurvivor = observer instanceof Survivor;
    // Public actor details are explicitly projected. Never serialize an actor or its metadata wholesale.
    const publicActor = entity => {
      const meta = s.meta[entity.id];
      return { id: entity.id, name: meta.name, kind: entity instanceof Survivor ? 'survivor' : 'zombie',
        ownerName: ownerName(meta.owner), health: entity.health, maxHealth: entity.maxHealth, kills: entity.kills,
        aliveSeconds: Number.isFinite(meta.bornTick) ? Math.max(0, ((meta.diedTick ?? s.tick) - meta.bornTick) * (s.timing?.tickMs ?? 100) / 1000) : null };
    };
    const zombieSight = new Set();
    for (const zombie of observers) {
      const range = zombie.detectionRange;
      for (let y = Math.max(0, zombie.y - range); y <= Math.min(s.grid.height - 1, zombie.y + range); y++) {
        for (let x = Math.max(0, zombie.x - range); x <= Math.min(s.grid.width - 1, zombie.x + range); x++) {
          const key = `${x},${y}`;
          if (!zombieSight.has(key) && hasLineOfSight(s.grid, zombie, { x, y }, { range })) zombieSight.add(key);
        }
      }
    }
    const cells = [];
    for (let y = 0; y < s.grid.height; y++) for (let x = 0; x < s.grid.width; x++) {
      const cell = s.grid.getCell(x, y);
      const visible = allZombies ? zombieSight.has(`${x},${y}`) : isSurvivor ? observer.canSee(x, y) : !!observer?.isAlive() && hasLineOfSight(s.grid, observer, { x, y }, { range: observer.detectionRange });
      const explored = isSurvivor ? observer.hasExplored(x, y) : visible;
      cells.push({ x, y, visible, explored, tileType: explored ? cell.tileType : 'empty', items: visible ? cell.items : [], entities: visible ? cell.entities.map(e => ({ id: e.id, x, y, symbol: e.symbol,
        ...(e instanceof Survivor || e instanceof Zombie ? { name: s.meta[e.id].name, actor: publicActor(e) } : { name: e.name }) })) : [] });
    }
    return { tick: s.tick, width: s.grid.width, height: s.grid.height, cells,
      ...(allZombies ? { zombieObservers: observers.map(zombie => ({ ...publicActor(zombie), x: zombie.x, y: zombie.y,
        sightRange: zombie.detectionRange, message: 'Zombie program is running.' })) } : {}),
      entities: this.entities(owner).map(({ id, kind, name, health }) => ({ id, kind, name, health })),
      observer: observer ? { ...publicActor(observer),
        x: observer.x, y: observer.y, health: observer.health, maxHealth: observer.maxHealth,
        sightRange: isSurvivor ? observer.sightRange : observer.detectionRange,
        ...(isSurvivor ? { hunger: observer.hunger, thirst: observer.thirst, stamina: observer.stamina, ammo: observer.ammo, equippedItemId: observer.equippedItemId, equippedArmorId: observer.equippedArmorId, combat: observer.combatStats, inventory: observer.inventory, floor: observer.lookAtFloor(s.grid) } : {}),
        ...(isSurvivor ? { history: observer.history } : {}),
        message: !observer.isAlive() ? 'Dead. No longer acting.' : isSurvivor ? s.meta[observer.id].message : 'Zombie program is running.' } : null };
  }
}
