# Deadware Game Design & Technical Specification

This is the living reference for the implemented simulation and SurvivorScript. The player programs how survivors think: sensors feed conditions, priority rules choose actions, selectors identify targets, and memory retains observed locations.

## Game loop and world

The browser advances every 600 ms. Survivors act first, then living zombies. Pause freezes ticks and needs; Step advances one tick while paused. Restart generates a new session. Survivor movement is permitted every second update (displayed ticks 2, 4, 6, ...); zombies can move each update. Each action consumes one update, including an unsuccessful action. Death stops all actions and removes the entity from the grid.

The generated city contains roads, buildings, doors, furniture, containers, cars and zombies. Distances use Manhattan distance, with inclusive boundaries. Walls and closed doors block sight; diagonal corner gaps do not grant sight. Closed doors and solid furniture block movement. Survivors see up to eight tiles; larger script ranges cannot extend this. The map remembers explored terrain. Survivor navigation uses revealed terrain, while EXPLORE seeks unexplored boundaries. An unreachable selected target makes that action fail; selection does not switch to another target automatically.

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
| `EXPLORE`, `WANDER` | Seek an unexplored boundary on revealed terrain |
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

The sandbox leaves capabilities unlocked and program size unlimited. The editor reports compiled program memory on Apply. Scenarios can opt into restrictions before installing a program:

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

The editor applies valid scripts on the next tick, retains drafts when switching actors, and reports line-numbered errors without discarding the running program. Stats show health, position, hunger, thirst, stamina and loaded ammunition. Inventory and floor panels show items. The in-page command reference gives the core syntax; this document is the full specification.

`src/scripting/survivorScript.ts` is the stable public entry point. `language/` owns types, selectors, capability metadata and shared traversal/classification. `parser/` handles rules, conditions, actions and targets. `runtime/` owns context, condition evaluation, target resolution, rule selection, action execution and complete survivor ticks. `main.ts` handles browser controls and rendering; it delegates simulation behavior to the runtime. Entity classes own inventory and needs state. World perception remains the source of LOS and spatial queries.

Run `npm test` to build and test parsing, actor restrictions, inventory conservation, sight, targeting, combat, memory, cooldowns, needs, program budgets, city generation, browser controls and sustained simulation.

## Roadmap and boundaries

Implemented: modular language, formal syntax, selectors, items, needs, counts, item/building/car sensing, distance comparisons, Boolean logic, built-in memory, following and patrol, optional capacity/progression configuration, and reusable simulation execution.

Deferred as proposed: arbitrary variables, user functions, loops, bleeding/infection systems, group communication and shared destinations, and progression rewards. Following works when multiple survivors are supplied to the runtime; the default browser scenario still has one player survivor. Multiplayer, saved worlds, script persistence across refreshes and account progression need separate designs; no network or persistence layer is implied by this implementation.
