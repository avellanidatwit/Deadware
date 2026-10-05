import { Survivor } from '../entities/survivor.js';
import { Zombie } from '../entities/zombie.js';
import type { Grid } from '../world/grid.js';
import { spatialDistance, hasLineOfSight, type Position } from '../world/perception.js';
import type { SurvivorAction, SurvivorProgram } from '../scripting/language/types.js';
import type { ScriptContext } from '../scripting/runtime/context.js';
import { runSurvivorProgram } from '../scripting/runtime/interpreter.js';
import { executeSurvivorAction } from '../scripting/runtime/actionExecutor.js';
import { resolveTargets } from '../scripting/runtime/targetResolver.js';
import { isMovement } from '../scripting/language/actions.js';

type Actor = Survivor | Zombie;
export interface Motion { action: SurvivorAction; key: string; path: Position[]; goal?: Position; targetId?: string; stopRange: number; retryAt?: number }
const directions = { north: {x:0,y:-1}, south:{x:0,y:1}, east:{x:1,y:0}, west:{x:-1,y:0} };
const center = (p: Position): Position => ({x:Math.round(p.x), y:Math.round(p.y)});
const key = (p: Position) => `${p.x},${p.y}`;

/** Circle against tile obstacles and living actors. Actors may leave old overlapping spawns. */
export function canOccupy(grid: Grid, actor: Actor, p: Position, actors: Actor[], origin: Position = actor): boolean {
  const radius = actor.radius ?? 0.22;
  if (p.x - radius < -0.5 || p.y - radius < -0.5 || p.x + radius > grid.width - 0.5 || p.y + radius > grid.height - 0.5) return false;
  for (let y=Math.floor(p.y-radius+0.5);y<=Math.floor(p.y+radius+0.5);y++) for(let x=Math.floor(p.x-radius+0.5);x<=Math.floor(p.x+radius+0.5);x++) {
    if (grid.isWalkable(x,y)) continue;
    const dx=p.x-Math.max(x-0.5,Math.min(x+0.5,p.x)), dy=p.y-Math.max(y-0.5,Math.min(y+0.5,p.y));
    if (dx*dx+dy*dy < radius*radius-1e-9) return false;
  }
  for (const other of actors) {
    if (other===actor || !other.isAlive()) continue;
    const distance=spatialDistance(p,other), previous=spatialDistance(origin,other);
    if (distance < radius+(other.radius??0.22)-1e-8 && distance < previous-1e-8) return false;
  }
  return true;
}

/** Four-way terrain path, with physical movement between its tile-center waypoints. */
function route(context: ScriptContext, goal?: Position, stopRange=0, explore=false): Position[] {
  const actor=context.survivor, start=center(actor), grid=context.grid;
  const queue=[start], parents=new Map<string,Position | null>([[key(start),null]]);
  let destination: Position | undefined, frontier: Position | undefined;
  for(let index=0;index<queue.length;index++) {
    const p=queue[index];
    if (goal && spatialDistance(p,goal)<=stopRange+0.01 && hasLineOfSight(grid,p,goal)) {destination=p;break;}
    if (explore && actor instanceof Survivor && index>0) {
      if(grid.getCell(p.x,p.y)?.tileType==='buildingFloor' && !actor.hasVisited(p.x,p.y)) {destination=p;break;}
      if(!frontier && Object.values(directions).some(d=>grid.isValidPosition(p.x+d.x,p.y+d.y) && !actor.hasExplored(p.x+d.x,p.y+d.y))) frontier=p;
    }
    for(const d of Object.values(directions)) {
      const next={x:p.x+d.x,y:p.y+d.y};
      if(parents.has(key(next)) || !grid.isWalkable(next.x,next.y)) continue;
      if(actor instanceof Survivor && !actor.hasExplored(next.x,next.y)) continue;
      // Route around stationary crowds; the destination's interaction radius keeps actors apart.
      if([...(context.survivors??[]), ...context.zombies].some(other=>other!==actor && other.isAlive() && spatialDistance(next,other)<0.44)) continue;
      parents.set(key(next),p); queue.push(next);
    }
  }
  destination ??= frontier;
  if(!destination) return [];
  const path:Position[]=[];
  for(let p:Position|null=destination;p;p=parents.get(key(p))??null) path.unshift(p);
  // First recenter in the current walkable tile. Never cut diagonally through a corner.
  if(spatialDistance(actor,path[0])<0.001) path.shift();
  return path;
}

