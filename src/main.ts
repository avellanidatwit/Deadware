import { findNearestTarget } from "./world/perception.js";
import { runZombieTick } from "./scripting/zombieScript.js";
import { generateCity } from "./world/city.js";

import { Survivor } from "./entities/survivor.js";
import { Zombie } from "./entities/zombie.js";

import {
  Direction,
  parseSurvivorScript,
  runSurvivorProgram,
  SurvivorAction,
} from "./scripting/survivorScript.js";

// ======================================================
// CREATE WORLD
// ======================================================

// Change width/height here; omit them to use 50 by 50. Add seed for a repeatable city.
const city = generateCity({ width: 50, height: 50 });
const { grid } = city;

// ======================================================
// SURVIVOR PROGRAM
// ======================================================

const survivorCode = 
`WHEN zombieNearby 1
    ATTACK zombie
    
WHEN zombieNearby 6
    MOVE_AWAY zombie

WHEN itemsOnFloor AND inventorySpace
    PICK_UP items

WHEN containerNearby
    SEARCH container

WHEN containerNearby 10
    MOVE_TO container

OTHERWISE
    EXPLORE`;

// ======================================================
// CREATE SURVIVOR
// ======================================================

const survivor = new Survivor(
  "survivor-1",
  city.survivorSpawn.x,
  city.survivorSpawn.y,
  survivorCode
);

// ======================================================
// CREATE ZOMBIE
// ======================================================

const zombie = new Zombie(
  "zombie-1",
  city.zombieSpawn.x,
  city.zombieSpawn.y
);

// ======================================================
// ADD ENTITIES
// ======================================================

grid.addEntity(survivor);
grid.addEntity(zombie);

// Store zombies in an array because we'll eventually
// have many of them.
const zombies: Zombie[] = [
  zombie,
  ...city.zombies,
];

// ======================================================
// COMPILE SURVIVOR PROGRAM
// ======================================================

let survivorProgram =
  parseSurvivorScript(
    survivor.program
  );

// ======================================================
// SIMULATION
// ======================================================

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas is unavailable.");
const ctx = context;
const status = document.querySelector<HTMLElement>("#status")!;
const stats = document.querySelector<HTMLElement>("#stats")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!;
const stepButton = document.querySelector<HTMLButtonElement>("#step")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stop")!;
const scriptEditor = document.querySelector<HTMLTextAreaElement>("#script-code")!;
const entitySelect = document.querySelector<HTMLSelectElement>("#script-entity")!;
const feedback = document.querySelector<HTMLElement>("#script-feedback")!;
const entities = [survivor, ...zombies];
const drafts = new Map(entities.map(entity => [entity.id, entity.program]));
const zombiePrograms = new Map(zombies.map(entity => [entity.id, parseSurvivorScript(entity.program, "zombie")]));
let selectedEntity = entities[0];
let tick = 0, paused = false, stopped = false;
canvas.width = grid.width * 16;
canvas.height = grid.height * 16;
document.querySelector("#world-size")!.textContent = `World simulation: ${grid.width} x ${grid.height} tiles`;
function showStatus(message: string): void { status.textContent = message; }

