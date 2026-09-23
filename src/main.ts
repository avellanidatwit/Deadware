import { Grid } from "./world/grid.js";

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

const grid = new Grid(50, 50);

// ======================================================
// CREATE BUILDING
// ======================================================

grid.createBuilding(
  20,
  15,
  8,
  6
);

// ======================================================
// SURVIVOR PROGRAM
// ======================================================

const survivorCode = 
`# Attack the zombie if it is very close
WHEN zombieNearby 1
    ATTACK zombie
    
# Run away when a zombie is nearby
WHEN zombieNearby 6
    MOVE_AWAY zombie

# Otherwise explore
OTHERWISE
    EXPLORE`;

// ======================================================
// CREATE SURVIVOR
// ======================================================

const survivor = new Survivor(
  "survivor-1",
  10,
  10,
  survivorCode
);

// ======================================================
// CREATE ZOMBIE
// ======================================================

const zombie = new Zombie(
  "zombie-1",
  13,
  10
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
];

// ======================================================
// COMPILE SURVIVOR PROGRAM
// ======================================================

const survivorProgram =
  parseSurvivorScript(
    survivor.program
  );

// ======================================================
// SIMULATION
// ======================================================

console.log();
console.log("==============================");
console.log("         DEADWARE");
console.log("==============================");
console.log();

console.log("Initial world:");
console.log();

grid.print();

console.log();

runSimulation(10);

// ======================================================
// SIMULATION LOOP
// ======================================================

function runSimulation(
  numberOfTicks: number
): void {
  for (
    let tick = 1;
    tick <= numberOfTicks;
    tick++
  ) {
    console.log();
    console.log(
      `========== TICK ${tick} ==========`
    );

    runSurvivorTick();

    console.log(
      `Survivor position: (${survivor.x}, ${survivor.y})`
    );

    console.log(
      `Survivor health: ${survivor.health}`
    );
  }

  console.log();
  console.log("Final world:");
  console.log();

  grid.print();
}

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
        grid
      }
    );

  console.log(
    "Survivor selected action:",
    action
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

    case "explore":
      explore();
      break;

    case "wait":
      console.log(
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
    console.log(
      `Survivor moved ${direction}.`
    );
  } else {
    console.log(
      `Survivor could not move ${direction}.`
    );
  }
}

// ======================================================
// MOVE AWAY FROM ZOMBIE
// ======================================================

function moveAwayFromZombie(): void {
  const nearestZombie =
    findNearestZombie();

  if (!nearestZombie) {
    console.log(
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
    console.log(
      "Survivor has nowhere to run."
    );

    return;
  }

  // Pick the move that creates the
  // largest distance from the zombie.
  walkableMoves.sort(
    (a, b) => {
      const distanceA =
        getDistance(
          a.x,
          a.y,
          nearestZombie.x,
          nearestZombie.y
        );

      const distanceB =
        getDistance(
          b.x,
          b.y,
          nearestZombie.x,
          nearestZombie.y
        );

      return distanceB - distanceA;
    }
  );

  const bestMove =
    walkableMoves[0];

  grid.moveEntity(
    survivor,
    bestMove.x,
    bestMove.y
  );

  console.log(
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
    console.log(
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
    console.log(
      "Zombie is too far away to attack."
    );

    return;
  }

  const damage = 25;

  nearestZombie.takeDamage(
    damage
  );

  console.log(
    `Survivor attacks ${nearestZombie.id} for ${damage} damage.`
  );

  if (!nearestZombie.isAlive()) {
    console.log(
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
  const directions: Direction[] = [
    "north",
    "south",
    "east",
    "west",
  ];

  // Randomize directions
  const shuffled =
    directions.sort(
      () =>
        Math.random() - 0.5
    );

  for (const direction of shuffled) {
    const {
      x,
      y,
    } =
      getPositionInDirection(
        direction
      );

    if (
      grid.isWalkable(
        x,
        y
      )
    ) {
      grid.moveEntity(
        survivor,
        x,
        y
      );

      console.log(
        `Survivor explores ${direction}.`
      );

      return;
    }
  }

  console.log(
    "Survivor cannot find somewhere to explore."
  );
}

// ======================================================
// FIND NEAREST ZOMBIE
// ======================================================

function findNearestZombie():
  Zombie | null {
  const livingZombies =
    zombies.filter(
      (currentZombie) =>
        currentZombie.isAlive()
    );

  if (
    livingZombies.length === 0
  ) {
    return null;
  }

  let nearest =
    livingZombies[0];

  let nearestDistance =
    getDistance(
      survivor.x,
      survivor.y,
      nearest.x,
      nearest.y
    );

  for (
    const currentZombie
    of livingZombies
  ) {
    const distance =
      getDistance(
        survivor.x,
        survivor.y,
        currentZombie.x,
        currentZombie.y
      );

    if (
      distance <
      nearestDistance
    ) {
      nearest =
        currentZombie;

      nearestDistance =
        distance;
    }
  }

  return nearest;
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