function plan(context: ScriptContext, action: SurvivorAction): Omit<Motion,'action'|'key'> {
  const actor=context.survivor, grid=context.grid;
  const empty={path:[] as Position[],stopRange:0};
  if(action.type==='move') {
    const d=directions[action.direction];
    // Directional commands keep moving until blocked or replaced by a decision.
    return {path:[{x:actor.x+d.x,y:actor.y+d.y}],stopRange:0};
  }
  if(action.type==='wander' || action.type==='explore') {
    if(actor instanceof Survivor) return {path:route(context,undefined,0,true),stopRange:0};
    const choices=Object.values(directions).map(d=>({x:Math.round(actor.x)+d.x,y:Math.round(actor.y)+d.y})).filter(p=>grid.isWalkable(p.x,p.y));
    return {path:choices.length?[choices[Math.floor(Math.random()*choices.length)]]:[],stopRange:0};
  }
  let target: (Position & {id?:string}) | undefined, stopRange=0, fleeing=false;
  if(action.type==='chase') {target=resolveTargets({type:'survivor',selector:'nearest',range:action.range},context)[0];stopRange=0.9;}
  else if(action.type==='moveAway') {target=resolveTargets({type:'zombie',selector:'nearest'},context)[0];fleeing=true;}
  else if(action.type==='moveToContainer') {target=resolveTargets({type:'container',selector:'nearest',range:action.range},context)[0];stopRange=1;}
  else if(action.type==='targeted') {
    target=resolveTargets(action.target,context)[0];
    fleeing=action.verb==='MOVE_AWAY';
    stopRange=['survivor','zombie','container','car','door'].includes(action.target.type)?0.9:0;
    if(action.verb==='PATROL' && actor instanceof Survivor && target) {
      const destination=key(target);
      if(actor.patrolState?.destination!==destination) actor.patrolState={destination,returning:false};
      const home=actor.memory.home;
      if(home) {
        const aim=actor.patrolState.returning?home:target;
        if(spatialDistance(actor,aim)<0.1) actor.patrolState.returning=!actor.patrolState.returning;
        target=actor.patrolState.returning?home:target;
      }
    }
    if(!target && action.verb==='SEARCH') return {path:route(context,undefined,0,true),stopRange:0};
  }
  if(!target) return empty;
  const targetId = target instanceof Survivor || target instanceof Zombie ? target.id : undefined;
  if(fleeing) {
    const start=center(actor);
    const choices=Object.values(directions).map(d=>({x:start.x+d.x,y:start.y+d.y})).filter(p=>grid.isWalkable(p.x,p.y));
    choices.sort((a,b)=>spatialDistance(b,target!)-spatialDistance(a,target!));
    return {path:choices.length?route(context,choices[0]):[],stopRange:0};
  }
  if(spatialDistance(actor,target)<=stopRange+0.01) return {...empty,targetId,goal:{x:target.x,y:target.y},stopRange};
  // Interactions with blocked tiles stop at a neighboring tile center.
  if(!grid.isWalkable(target.x,target.y)) stopRange=Math.max(stopRange,1.05);
  const goal={x:Math.round(target.x),y:Math.round(target.y)};
  const path=route(context,goal,targetId ? Math.max(1,stopRange) : stopRange);
  if(!targetId && stopRange===0 && path.length && spatialDistance(goal,target)>0.001) path.push({x:target.x,y:target.y});
  const last=path[path.length-1] ?? actor;
  if(targetId && spatialDistance(last,target)>stopRange && spatialDistance(last,target)<1.6) {
    const distance=spatialDistance(last,target);
    path.push({x:target.x+(last.x-target.x)/distance*stopRange,y:target.y+(last.y-target.y)/distance*stopRange});
  }
  return {path: targetId ? path.slice(0,2) : path,goal,targetId,stopRange};
}