for (const entity of entities) {
  const option = document.createElement("option");
  option.value = entity.id;
  option.textContent = `${entity.symbol === "S" ? "Survivor" : "Zombie"}: ${entity.id}`;
  entitySelect.append(option);
}
scriptEditor.value = selectedEntity.program;
entitySelect.addEventListener("change", () => {
  drafts.set(selectedEntity.id, scriptEditor.value);
  selectedEntity = entities.find(entity => entity.id === entitySelect.value)!;
  scriptEditor.value = drafts.get(selectedEntity.id)!;
  scriptEditor.removeAttribute("aria-invalid");
  feedback.textContent = "Apply changes to use this script on the next update.";
});
scriptEditor.addEventListener("input", () => {
  scriptEditor.removeAttribute("aria-invalid");
  feedback.textContent = "Unapplied changes.";
});
document.querySelector("#apply-script")!.addEventListener("click", () => {
  try {
    const program = parseSurvivorScript(scriptEditor.value, selectedEntity instanceof Zombie ? "zombie" : "survivor");
    selectedEntity.program = scriptEditor.value;
    drafts.set(selectedEntity.id, scriptEditor.value);
    if (selectedEntity === survivor) survivorProgram = program;
    else zombiePrograms.set(selectedEntity.id, program);
    scriptEditor.removeAttribute("aria-invalid");
    feedback.textContent = stopped ? "Script saved. Simulation is stopped." : "Script applied for the next update.";
  } catch (error) {
    scriptEditor.setAttribute("aria-invalid", "true");
    feedback.textContent = error instanceof Error ? error.message : "Invalid script.";
  }
});
let allowTabExit = false;
scriptEditor.addEventListener("focus", () => { allowTabExit = false; });
scriptEditor.addEventListener("keydown", event => {
  if (event.key === "Escape") { allowTabExit = true; return; }
  if (event.key !== "Tab") { allowTabExit = false; return; }
  if (allowTabExit || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  const start = scriptEditor.selectionStart, end = scriptEditor.selectionEnd;
  const value = scriptEditor.value;
  if (!event.shiftKey && start === end) scriptEditor.setRangeText("    ", start, end, "end");
  else {
    const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const newline = value.indexOf("\n", end);
    const blockEnd = start === end ? (newline === -1 ? value.length : newline) : end;
    const lines = value.slice(lineStart, blockEnd).split("\n");
    let firstChange = 0, totalChange = 0;
    const result = lines.map((line, index) => {
      if (index === lines.length - 1 && line === "" && end > start && value[end - 1] === "\n") return line;
      const removed = event.shiftKey ? (line.match(/^(?: {1,4}|\t)/)?.[0].length ?? 0) : 0;
      const change = event.shiftKey ? -removed : 4;
      if (index === 0) firstChange = change;
      totalChange += change;
      return event.shiftKey ? line.slice(removed) : "    " + line;
    }).join("\n");
    scriptEditor.setRangeText(result, lineStart, blockEnd, "preserve");
    scriptEditor.setSelectionRange(Math.max(lineStart, start + firstChange), Math.max(lineStart, end + totalChange));
  }
  scriptEditor.dispatchEvent(new Event("input", { bubbles: true }));
});

function render(): void {
  survivor.updateVision(grid);
  const colors = { road: "#454b53", empty: "#172823", buildingWall: "#88949e", buildingFloor: "#39464f", door: "#d4a653", openDoor: "#638271" };
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const cell = grid.getCell(x, y)!;
    ctx.fillStyle = colors[cell.tileType];
    ctx.fillRect(x * 16, y * 16, 16, 16);
    ctx.strokeStyle = "#263830";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x * 16, y * 16, 16, 16);
    if (survivor.canSee(x, y) && cell.items.length) { ctx.fillStyle = "#f1d878"; ctx.fillText("*", x * 16 + 8, y * 16 + 8); }
    cell.entities.filter(entity => entity === survivor || survivor.canSee(x, y)).forEach((entity, index) => {
      const width = 16 / cell.entities.length;
      ctx.fillStyle = entity.symbol === "S" ? "#79e5ab" : entity.symbol === "F" ? "#a38c70" : entity.symbol === "C" ? "#b594d6" : "#ef7777";
      ctx.fillRect(x * 16 + index * width + 1, y * 16 + 1, width - 2, 14);
      ctx.fillStyle = "#101719";
      ctx.fillText("name" in entity && entity.name === "Car" ? "V" : entity.symbol, x * 16 + (index + 0.5) * width, y * 16 + 8, width);
    });
    if (!survivor.hasExplored(x, y)) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  stats.textContent = `Tick ${tick} | Position (${survivor.x}, ${survivor.y}) | Health ${survivor.health}/${survivor.maxHealth}`;
  canvas.setAttribute("aria-label", `Full ${grid.width} by ${grid.height} world. ${stats.textContent}`);
  document.querySelector("#floor-items")!.textContent = survivor.lookAtFloor(grid).map(item => `${item.name} (${item.type})`).join(", ") || "No items on this tile.";
  document.querySelector("#inventory")!.textContent = `${survivor.inventory.length}/5: ${survivor.inventory.map(item => item.name).join(", ") || "Empty"}`;
}
function advance(): void {
  if (stopped) return;
  runSurvivorTick();
  for (const zombie of zombies) runZombieTick(zombie, zombiePrograms.get(zombie.id)!, grid, [survivor], zombies);
  tick++;
  if (!survivor.isAlive()) showStatus("Survivor is dead.");
  render();
}
pauseButton.addEventListener("click", () => {
  if (stopped) return;
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  stepButton.disabled = !paused;
});
stepButton.addEventListener("click", advance);
stopButton.addEventListener("click", () => {
  stopped = true;
  window.clearInterval(timer);
  pauseButton.disabled = stepButton.disabled = stopButton.disabled = true;
  stopButton.textContent = "Stopped";
  showStatus(`Simulation stopped at tick ${tick}.`);
});
document.querySelector("#restart")!.addEventListener("click", () => window.location.reload());
showStatus("Initial world. One update every 600 ms.");
render();
const timer = window.setInterval(() => { if (!paused) advance(); }, 600);

