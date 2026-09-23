# Deadware
Deadware is a persistent zombie apocalypse simulation where players program autonomous survivors—and, after death, their undead counterparts—to survive, adapt, and interact in an evolving world.


## Run the graphical simulation

Run `npm install` once, then `npm start` and open http://localhost:3000 in your browser.

The entire 50 x 50 grid is drawn initially and after every update (600 ms apart). The simulation runs indefinitely until you click Stop or close the page. Use Pause/Resume, Step while paused, Stop to cancel, or Restart to begin again. Stopping preserves the final grid on screen. The page shows terrain, survivors, zombies, health, position, and the latest action; the grid is not printed in the console.

`npm run build` compiles the TypeScript. After editing source files, restart `npm start` and refresh the browser.


## Zombie scripts

Zombies execute SurvivorScript after the survivor on every update. Select a zombie in the editor and apply changes to use them on the next tick. The default script is:

```text
WHEN survivorNearby
    CHASE survivor

OTHERWISE
    WANDER
```

Detection uses Manhattan distance (5 tiles by default, configurable with `Zombie.detectionRange`) and ignores dead survivors. CHASE selects the nearest visible living survivor in range and moves one tile along a shortest walkable route, stopping adjacent to them. An unreachable target makes the zombie wait. WANDER randomly chooses a walkable neighboring tile. Zombies also support MOVE, EXPLORE (an alias for wandering), WAIT, and health comparisons. Combat is not part of chasing. Edits last until refresh/restart.

Nearby conditions accept an optional range: `WHEN zombieNearby 10` or `WHEN survivorNearby 8`. Omit the number to keep the default (5 tiles, or `Zombie.detectionRange` for survivor detection). Ranges are nonnegative whole numbers; 0 means the same tile. A CHASE action under `survivorNearby` uses that rule's range, without changing other rules or the zombie's default.


## Visibility and searching

`src/world/perception.ts` provides reusable searches, with results sorted nearest first:

- `hasLineOfSight(grid, origin, target, options)` checks visibility and optional range.
- `searchTargets(grid, origin, targets, options)` filters any collection of objects with `x` and `y`, including future items.
- `findNearestTarget(...)` returns the first matching target or `undefined`.
- `searchEntities(grid, origin, options)` searches entities currently on the grid.
- `searchCells(grid, origin, options)` searches terrain, including building walls, floors, and doors. Buildings currently consist of tiles rather than separate building objects.

Options include `range` (unlimited when omitted), `predicate`, `getPosition`, `metric` (`manhattan`, `euclidean`, or `chebyshev`), and `blocksSight`. Searches require visibility by default; set `requireLineOfSight: false` for nonvisual searches such as hearing. Coordinates must be integer grid cells. Manhattan distance remains the gameplay default.

Walls block sight; closed doors block it and open doors transmit it. The first blocking tile itself is visible so a building can be discovered, but objects beyond it are hidden. Set `includeBlockingTarget: false` to require a transparent destination. Diagonal rays cannot peek through blocked corners. Entities do not block sight by default.

```ts
import { searchCells, searchEntities, searchTargets } from "./world/perception.js";

const enemies = searchEntities(grid, survivor, {
  range: 8,
  predicate: entity => entity.symbol === "Z",
});
const buildingTiles = searchCells(grid, survivor, {
  range: 12,
  predicate: cell => cell.tileType === "buildingWall",
});
// Once an item collection exists, use the same API:
const items = [{ x: 4, y: 7, kind: "food" }];
const visibleFood = searchTargets(grid, survivor, items, {
  range: 6,
  predicate: item => item.kind === "food",
});
```

Both nearby script conditions and enemy targeting now require sight. Script evaluation requires `grid` in its context. Zombies stop chasing a hidden target and follow their next matching rule (normally WANDER); they have no last-seen-position memory. Survivor fleeing and attacking also select visible targets. Existing script range syntax is unchanged. Search infrastructure is also used by the container features below.


## Containers and floor items

`ItemContainer` is a named storage entity (desk, cabinet, etc.) with food and weapon contents. It blocks movement but not sight. The demo includes a desk at (10, 11) and a cabinet at (22, 17), each with randomized loot. `randomizeItems(count)` creates food or weapons with equal probability; omitting the count generates 0?3 items. Loot is generated once per container, not replenished on search.

```text
WHEN containerNearby
    SEARCH container
OTHERWISE
    LOOK floor
```

`containerNearby` means a visible, nonempty container within one tile. `SEARCH container` searches an adjacent container (horizontal/vertical, not diagonal), preferring a nonempty one, and transfers its entire contents to the survivor's current floor tile. Repeat searches of an empty container produce nothing. `LOOK floor`, `LOOK floor food`, and `LOOK floor weapon` display matching items. The status panel always lists the items underfoot; floor piles are marked with `*` when not covered by an entity.

The TypeScript API exposes `survivor.findContainers(grid, range)`, `survivor.searchContainer(grid, container)` (null if unavailable, an item array otherwise), and `survivor.lookAtFloor(grid, type?)`. The floor query returns a copied array suitable for `.find`, `.filter`, and `.some`, for example `survivor.lookAtFloor(grid).filter(item => item.type === "food")`. Items persist on their floor tile when the survivor moves. Survivors can pick up items into a five-item inventory. Eating and equipping items are not implemented yet.


## Inventory and automated looting

Survivors hold at most five items, shown in the status panel. `PICK_UP items` transfers items from the current floor tile until full, leaving excess on the floor. `MOVE_TO container 10` approaches the nearest visible, reachable nonempty container within 10 tiles; omit the range to use 10. It moves one tile per update and stops adjacent. Walls block visibility; this action waits when no suitable container is visible. It does not explore automatically.

```text
WHEN inventoryFull
    WAIT

WHEN itemsOnFloor
    PICK_UP items

WHEN containerNearby
    SEARCH container

OTHERWISE
    MOVE_TO container 10
```

Apply this script to a survivor. Each update performs one step: approach, search, or collect. The API exposes `survivor.inventory` (a snapshot), `inventoryCapacity`, `pickUpItems(grid)`, and `moveToContainer(grid, range)`. Inventory resets on restart with the rest of the simulation.


## Doors

Doors start closed and block movement and sight. `WHEN nearbydoor` detects a closed door exactly one horizontal or vertical tile away. `OPEN door` opens one such door per update without moving the survivor. Open doors stay open and no longer match the condition. Zombies cannot open doors, but can move through open ones. The survivor API is `findNearbyDoors(grid)` and `openDoor(grid)` (returns whether a door was opened).

```text
WHEN nearbydoor
    OPEN door
OTHERWISE
    EXPLORE
```

Place the door rule above movement rules to open doors encountered while exploring.

Survivor movement actions (MOVE, MOVE_AWAY, MOVE_TO, EXPLORE, WANDER) run on ticks 2, 4, 6, and so on. Scripts still evaluate every tick, and non-movement actions remain available every tick. Zombies continue updating every tick, allowing them to catch up.


Zombies now support `ATTACK survivor`: 20 damage per attack, within Manhattan distance 1 and line of sight. Their default script checks `WHEN survivorNearby 1` and attacks before chasing. At zero health a survivor stops acting and is removed from the grid. Attacking takes one update; it does not also move.

On survivor movement cooldown ticks, movement rules are skipped and evaluation continues down the script to the first matching non-movement rule. This allows attacks, searches, pickups, and door opening while movement is unavailable. If no eligible rule matches, the survivor waits. Only one action executes per update.