export function decideActor(program: SurvivorProgram, context: ScriptContext, time: number): string {
  const actor=context.survivor;
  if(!actor.isAlive()) {actor.motion=undefined;return 'Dead.';}
  const chosen=runSurvivorProgram(program,{...context,canMove:true});
  let action=chosen;
  if(chosen.type==='sprint' && actor instanceof Survivor) {
    if(time >= actor.sprintReadyAt && actor.stamina>=20) {actor.sprintUntil=time+3;actor.sprintReadyAt=time+8;}
    action=chosen.action;
  }
  const source=program.rules.find(rule=>rule.action===chosen)?.actionSource ?? (action.type==='wait'?'WAIT (no eligible rule matched)':action.type);
  if(actor instanceof Survivor) actor.recordEvent(context.tick??0,source);
  if(isMovement(action)) {
    const identity=JSON.stringify(action);
    if(!actor.motion || actor.motion.key!==identity || !actor.motion.path.length) actor.motion={action,key:identity,...plan(context,action)};
    else if(actor.motion.targetId) {
      const target=[...(context.survivors??[]),...context.zombies].find(a=>a.id===actor.motion?.targetId);
      if(!target?.isAlive() || !hasLineOfSight(context.grid,actor,target,{range:actor instanceof Survivor?actor.sightRange:actor.detectionRange})) actor.motion=undefined;

    }
    return source;
  }
  actor.motion=undefined;
  const attack=action.type==='attack' || action.type==='targeted' && ['ATTACK','SHOOT'].includes(action.verb);
  if(attack && time < actor.attackReadyAt) return 'Attack cooling down.';
  if(actor instanceof Zombie) {
    if(action.type==='attack') {
      const target=resolveTargets({type:'survivor',selector:'nearest',range:1},context)[0] as Survivor|undefined;
      if(target) {const before=target.health;target.takeDamage(20);actor.attackReadyAt=time+0.6;target.recordEvent(context.tick??0,`Attacked by a zombie for ${before-target.health} damage.`);if(!target.isAlive()){actor.kills++;context.grid.removeEntity(target.id);}}
    }
    return source;
  }
  const result=executeSurvivorAction(action,{...context,realtime:true});
  if(attack && result.startsWith('Survivor:')) actor.attackReadyAt=time+0.6;
  return result;
}

/** Fixed simulation time; subdividing prevents tunneling even with coarse configured ticks. */
export function moveActors(grid: Grid, actors: Actor[], time: number, seconds: number, contexts: (actor: Actor)=>ScriptContext, record?: (actor:Actor,time:number)=>void): void {
  const steps=Math.max(1,Math.ceil(seconds/0.025)), dt=seconds/steps;
  for(let step=0;step<steps;step++) {
    const now=time-seconds+(step+1)*dt;
    for(const actor of actors) {
      if(!actor.isAlive()){actor.motion=undefined;continue;}
      const survivor=actor instanceof Survivor ? actor : undefined;
      const motion=actor.motion;
      let moved=0;
      if(motion && now >= (motion.retryAt ?? 0) && (!survivor || survivor.stamina>0)) {
        const target=motion.targetId?actors.find(a=>a.id===motion.targetId):undefined;
        const arrived=target && spatialDistance(actor,target)<=motion.stopRange+0.01;
        if(target && (!target.isAlive() || !hasLineOfSight(grid,actor,target,{range:survivor?survivor.sightRange:(actor as Zombie).detectionRange}))) actor.motion=undefined;
        else if(!arrived) {
          if(!motion.path.length) {
            if(survivor) survivor.updateVision(grid);
            Object.assign(motion,plan(contexts(actor),motion.action));
          }
          let budget=(actor.speed??(survivor?1:1.2))*(survivor && now<survivor.sprintUntil && survivor.stamina>0?1.6:1)*dt;
          let segments=0;
          while(budget>1e-8 && segments++<4) {
            if(!motion.path.length) {
              if(survivor) survivor.updateVision(grid);
              Object.assign(motion,plan(contexts(actor),motion.action));
              if(!motion.path.length) { motion.retryAt=now+0.2; break; }
            }
            const next=motion.path[0], distance=spatialDistance(actor,next);
            if(distance<1e-6){motion.path.shift();continue;}
            let travel=Math.min(distance,budget);
            if(target) travel=Math.min(travel,Math.max(0,spatialDistance(actor,target)-motion.stopRange));
            if(travel<1e-8) break;
            const p={x:actor.x+(next.x-actor.x)/distance*travel,y:actor.y+(next.y-actor.y)/distance*travel};
            if(!canOccupy(grid,actor,p,actors) || !grid.moveEntity(actor,p.x,p.y)) {motion.path=[];motion.retryAt=now+0.2;break;}
            moved+=travel;budget-=travel;record?.(actor,now);
            if(travel>=distance-1e-8) motion.path.shift();
          }
        }
      }
      if(survivor) {
        if(moved>0) survivor.stamina=Math.max(0,survivor.stamina-moved*(now<survivor.sprintUntil?10:2));
        else survivor.stamina=Math.min(100,survivor.stamina+5*dt);
        if(survivor.stamina<=0) survivor.sprintUntil=0;
      }
    }
  }
}