// ======================================================
// SURVIVOR TICK
// ======================================================

function runSurvivorTick(): void {
  if (!survivor.isAlive()) {
    return;
  }

  const action =
    runSurvivorProgram(
      survivorProgram,
      {
        survivor,
        zombies,
        grid,
        canMove: tick % 2 === 1,
      }
    );

  showStatus(
    `Survivor selected action: ${action.type}`
  );

  executeSurvivorAction(
    action
  );
}

// ======================================================
// EXECUTE ACTION
// ======================================================

function executeSurvivorAction(
  action: SurvivorAction
): void {
  switch (action.type) {
    case "openDoor":
      showStatus(survivor.openDoor(grid) ? "Survivor opens a door." : "No closed door within one tile.");
      break;
    case "moveToContainer":
      showStatus(survivor.moveToContainer(grid, action.range) ? "Moving toward a container." : "No reachable visible container to approach.");
      break;
    case "pickUpItems": {
      const items = survivor.pickUpItems(grid);
      showStatus(items.length ? `Picked up ${items.map(item => item.name).join(", ")}.` : "No items picked up (floor empty or inventory full).");
      break;
    }
    case "searchContainer": {
      const nearby = survivor.findContainers(grid);
      const container = nearby.find(container => container.contents.length) ?? nearby[0];
      const items = container ? survivor.searchContainer(grid, container) : null;
      showStatus(items === null ? "No container within one tile." : items.length ? `Searched ${container!.name}: dropped ${items.map(item => item.name).join(", ")} on your tile.` : "Container is empty.");
      break;
    }
    case "lookFloor":
      showStatus(survivor.lookAtFloor(grid, action.itemType).map(item => item.name).join(", ") || "No matching floor items.");
      break;
    case "move":
      moveDirection(
        action.direction
      );
      break;

    case "moveAway":
      moveAwayFromZombie();
      break;

    case "attack":
      attackZombie();
      break;

    case "wander":
    case "explore":
      explore();
      break;

    case "wait":
      showStatus(
        "Survivor waits."
      );
      break;
  }
}

// ======================================================
// MOVE DIRECTION
// ======================================================

function moveDirection(
  direction: Direction
): void {
  let newX = survivor.x;
  let newY = survivor.y;

  switch (direction) {
    case "north":
      newY--;
      break;

    case "south":
      newY++;
      break;

    case "east":
      newX++;
      break;

    case "west":
      newX--;
      break;
  }

  const moved =
    grid.moveEntity(
      survivor,
      newX,
      newY
    );

  if (moved) {
    showStatus(
      `Survivor moved ${direction}.`
    );
  } else {
    showStatus(
      `Survivor could not move ${direction}.`
    );
  }
}

// ======================================================
// MOVE AWAY FROM ZOMBIE
// ======================================================

let lastFleeMove: { fromX: number; fromY: number; toX: number; toY: number; direction: Direction; tick: number } | undefined;

