import type { GridCell, TileType } from "../../../shared/src/types/world.js";
interface ViewGrid { width: number; height: number; getCell(x: number, y: number): GridCell | null }
interface ViewObserver { canSee(x: number, y: number): boolean; hasExplored(x: number, y: number): boolean }

const visibleColors: Record<TileType, string> = {
  road: "#68717c", empty: "#385849", buildingWall: "#acbac6",
  buildingFloor: "#657986", door: "#e6bd65", openDoor: "#8ab39b",
};
const rememberedColors: Record<TileType, string> = {
  road: "#36393e", empty: "#303436", buildingWall: "#5c6065",
  buildingFloor: "#41464a", door: "#666157", openDoor: "#4d5652",
};
const tileSize = 16;

/** Terrain stays remembered; entities and loose loot require current sight. */
export function drawWorld(ctx: CanvasRenderingContext2D, grid: ViewGrid, survivor: ViewObserver, positions: Map<string, {x:number;y:number}> = new Map()): void {
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const cell = grid.getCell(x, y)!;
    const visible = survivor.canSee(x, y), explored = survivor.hasExplored(x, y);
    const px = x * tileSize, py = y * tileSize;
    ctx.fillStyle = visible ? visibleColors[cell.tileType] : explored ? rememberedColors[cell.tileType] : "#080c0d";
    ctx.fillRect(px, py, tileSize, tileSize);
    ctx.strokeStyle = visible ? "#52695e" : explored ? "#292e31" : "#101718";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, tileSize, tileSize);
    if (visible && cell.items.length) {
      ctx.fillStyle = "#f1d878";
      ctx.fillText("*", px + 8, py + 8);
    }
    const entities = cell.entities.filter(entity => visible && !['S','Z'].includes(entity.symbol));
    entities.forEach((entity, index) => {
      const width = tileSize / entities.length;
      ctx.fillStyle = entity.symbol === "S" ? "#79e5ab" : entity.symbol === "F" ? "#a38c70" : entity.symbol === "C" ? "#b594d6" : "#ef7777";
      ctx.fillRect(px + index * width + 1, py + 1, width - 2, 14);
      ctx.fillStyle = "#101719";
      ctx.fillText("name" in entity && entity.name === "Car" ? "V" : entity.symbol, px + (index + 0.5) * width, py + 8, width);
    });
  }

  // Moving actors are drawn after all terrain so neighboring tiles cannot erase them.
  // Clip sprites to the permitted sight mask, including during interpolation.
  ctx.save(); ctx.beginPath();
  for (let y=0;y<grid.height;y++) for(let x=0;x<grid.width;x++) if(survivor.canSee(x,y)) ctx.rect(x*tileSize,y*tileSize,tileSize,tileSize);
  ctx.clip();
  for(let y=0;y<grid.height;y++) for(let x=0;x<grid.width;x++) {
    if(!survivor.canSee(x,y)) continue;
    for(const entity of grid.getCell(x,y)?.entities ?? []) {
      if(!['S','Z'].includes(entity.symbol)) continue;
      const p=positions.get(entity.id) ?? entity, px=(p.x+0.5)*tileSize, py=(p.y+0.5)*tileSize;
      ctx.fillStyle=entity.symbol==='S'?'#79e5ab':'#ef7777';
      ctx.fillRect(px-5,py-5,10,10); ctx.fillStyle='#101719';ctx.fillText(entity.symbol,px,py,10);
    }
  }
  ctx.restore();

  // Draw only exposed edges in a final pass so later tiles cannot cover the outline.
  ctx.fillStyle = "#f06464";
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    if (!survivor.canSee(x, y)) continue;
    const px = x * tileSize, py = y * tileSize;
    if (!survivor.canSee(x, y - 1)) ctx.fillRect(px, py, tileSize, 1);
    if (!survivor.canSee(x, y + 1)) ctx.fillRect(px, py + tileSize - 1, tileSize, 1);
    if (!survivor.canSee(x - 1, y)) ctx.fillRect(px, py, 1, tileSize);
    if (!survivor.canSee(x + 1, y)) ctx.fillRect(px + tileSize - 1, py, 1, tileSize);
  }
}
