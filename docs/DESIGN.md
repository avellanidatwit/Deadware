# Deadware Game Design & Technical Specification

> **The Deadware server is authoritative. Clients may observe the world and submit requests, but only the server may modify simulation state.**

This is the living reference for the implemented simulation and SurvivorScript. The player programs how survivors think: sensors feed conditions, priority rules choose actions, selectors identify targets, and memory retains observed locations.

## Game loop and world

The server advances every 100 ms, independently of connected clients. Every sixth tick is an actor decision: survivors act first, then living zombies. Clients poll snapshots once per second. Refreshing a page does not reset state; restarting the server restores the SQLite save. No catch-up simulation runs during server downtime. Survivor movement is permitted every second update (displayed ticks 2, 4, 6, ...); zombies can move each update. Each action consumes one update, including an unsuccessful action. Death stops all actions and removes the entity from the grid.

The generated city contains roads, buildings, doors, furniture, containers, cars and zombies. Distances use Manhattan distance, with inclusive boundaries. Walls and closed doors block sight; diagonal corner gaps do not grant sight. Closed doors and solid furniture block movement. Survivors see up to eight tiles; larger script ranges cannot extend this. The map remembers explored terrain. Survivor navigation uses revealed terrain, while EXPLORE visits revealed, unvisited interior floor tiles first, then seeks unexplored boundaries. The map uses dark unexplored tiles, gray remembered terrain, bright visible terrain, and red outlines along the current vision boundary. Entities and floor loot remain hidden outside current sight. An unreachable selected target makes that action fail; selection does not switch to another target automatically.

## SurvivorScript language

Scripts are case-sensitive. `WHEN` introduces a condition, followed by exactly one action line. `OTHERWISE` is unconditional and should come last. Blank lines and lines starting with `#` are ignored; indentation is optional. Invalid syntax reports the original source line. Empty programs wait. No loops, functions, parentheses, arbitrary variables, or multi-action blocks are supported: the simulation tick is the loop.

Every tick, rules are evaluated top to bottom. The first matching rule selects its action. Movement rules are skipped during cooldown or when stamina is below two, so a later matching interaction can execute. If nothing can be selected, the survivor waits. Target availability is checked during execution; a missing target consumes the selected action rather than silently changing priorities.

Boolean precedence is `NOT`, then `AND`, then `OR`, with short-circuit evaluation. For more complex expressions use multiple rules. Zombie CHASE derives its range from positive survivorNearby conditions in the first true OR branch, taking the minimum within an AND expression; NOT does not supply a chase range.

### Conditions

| Syntax | Meaning |
| --- | --- |
| `health < 50` | Own health; also available to zombies |
| `hunger > 70`, `thirst > 70`, `stamina < 20`, `ammo < 5` | Survivor needs or loaded rounds |
| `hungry`, `thirsty`, `tired` | Hunger > 70, thirst > 70, stamina < 20 |
| `inventoryFull`, `inventorySpace` | Five slots used, or at least one free |
| `hasItem food`, `equipped weapon` | Inventory category or equipped category |
| `zombieNearby [range]`, `survivorNearby [range]` | Visible living actors, excluding self; default 5 (zombies use their detectionRange for survivors) |
| `containerNearby [range]` | Visible nonempty storage; default 1 |
| `nearbydoor`, `doorNearby` | Closed door exactly one cardinal tile away |
| `itemsOnFloor` | Any items on the current tile |
| `itemNearby food [range]` | Visible floor items of that category; default 8; no inspection of hidden container loot |
| `buildingNearby [range]`, `carNearby [range]` | Visible building wall/floor or car trunk; default 8 |
| `zombieCount 5 >= 3`, `survivorCount 10 >= 2` | Count visible living actors within the specified range |
| `distance nearest zombie < 3` | Compare distance to the selected visible target or remembered location; false if absent |
| `remembered target` | Whether a built-in memory slot exists |

All comparisons accept `<`, `>`, `<=`, `>=`, `==`, `!=` and nonnegative safe integers. Ranges must be nonnegative safe integers; zero means the same tile. Item categories are `food`, `weapon`, `bandage`, `water`, `gun`, `ammo`.

### Targets and selectors

General target syntax is `[selector] type [range]`, for example `nearest container 6`. Omitting the selector means `nearest`; general queries default to the survivor's sight range. `farthest` reverses distance ordering. `weakest` and `strongest` rank living actors by health, breaking ties by distance. Other ties preserve stable query order. Health selectors are rejected for nonliving targets.

