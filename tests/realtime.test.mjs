import test from 'node:test';
import assert from 'node:assert/strict';
import { World, encode } from '../dist/server/src/world.mjs';
import { Grid } from '../dist/server/src/world/grid.js';
import { Survivor } from '../dist/server/src/entities/survivor.js';
import { ItemContainer } from '../dist/server/src/entities/container.js';
import { createItem } from '../dist/server/src/entities/item.js';
import { Zombie } from '../dist/server/src/entities/zombie.js';
import { parseSurvivorScript } from '../dist/server/src/scripting/survivorScript.js';
import { decideActor, canOccupy } from '../dist/server/src/simulation/movement.js';
import { hasLineOfSight, spatialDistance } from '../dist/server/src/world/perception.js';
import { interpolateMotion } from '../client/src/ui/motion.ts';

function scene(decisionTicks=6,tickMs=100) {
  const world=new World();world.state.grid=new Grid(24,16);world.state.timing={decisionTicks,tickMs};
  function add(Actor,id,x,y,script='OTHERWISE\n WAIT') {
    const actor=new Actor(id,x,y,script);world.state.grid.addEntity(actor);
    (actor instanceof Survivor?world.state.survivors:world.state.zombies).push(actor);
    world.state.meta[id]={owner:'player',name:id,bornTick:0,version:1,zombieScript:'OTHERWISE\n WAIT'};
    world.programs.set(id,parseSurvivorScript(script,actor instanceof Survivor?'survivor':'zombie'));
    if(actor instanceof Survivor) for(let y=0;y<16;y++)for(let x=0;x<24;x++)actor.exploredTiles.add(`${x},${y}`);
    return actor;
  }
  return {world,add,advance:n=>{for(let i=0;i<n;i++)world.advance();},context:actor=>({grid:world.state.grid,survivor:actor,survivors:world.state.survivors,zombies:world.state.zombies,tick:0,realtime:true})};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('movement persists between decisions with independent 1.0 / 1.2 speeds',()=>{
  const s=scene(60);const human=s.add(Survivor,'human',2,2,'OTHERWISE\n MOVE east'),zombie=s.add(Zombie,'zombie',2,5,'OTHERWISE\n MOVE east');
  decideActor(s.world.programs.get('human'),s.context(human),0);decideActor(s.world.programs.get('zombie'),s.context(zombie),0);
  s.advance(1);close(human.x,2.1);close(zombie.x,2.12);
  s.advance(9);close(human.x,3);close(zombie.x,3.2);
  assert.equal(human.history.length,1);
  s.world.programs.set('human',parseSurvivorScript('OTHERWISE\n WAIT'));
  decideActor(s.world.programs.get('human'),s.context(human),1);s.advance(2);close(human.x,3);
});

test('sprint is temporary, drains stamina and has a cooldown',()=>{
  const s=scene(1);const actor=s.add(Survivor,'sprinter',2,2,'OTHERWISE\n SPRINT MOVE east');
  s.advance(1);s.advance(10);close(actor.x,3.6);assert.ok(actor.stamina<85);
  s.advance(30);assert.ok(actor.x<8);assert.ok(actor.sprintReadyAt>4);
  const x=actor.x;s.advance(10);close(actor.x-x,1);
  assert.throws(()=>parseSurvivorScript('OTHERWISE\n SPRINT WAIT'));
  assert.throws(()=>parseSurvivorScript('OTHERWISE\n SPRINT MOVE east','zombie'));
});

test('radius collision prevents tunneling into walls, doors and other actors',()=>{
  const s=scene(60,1000);const actor=s.add(Survivor,'human',2,2,'OTHERWISE\n MOVE east');
  s.world.state.grid.getCell(4,2).tileType='door';
  decideActor(s.world.programs.get('human'),s.context(actor),0);s.advance(3);
  assert.ok(actor.x<=3.28+1e-6);assert.ok(actor.x>3);
  s.world.state.grid.getCell(4,2).tileType='openDoor';s.advance(2);assert.ok(actor.x>4);
  const blocker=s.add(Survivor,'blocker',8,2);s.advance(5);
  assert.ok(spatialDistance(actor,blocker)>=0.44-1e-6);
  assert.equal(canOccupy(s.world.state.grid,actor,{x:24,y:2},[actor,blocker]),false);
});

test('paths turn around walls without cutting corners and persist across recovery',()=>{
  const s=scene();const actor=s.add(Survivor,'walker',3,3,'OTHERWISE\n RETURN target');actor.memory.target={x:7,y:3};
  s.world.state.grid.getCell(5,3).tileType='buildingWall';s.advance(19);
  assert.ok(actor.motion?.path.length);assert.ok(!Number.isInteger(actor.x)||!Number.isInteger(actor.y));
  const recovered=new World(encode(s.world.state));
  for(let i=0;i<65;i++){s.world.advance();recovered.advance();assert.ok(canOccupy(s.world.state.grid,actor,actor,[actor]));}
  close(actor.x,7);close(actor.y,3);
  close(recovered.state.survivors[0].x,actor.x);close(recovered.state.survivors[0].y,actor.y);
});

test('chasing stops at attack distance and attack cooldown is independent of decisions',()=>{
  const s=scene(1);const human=s.add(Survivor,'human',6,3),zombie=s.add(Zombie,'zombie',3,3,'WHEN survivorNearby 1\n ATTACK survivor\nOTHERWISE\n CHASE survivor');
  s.advance(30);assert.ok(zombie.x>4.9);assert.ok(spatialDistance(human,zombie)>=0.85);
  assert.ok(human.health<100);assert.ok(human.health>=40);
});

test('flee intent increases real distance and waits cannot teleport an actor',()=>{
  const s=scene(6);const human=s.add(Survivor,'human',10,8,'WHEN zombieNearby 6\n MOVE_AWAY nearest zombie\nOTHERWISE\n WAIT');const zombie=s.add(Zombie,'enemy',12,8);
  const before=spatialDistance(human,zombie);s.advance(15);assert.ok(spatialDistance(human,zombie)>before);
  let previous={x:human.x,y:human.y};for(let i=0;i<20;i++){s.advance(1);assert.ok(spatialDistance(previous,human)<=0.100001);previous={x:human.x,y:human.y};}
});

test('continuous line of sight blocks corners and distance checks are Euclidean',()=>{
  const grid=new Grid(8,8);grid.getCell(3,2).tileType='buildingWall';
  assert.equal(hasLineOfSight(grid,{x:2.1,y:2},{x:4.1,y:2}),false);
  assert.equal(hasLineOfSight(grid,{x:2,y:2},{x:3,y:3}),false);
  close(spatialDistance({x:0,y:0},{x:3,y:4}),5);
});

test('render interpolation follows corners, clamps stalls and handles newly visible actors',()=>{
  const samples=[{time:0,x:1,y:1},{time:1,x:2,y:1},{time:2,x:2,y:2}];
  assert.deepEqual(interpolateMotion(samples,0.5,{x:9,y:9}),{x:1.5,y:1});
  assert.deepEqual(interpolateMotion(samples,1.5,{x:9,y:9}),{x:2,y:1.5});
  assert.equal(interpolateMotion(samples,10,{x:9,y:9}),samples[2]);
  assert.deepEqual(interpolateMotion([],1,{x:4,y:4}),{x:4,y:4});
});


test('speed and needs are consistent across simulation and decision intervals',()=>{
  const scenes=[scene(6,100),scene(3,200)];
  for(const s of scenes){const actor=s.add(Survivor,'human',2,2,'OTHERWISE\n MOVE east');decideActor(s.world.programs.get('human'),s.context(actor),0);s.advance(1000/s.world.state.timing.tickMs);}
  close(scenes[0].world.state.survivors[0].x,scenes[1].world.state.survivors[0].x);
  close(scenes[0].world.state.survivors[0].hunger,scenes[1].world.state.survivors[0].hunger);
});

test('snapshots contain fractional coordinates and only currently visible movement trails',()=>{
  const s=scene();const actor=s.add(Survivor,'human',2,2,'OTHERWISE\n MOVE east');s.advance(9);
  const snapshot=s.world.snapshot('player','human');const projected=snapshot.cells.flatMap(c=>c.entities).find(e=>e.id==='human');
  assert.ok(projected.x>2 && projected.x<3);assert.ok(projected.motion.length>1);
  const visible=new Set(snapshot.cells.filter(c=>c.visible).map(c=>`${c.x},${c.y}`));
  for(const sample of projected.motion)assert.ok(visible.has(`${Math.round(sample.x)},${Math.round(sample.y)}`));
  const hidden=s.world.snapshot('nobody');assert.equal(hidden.cells.flatMap(c=>c.entities).length,0);
});


test('container approach remains active across repeated decisions',()=>{
  const s=scene();const actor=s.add(Survivor,'scout',2,3,'OTHERWISE\n MOVE_TO nearest container');
  const box=new ItemContainer('box',7,3,'Box',[createItem('food')]);s.world.state.grid.addEntity(box);
  s.advance(6);s.advance(20);close(actor.x,4);
  s.advance(30);assert.ok(spatialDistance(actor,box)<=1.05);
});
