# Deadware Game Design & Technical Specification

> **The Deadware server is authoritative. Clients may observe the world and submit requests, but only the server may modify simulation state.**

This is the living reference for the implemented simulation and SurvivorScript. The player programs how survivors think: sensors feed conditions, priority rules choose actions, selectors identify targets, and memory retains observed locations.

## Game loop and world

The server advances every 100 ms, independently of connected clients. Every sixth tick is an actor decision: survivors act first, then living zombies. Clients poll snapshots once per second. Refreshing a page does not reset state; restarting the server restores the PostgreSQL checkpoint. No catch-up simulation runs during server downtime. Survivor movement is permitted every second update (displayed ticks 2, 4, 6, ...); zombies can move each update. Each action consumes one update, including an unsuccessful action. Death stops all actions and removes the entity from the grid.

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

Existing commands and action objects are preserved by the public facade; explicit selector commands compile to `{ type: "targeted", verb, target: { type, selector, range? } }`. New target behavior belongs in `targetResolver.ts`, not the parser or browser.

### Actions

| Syntax | Behavior |
| --- | --- |
| `MOVE north/south/east/west` | One cardinal step |
| `MOVE_TO [selector] type [range]` | One step toward the selected target; stop adjacent to actors, doors, storage or blocked terrain, on top of floor piles or remembered walkable locations |
| `MOVE_TO container [range]` | Short alias, default range 10 (still capped at sight range 8) |
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

Interaction and melee selectors resolve among targets within reach (one tile); a farther weak enemy does not prevent an adjacent attack. Combat targets must be alive. Dead enemies are removed immediately. Dropping a gun discards its loaded rounds. Survivors can carry only one weapon total (a gun or melee weapon), with separate equipped weapon and armor slots. On recovery, extra weapons are returned to the floor, preserving the equipped weapon when possible. Searching a container does not equip or pick up anything automatically.

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

## Application structure

The React client has View, Tutorial, Wiki, Code and Account pages. View includes the full Canvas map, tile inspection, entity status, inventory, grid legend and decision history. Code provides survivor creation, script editing and a saved-program library. Account supports registration, email/password login, username and email changes, signed-in password resets and permanent account deletion. Changes require the current password and revoke all sessions. Deletion requires typing DELETE and removes owned entities, queued spawns, scripts and account records in the same transaction as the world checkpoint. Tutorial and Wiki are available without signing in. It polls the API for updates. Sessions use HttpOnly cookies and survive page refreshes until expiry or logout.

- `client/`: website and API requests.
- `server/src/api/`: authentication, validation and ownership checks.
- `server/src/scripting/`: language definitions, parser and interpreter.
- `server/src/world.mjs`: world state, compiled programs and snapshots.
- `server/src/simulation/`: tick and save coordination.
- `server/src/database/`: PostgreSQL access and migrations.
- `server/src/data/`: item definitions and the default survivor program.
- `shared/`: public types shared with the client.

The website can run on GitHub Pages. The Node API and PostgreSQL run on one separate host. See [the README](../README.md) for setup and commands.

## Server and persistence

The server creates a world when no save exists. PostgreSQL stores accounts, sessions, survivors, script versions and a complete world checkpoint. The checkpoint preserves inventories, exploration, memory and queued spawns. Accepted changes are saved before success is returned. A failed save stops further operations, and a database lock prevents two servers from advancing the same world.

Passwords use Argon2id. Sessions expire after 12 hours. The API validates request origins, input and ownership; clients cannot choose owner IDs, positions, health or inventory. The runtime database role cannot change the schema. Scripts run through the game's interpreter and never execute JavaScript.

Only survivor creation enters the durable queue, limited to 100 entries. Each decision attempts one spawn on a free walkable tile. Each player may have at most 10 living survivors and queued spawns combined. Death frees a survivor slot. Dead survivors do not count, and zombies have no player quota. Existing populations above the limit are preserved but cannot add survivors until below the limit.

## Programming and resurrection

New survivors have a living program and a prepared zombie program. Both are validated before creation or deployment. Active survivors can update both; owned zombies can update their current program. Dead entities cannot receive updates. Direct zombie creation is disabled.

After survivor and zombie actions, dead survivors rise at their final coordinates with the same owner and prepared zombie program. They first act on the next decision. Stored origin and descendant IDs prevent duplicate resurrection after recovery.

Named script pairs can be saved, edited in the main editor and deleted from the Saved programs dropdown. Editing or deleting a library entry does not change deployed entity behavior. Death archives the last deployed living and zombie programs. Manual saves are limited to 100 pairs per owner, plus one death archive per survivor.

## Visibility

The server checks ownership of the selected observer. Survivors remember explored terrain; zombies see only their current surroundings. Other actors and loose items appear only within current sight. Public actor data excludes scripts, inventory, needs, memory and login email.

The map inspector supports pointer, touch and keyboard selection. It displays only the current snapshot's visible occupants. The entity sidebar shows the selected owner's status and inventory. The map scales to its panel without an internal scrollbar.

## Future work

Forgotten-password recovery by email, progression rewards and push updates are deferred. The scripting language does not support arbitrary variables, user functions or loops.


## Equipment and ammunition

Survivors deal 25 base damage. An equipped crowbar adds 15 melee damage; an equipped pistol adds 15 shooting damage, for 40 damage per shot. A pistol does not increase melee damage. The sidebar shows damage, base and weapon contributions, armor reduction, attack range and equipped item names. Loaded ammunition appears only while carrying a gun.

Armor vests block 5 damage per combat hit, to a minimum of zero damage. Equip one with `EQUIP armor`; `equipped armor` tests that slot. Armor does not block hunger or thirst damage. Vests are included in newly generated loot; existing world loot is preserved.

`RELOAD` consumes one ammo pouch to fill the equipped pistol to six rounds. It requires a carried pouch, an equipped gun and at least one empty magazine slot. Failed reloads do not consume pouches. Dropping a gun discards its loaded ammunition.

The View selector also offers All zombies: the server combines current sight from the signed-in player's living zombies. Other players' entities never contribute sight. Hovering or tapping an owned zombie selects its sidebar stats, which remain selected across snapshot updates until another zombie is selected.

Pickup rules are skipped when no matching floor item can be carried (including an extra weapon blocked by the one-weapon limit). Later matching rules can run instead. `itemsOnFloor` still detects all floor items.