Types: `zombie`, `survivor`, `container`, any item category, `door`, `building`, `car`, and the memory slots `home`, `target`, `lastZombie`, `lastContainer`. Item targets refer to floor piles; building targets refer to visible wall/floor cells. Memory targets use saved coordinates, even outside current sight, without revealing new world information.

Legacy commands and action objects are preserved by the public facade; explicit selector commands compile to `{ type: "targeted", verb, target: { type, selector, range? } }`. New target behavior belongs in `targetResolver.ts`, not the parser or browser.

### Actions

| Syntax | Behavior |
| --- | --- |
| `MOVE north/south/east/west` | One cardinal step |
| `MOVE_TO [selector] type [range]` | One step toward the selected target; stop adjacent to actors, doors, storage or blocked terrain, on top of floor piles or remembered walkable locations |
| `MOVE_TO container [range]` | Legacy alias, default range 10 (still capped at sight range 8) |
| `MOVE_AWAY [selector] zombie [range]` | Safest walkable neighboring tile by distance from that zombie; retains direction on ties to avoid oscillation |
| `EXPLORE`, `WANDER` | Visit revealed interior floor tiles not yet walked on, then seek an unexplored boundary |
| `FOLLOW [selector] survivor [range]` | Approach a visible survivor and stop adjacent; does not track them through walls |
| `RETURN home` | Navigate to a remembered location |
| `PATROL target` | Repeatedly travel between home and a remembered location; both endpoints must be walkable and reachable |
| `OPEN [selector] door` | Open a closed door one cardinal tile away |
| `SEARCH [selector] container` | Empty adjacent storage onto the survivor's current floor tile |
| `SEARCH food` | Approach a visible floor pile of that type, or explore if none is visible; consumes movement, does not pick up |
| `PICK_UP items`, `PICK_UP food` | Collect all or matching items underfoot until inventory is full |
| `DROP food`, `DROP weapon` | Drop one item of that category underfoot; any item category is accepted |
| `LOOK floor [item category]` | Inspect the current floor pile |
| `EAT food` | Consume food, reducing hunger by 40 |
| `USE bandage`, `USE water` | Consume to heal 30 (up to maxHealth), or reduce thirst by 50 |
| `EQUIP weapon`, `EQUIP gun` | Equip one carried item; the item still occupies a slot |
| `ATTACK [selector] zombie` | 25 damage unarmed, 40 with an equipped melee weapon, within one tile |
| `SHOOT [selector] zombie [range]` | 40 damage, requires equipped gun and a loaded round; sight constrained |
| `RELOAD` | Consume one ammo pack to fill the six-round magazine; requires equipped gun; does nothing if already full |
| `WAIT` | Remain in place and recover stamina |

Interaction and melee selectors resolve among targets within reach (one tile); a farther weak enemy does not prevent an adjacent attack. Combat targets must be alive. Dead enemies are removed immediately. Dropping a gun discards its loaded rounds. Equipment currently supports one active slot. Searching a container does not equip or pick up anything automatically.

### Needs and memory

Needs update once at the start of each living survivor tick: hunger +0.15 and thirst +0.25, capped at 100. A survivor loses one health per tick if either is at 100. Successful movement costs two stamina; a stationary action recovers three, capped at 100. Exhaustion blocks movement selection, not interactions. This tuning keeps needs gradual while giving food, water and rest competing priorities.

`home` initially holds the spawn position. `lastZombie` and `lastContainer` update to the nearest visible target at decision time and retain their last observed coordinates when sight is lost. Memory belongs to each survivor and survives script replacement, but resets with the simulation.

```text
WHEN NOT remembered target AND containerNearby 8
    REMEMBER nearest container AS target

WHEN health < 30
    RETURN home

OTHERWISE
    MOVE_TO target
```

`SET home = position`, `SET target = nearest container`, and `REMEMBER nearest container AS target` each consume one action. All four slots accept position snapshots. No live entity references are retained. An unconditional SET rule would run repeatedly and starve later rules, so guard initialization with a condition.

### Example autonomous survivor

