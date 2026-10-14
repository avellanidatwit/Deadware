import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorldView} from '../src/ui/WorldView';
import type {WorldResponse} from '../../shared/src/types/api';
import '../src/style.css';
const actor=(id:string,kind:'survivor'|'zombie',name:string)=>({id,kind,name,ownerName:'Scout',health:100,maxHealth:100,kills:0,aliveSeconds:120});
export function scene():WorldResponse {
 const cells:WorldResponse['cells']=[];
 for(let y=0;y<24;y++)for(let x=0;x<24;x++){
  const explored=x<20,visible=explored&&y<20;
  let tileType:WorldResponse['cells'][number]['tileType']=x===12||x===13||y===13||y===14?'road':'empty';
  if(x>=4&&x<=10&&y>=4&&y<=10)tileType=x===4||x===10||y===4||y===10?'buildingWall':'buildingFloor';
  if(x===7&&y===10)tileType='openDoor';
  if(x>=15&&x<=18&&y>=5&&y<=10)tileType=x===15||x===18||y===5||y===10?'buildingWall':'buildingFloor';
  if(x===16&&y===10)tileType='door';
  cells.push({x,y,tileType,visible,explored,entities:[],items:[]});
 }
 const at=(x:number,y:number)=>cells.find(c=>c.x===x&&c.y===y)!;
 for(const [x,y,name,symbol] of [[5,5,'Bookshelf','C'],[9,5,'Cabinet','C'],[9,8,'Bed','F'],[5,8,'Table','F'],[13,8,'Car','C'],[13,9,'Car body','V']] as const)at(x,y).entities.push({id:name==='Car body'?'Car-body':name,x,y,name,symbol});
 const human={...actor('human','survivor','Mara'),x:9,y:12,symbol:'S'};
 at(9,12).entities.push({id:human.id,x:9,y:12,symbol:'S',actor:human,name:human.name});
 for(let i=0;i<9;i++){const x=11+i%4,y=15+Math.floor(i/4),a=actor('z'+i,'zombie','Wanderer '+i);at(x,y).entities.push({id:a.id,x,y,symbol:'Z',actor:a,name:a.name});}
 at(8,12).items.push({id:'bandage',name:'Bandage',type:'bandage',catalogKey:'bandage'});
 return {time:10,tick:100,width:24,height:24,pollMs:250,cells,entities:[],observer:{...human,sightRange:20,stamina:92,hunger:25,thirst:18,inventory:[],message:'EXPLORE',history:[{tick:99,message:'EXPLORE'}]}};
}
function Fixture(){const [world,setWorld]=useState(scene),[all,setAll]=useState(false);Object.assign(window,{fixtureWorld:world,updateWorld:setWorld,setAllZombies:setAll});return <main><h1>Deadware / world</h1><WorldView world={world} allZombies={all}/></main>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
