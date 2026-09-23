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

`ItemContainer` is a named storage entity (desk, cabinet, etc.) with food and weapon contents. It blocks movement but not sight. The generated city includes parked cars and building storage with randomized loot. `randomizeItems(count)` creates food or weapons with equal probability; omitting the count generates 0?3 items. Loot is generated once per container, not replenished on search.

```text
WHEN containerNearby
    SEARCH container
OTHERWISE
    LOOK floor
```

`containerNearby` means a visible, nonempty container within one tile by default. Add a nonnegative whole-number range, for example `WHEN containerNearby 10`, to detect farther containers. Detection does not extend SEARCH reach; use `MOVE_TO container 10` to approach. `SEARCH container` searches an adjacent container (horizontal/vertical, not diagonal), preferring a nonempty one, and transfers its entire contents to the survivor's current floor tile. Repeat searches of an empty container produce nothing. `LOOK floor`, `LOOK floor food`, and `LOOK floor weapon` display matching items. The status panel always lists the items underfoot; floor piles are marked with `*` when not covered by an entity.

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


## Generated cities

The starting world now uses `generateCity` from `src/world/city.ts`. Configure it in `src/main.ts`:

```ts
const city = generateCity({ width: 80, height: 60, seed: 123, carDensity: 0.025 });
const { grid } = city;
```

Width and height default to 50, with supported integer sizes from 8 to 300. Omit `seed` for a new randomized city each restart; set it for repeatable layout and loot types. `carDensity` ranges from 0 to 1 and controls parking on eligible road tiles.

Two-lane roads cross the map with randomized spacing and no perimeter road. Building lots have variable dimensions and occasional vacant spaces. Every generated building is at least 5 by 5 tiles, providing a minimum 3 by 3 interior inside the walls. Every building has a closed door and a driveway connected to the streets. Cars park on one lane, leaving the other lane and junctions clear. Cars are ordinary `ItemContainer` entities named Car, shown as a searchable C end and a non-searchable V body: both tiles block movement and work with container detection, navigation, searching, and food/weapon loot. Like other containers they do not block sight. Buildings may contain desks or cabinets where space permits.

The return value contains `grid`, `buildings`, `cars`, interior `containers`, the generated `seed`, and clear `survivorSpawn`/`zombieSpawn` positions. The page's dimensions follow the generated grid. Run `npm run build` and refresh after editing the settings.


`WHEN` supports uppercase `AND`, for example `WHEN zombieNearby 1 AND health > 20`. All conditions must match, and actor restrictions apply to every condition. An AND chase rule uses the smallest survivor detection range in that rule. OR and parentheses are not supported.

Cars occupy two consecutive road tiles, vertically on north/south roads and horizontally on east/west roads. The default carDensity is 0.025 (2.5% of eligible parking positions). Only the C end stores loot and counts as a container; standing next to the V body alone does not allow searching. Cars are spaced to avoid overlapping each other, driveways, or intersections, and the other road lane remains clear. The road network crosses map edges where streets exit, but does not form a perimeter ring.

`WHEN inventorySpace` is the opposite of `inventoryFull`: it matches when the survivor carries fewer than five items. For example, `WHEN itemsOnFloor AND inventorySpace` followed by `PICK_UP items`. This condition is survivor-only.


## Exploration and sight

Survivors have eight-tile Manhattan sight, blocked by walls and closed doors. The map darkens tiles never seen; revealed terrain stays bright, but entities and floor items are drawn only while currently visible. Vision updates initially and after each tick, including door opening. Death stops further discovery.

Survivor EXPLORE (and its WANDER alias) routes over revealed walkable terrain to the nearest boundary of unseen space instead of choosing a random step. It stops when no reachable exploration frontier remains. Use `WHEN nearbydoor` / `OPEN door` to open up hidden interiors. Movement still happens every other tick. Zombie wandering stays random. Survivor enemy/container detection ranges are capped at eight tiles, even if a script requests more; smaller script ranges still work.


## Furniture, building zombies, and item catalog

Buildings contain searchable desks, cabinets, dressers, and bookshelves (C), plus decorative chairs, sofas, beds, and tables (F). Both block movement, but only storage furniture is searchable. Furniture sits along side walls with walking and door access kept clear.

Each building independently has a 40% chance of spawning one zombie on a free interior tile. Configure `buildingZombieChance` in `generateCity` (0 disables interior zombies, 1 populates every building). The existing street zombie remains. Interior zombies run scripts and appear in the entity selector; they become visible on the map when the survivor sees them.

Edit `src/data/itemCatalog.ts` to manage every inventory item definition. Each entry has a unique `key`, `name`, `type` (food or weapon), and relative loot `weight`. A weight of 0 excludes an item from random loot. Add more entries of either category to expand loot without changing the generator. `createItemByKey(key)` creates a specific item, and `randomizeItems` samples the catalog. Items keep unique instance IDs plus their catalog key. Food and weapons remain item categories; eating and equipping are not implemented.