```text
WHEN health < 30 AND hasItem bandage
    USE bandage

WHEN zombieNearby 1
    ATTACK nearest zombie

WHEN zombieCount 5 >= 3 OR health < 30 AND zombieNearby 5
    MOVE_AWAY nearest zombie

WHEN thirsty AND hasItem water
    USE water

WHEN hungry AND hasItem food
    EAT food

WHEN hasItem weapon AND NOT equipped weapon
    EQUIP weapon

WHEN itemsOnFloor AND inventorySpace
    PICK_UP items

WHEN containerNearby AND inventorySpace
    SEARCH nearest container

WHEN inventoryFull
    MOVE_TO home

WHEN doorNearby
    OPEN door

WHEN containerNearby 8
    MOVE_TO nearest container

OTHERWISE
    EXPLORE
```

## Zombies

The same parser and condition evaluator serve zombie programs. Zombies retain health, nearby actor sensing, Boolean expressions, MOVE, CHASE survivor, ATTACK survivor, WANDER, EXPLORE and WAIT. Survivor item, memory, needs, selectors, door and storage commands are rejected recursively, including inside NOT/OR. Zombies attack for 20 damage within one tile. Default scripts attack, chase, then wander. Their detectionRange defaults to five and explicit nearby ranges can extend it. Survivor-specific progression restrictions do not affect existing zombie programs unless explicitly supplied when compiling.

## Program capacity and progression

The server leaves capabilities unlocked, but enforces 1�100 rules, five condition leaves per rule, one action per rule, 16 KiB of source, and 512 characters per line. Four predefined memory slots bound stored memories. Programs compile at deployment and recovery, never per tick. Scenarios can opt into restrictions before installing a program:

```ts
parseSurvivorScript(source, "survivor", {
  maxRules: 8,
  memoryBudget: 20,
  unlockedCapabilities: progressionStages[2],
});
```

Memory accounting: each atomic condition costs one, counts cost two, each ordinary action costs one, an explicit targeted action costs two, and a memory action costs three. OTHERWISE counts as one condition; Boolean nodes have no additional cost. Limits are optional nonnegative integers. Compilation rejects over-budget or locked programs without replacing an installed program.

Stages are cumulative: basic behavior; interaction; Boolean logic; targeting/counts; memory/following. These are scenario configuration hooks. The current sandbox has no reward economy or automatic capability unlocks. Designing unlock objectives and survivor/device capacity upgrades remains future gameplay work.

## UI and architecture

The client starts with email/password login and opens a view-only screen. A grouped dropdown selects owned survivors or zombies. A separate Programming tab creates survivors, deploys behavior to active entities and saves named script pairs. Stats show health, position, hunger, thirst, stamina and loaded ammunition. Inventory and floor panels show items. The in-page command reference gives the core syntax; this document is the full specification.

`src/scripting/survivorScript.ts` is the stable public entry point. `language/` owns types, selectors, capability metadata and shared traversal/classification. `parser/` handles rules, conditions, actions and targets. `runtime/` owns context, condition evaluation, target resolution, rule selection, action execution and complete survivor ticks. `main.ts` handles login/logout, selected-entity snapshots and workspace tabs; `ui/programming.ts` handles survivor drafts, deployment and the saved program library. `server/world.mjs` owns simulation and compiled programs; `server.mjs` owns HTTP, authentication, persistence and scheduling. Entity classes own inventory and needs state. World perception remains the source of LOS and spatial queries.

Pages and styles live in `public/`. Run `npm test` to verify script validation, perception, sustained scavenging, combat, snapshot rendering, remote client requests, ownership checks, injection and restart persistence. The suite intentionally omits exhaustive feature edge cases.

## Roadmap and boundaries

Implemented: modular language, formal syntax, selectors, items, needs, counts, item/building/car sensing, distance comparisons, Boolean logic, built-in memory, following and patrol, optional capacity/progression configuration, and reusable simulation execution.

Deferred as proposed: arbitrary variables, user functions, loops, bleeding/infection systems, group communication and shared destinations, and progression rewards. Following works with the server survivor collection. The server supports provisioned owners, persistent worlds, injection and deployed script persistence. Self-service accounts, historical statistics, progression rewards, regional subscriptions and WebSocket deltas remain future work.


## Server specification

The server generates the world only when no save exists. A versioned snapshot graph preserves class identity, shared entity references, Sets, inventories and exploration. SQLite commits the world after every actor decision and accepted request. Accounts store normalized email addresses and salted scrypt password hashes. Login issues a hashed, revocable session token with a 12-hour lifetime. Credentials are provisioned by the operator, and ownership derives exclusively from authentication. Legacy API tokens remain supported. All mutations reject unrecognized fields and enforce entity ownership. Clients cannot set positions, health, inventory or owner IDs. A persistence failure halts further simulation and requests. One process owns each database; deployment requires persistent disk.