function moveAwayFromZombie(): void {
  const nearestZombie =
    findNearestZombie();

  if (!nearestZombie) {
    showStatus(
      "No zombie found."
    );

    return;
  }

  const possibleMoves = [
    {
      x: survivor.x,
      y: survivor.y - 1,
      direction: "north" as Direction,
    },

    {
      x: survivor.x,
      y: survivor.y + 1,
      direction: "south" as Direction,
    },

    {
      x: survivor.x + 1,
      y: survivor.y,
      direction: "east" as Direction,
    },

    {
      x: survivor.x - 1,
      y: survivor.y,
      direction: "west" as Direction,
    },
  ];

  // Only consider tiles the survivor
  // can actually move onto.
  const walkableMoves =
    possibleMoves.filter((move) =>
      grid.isWalkable(
        move.x,
        move.y
      )
    );

  if (walkableMoves.length === 0) {
    showStatus(
      "Survivor has nowhere to run."
    );

    return;
  }

  const distance = (move: { x: number; y: number }) => getDistance(move.x, move.y, nearestZombie.x, nearestZombie.y);
  const safest = Math.max(...walkableMoves.map(distance));
  let candidates = walkableMoves.filter(move => distance(move) === safest);
  const previous = lastFleeMove;
  if (previous && previous.tick === tick - 2 && previous.toX === survivor.x && previous.toY === survivor.y) {
    const forward = candidates.filter(move => move.x !== previous.fromX || move.y !== previous.fromY);
    if (forward.length) candidates = forward;
    const continuing = candidates.find(move => move.direction === previous.direction);
    if (continuing) candidates = [continuing];
  }
  const bestMove = candidates[Math.floor(Math.random() * candidates.length)];
  const fromX = survivor.x, fromY = survivor.y;
  if (!grid.moveEntity(survivor, bestMove.x, bestMove.y)) return;
  lastFleeMove = { fromX, fromY, toX: bestMove.x, toY: bestMove.y, direction: bestMove.direction, tick };

  showStatus(
    `Survivor runs ${bestMove.direction} away from ${nearestZombie.id}.`
  );
}

// ======================================================
// ATTACK
// ======================================================

function attackZombie(): void {
  const nearestZombie =
    findNearestZombie();

  if (!nearestZombie) {
    showStatus(
      "No zombie available to attack."
    );

    return;
  }

  const distance =
    getDistance(
      survivor.x,
      survivor.y,
      nearestZombie.x,
      nearestZombie.y
    );

  // Melee attacks currently require
  // the zombie to be one tile away.
  if (distance > 1) {
    showStatus(
      "Zombie is too far away to attack."
    );

    return;
  }

  const damage = 25;

  nearestZombie.takeDamage(
    damage
  );

  showStatus(
    `Survivor attacks ${nearestZombie.id} for ${damage} damage.`
  );

  if (!nearestZombie.isAlive()) {
    showStatus(
      `${nearestZombie.id} was killed.`
    );

    grid.removeEntity(
      nearestZombie.id
    );
  }
}

// ======================================================
// EXPLORE
// ======================================================

function explore(): void {
  showStatus(survivor.explore(grid) ? "Survivor explores toward unseen territory." : "No reachable unexplored area. Open nearby doors to reveal more.");
}

// ======================================================
// FIND NEAREST ZOMBIE
// ======================================================

function findNearestZombie():
  Zombie | null {
  return findNearestTarget(grid, survivor, zombies, { range: survivor.sightRange, predicate: zombie => zombie.isAlive() }) ?? null;
}

// ======================================================
// DIRECTION HELPER
// ======================================================

function getPositionInDirection(
  direction: Direction
): {
  x: number;
  y: number;
} {
  switch (direction) {
    case "north":
      return {
        x: survivor.x,
        y: survivor.y - 1,
      };

    case "south":
      return {
        x: survivor.x,
        y: survivor.y + 1,
      };

    case "east":
      return {
        x: survivor.x + 1,
        y: survivor.y,
      };

    case "west":
      return {
        x: survivor.x - 1,
        y: survivor.y,
      };
  }
}

// ======================================================
// DISTANCE
// ======================================================

function getDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return (
    Math.abs(x1 - x2) +
    Math.abs(y1 - y2)
  );
}