Only survivor creation enters the durable queue, limited to 100 entries. Each decision attempts one spawn chosen uniformly from free walkable tiles. An owner may have at most 100 survivors and queued definitions; zombies raised from them do not consume another survivor slot. Dead entities remain available for inspection and count toward this prototype quota. Deployment validates the entire script before replacing the compiled program and incrementing its version. Parsing errors retain source line numbers. No arbitrary code is evaluated.

REST provides world snapshots, owned entity lists/details, profile identity, script deployment and injection; see README for routes. World/region currently returns the same bounded full-grid snapshot as world. Terrain is hidden until explored, and entities/loot require current sight. Scripts continue using perception and memory through the existing server runtime, never client-provided knowledge. The snapshot contract can later support push delivery without moving authority into the client.

## Web client specification

The client runs as static files, including on GitHub Pages under a repository path. The entry screen has email/password login with optional server connection settings. A successful login opens a view-only screen with a dropdown grouped into owned survivors and zombies, the grid, selected-entity status, and a color/symbol key. Empty accounts show a clear empty state. No script editor or creation controls appear in the viewer.

The server validates ownership of every requested observer ID. Survivor views retain explored terrain; zombie views use current line of sight within detection range without remembered terrain. Nearby actors of any owner remain visible when in the selected entity's sight. The browser never calculates perception. Switching selection cancels the old request and ignores stale responses.

Passwords are cleared after login. Session tokens remain in page memory; logout revokes the server session, expiration returns to login, and refresh requires logging in again. The browser polls once per second and retries connection failures. Authentication failures do not expose the viewer. Self-service registration, password recovery, statistics and historical logs remain deferred.

## Programming and resurrection

The Programming tab contains a create-survivor option and active owned survivors/zombies. New survivors have a living program and a prepared zombie program. Both are validated before injection or deployment. Active survivors can update both programs; active zombies raised from survivors can update their current program. Dead entities cannot be deployed to. Direct zombie injection is rejected at both world-manager and API boundaries.

A decision runs survivor actions and existing zombie actions, then raises dead survivors at their exact final coordinates. The new zombie retains ownership and gets the prepared script. It first acts on the next decision. Persistent origin and descendant IDs make this transition idempotent after recovery, including deaths from combat and needs. No health or inventory is carried into the zombie beyond its normal defaults.

Named script pairs are stored independently of entities in the server save. Users can preview them, save new versions as separate entries, and load a pair into a new survivor draft. Death automatically archives the last deployed living and zombie programs, so losing a survivor never loses those programs. Manual saves are limited to 100 pairs per owner, plus one death archive per survivor.

New persistent worlds start without survivors or zombies. The migration removes known prototype fixture IDs and queued direct zombie injections from older saves while retaining player-created survivors. Legacy survivors receive the default zombie program if none was stored. The Programming tab offers a manual refresh of active entities and archives, and refreshes when entered without overwriting local drafts.

## Status presentation and public inspection

The selected owned entity has a status card with identity, public owner display name, state badge, position, kills and lifetime. Health, stamina, hunger and thirst use labeled native progress bars; hunger and thirst are explicitly marked as better when lower. Inventory uses five category-marked slots and distinguishes the equipped item. These private stats and inventory are only in the selected owner's observer payload.

Visible grid occupants carry an explicit public projection: ID, name, kind, owner display name, health/max health, kills and alive seconds. It never includes scripts, inventory, needs, ammunition, memory or login email. The inspector uses this projection only while the tile is currently visible. Previously explored terrain can be described without disclosing occupants; unexplored terrain stays unknown. Snapshot refreshes clear occupants lost from sight even when the pointer is stationary. Selection changes and logout reset inspection.

The grid supports mouse hover, touch selection and keyboard arrow navigation. Coordinates account for the rendered canvas size and border. Multiple actors sharing a tile get separate public cards. Kill credit is assigned only for fatal combat hits; needs deaths do not award kills. Birth/death simulation ticks persist per actor; zombie age begins at resurrection. Legacy saves with no birth record display unknown age rather than inventing one. Public account display names are provisioned through optional DEADWARE_USERS displayName, falling back to owner IDs.
