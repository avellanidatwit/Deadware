# Deadware Game Design & Technical Specification

> **The Deadware server is authoritative. Clients may observe the world and submit requests, but only the server may modify simulation state.**

This is the living reference for the implemented simulation and SurvivorScript. The player programs how survivors think: sensors feed conditions, priority rules choose actions, selectors identify targets, and memory retains observed locations.

## Game loop and world

The server advances continuous movement every 100 ms by default. Every sixth update evaluates scripts; movement intent persists between decisions. Survivors move at 1.0 tiles/second and zombies at 1.2, independent of decision frequency. Positions and interaction distances use decimal coordinates. Clients receive snapshots every 250 ms by default and interpolate confirmed server trajectories. Restarting restores positions, movement intent, stamina and cooldowns; downtime is not simulated.

The generated city contains roads, buildings, doors, furniture, containers, cars and zombies. Distances use Euclidean distance, with inclusive boundaries. Tile coordinates denote tile centers. Walls and closed doors block sight; diagonal corner gaps do not grant sight. Closed doors and solid furniture block movement. Survivors see up to eight tiles; larger script ranges cannot extend this. The map remembers explored terrain. Survivor navigation uses revealed terrain, while EXPLORE visits revealed, unvisited interior floor tiles first, then seeks unexplored boundaries. The map uses dark unexplored tiles, gray remembered terrain, bright visible terrain, and red outlines along the current vision boundary. Entities and floor loot remain hidden outside current sight. An unreachable selected target makes that action fail; selection does not switch to another target automatically.

## SurvivorScript language

Scripts are case-sensitive priority lists. Each `WHEN condition` or `OTHERWISE` has exactly one action on the next line. The first eligible matching rule wins. `NOT` binds before `AND`, then `OR`; evaluation short-circuits. There are no parentheses, loops, functions, or arbitrary variables. Blank lines and `#` comments are ignored.

### Conditions and targets

- Numeric comparisons: `health < 40`, `hunger >= 80`, `thirst >= 80`, `stamina < 20`, `ammo == 0`.
- Inventory: `hasItem food`, `equipped weapon`, `itemCount water < 2`, `inventorySpace`, `inventoryFull`, `itemsOnFloor`.
- Perception: `count zombie 5 >= 3`, `count food 5 >= 2`, `distance nearest zombie < 5`, `visible nearest food`.
- State: `remembered target`, `mode == fleeing`, `mode != scavenging`.

Numeric operators are `<`, `>`, `<=`, `>=`, `==`, `!=`; operands and ranges are nonnegative safe integers. Targets use `[selector] type [range]`. Selectors are nearest (default), farthest, weakest and strongest. Health selectors require actors. Categories include zombie, survivor, container, car, door, building, food, water, bandage, weapon, gun, ammo and armor. Guns also match weapon.

The shared target resolver applies sight, range, walls and living status. Actors exclude themselves. Explicit ranges cannot extend sight. Count returns actor/object counts or matching floor/building tile counts, not the number of individual items in a floor pile. ItemCount counts possessed items, including equipment once. Ammo item counts mean pouches; the ammo stat means loaded rounds. Missing targets make every distance comparison false. Visible accepts sensed categories, never memory slots.

### Actions

All target actions compile to `{ type: "targeted", verb, target }`, regardless of selector or omitted nearest keyword. Target behavior belongs in the shared resolver, not new condition types.

| Action | Meaning |
| --- | --- |
| `FIND food` | Approach visible matching loot; otherwise explore. Newly visible loot interrupts exploration on the next decision. Never collects or opens storage. |
| `MOVE_TO nearest food` | Approach the selected resolvable target; no exploration fallback. |
| `SEARCH container`, `SEARCH car` | Empty nearby storage onto the actor's floor tile; no movement or pickup. |
| `PICK_UP food`, `PICK_UP items` | Collect eligible loot underfoot, within inventory and weapon limits. |
| `MOVE_AWAY nearest zombie`, `FOLLOW survivor` | Flee or follow a selected actor. |
| `ATTACK weakest zombie`, `SHOOT zombie` | Melee within one tile, or shoot with an equipped loaded gun. |
| `OPEN door` | Open a selected adjacent closed door. |
| `DROP weapon`, `EQUIP weapon`, `EQUIP armor` | Drop or equip possessed items. |
| `EAT food`, `USE water`, `USE bandage`, `RELOAD` | Consume supplies. Reload uses one pouch to fill an equipped gun with magazine space. |
| `LOOK floor`, `LOOK floor food` | Inspect loot underfoot. |
| `MOVE east`, `EXPLORE`, `WAIT` | Travel directionally, explore, or stop. |
| `REMEMBER nearest container AS target`, `SET home = position` | Save coordinates in home, target, lastZombie or lastContainer. |
| `RETURN home`, `PATROL target` | Navigate to remembered coordinates or patrol between home and a remembered point. |
| `SET_MODE fleeing` | Switch to a declared mode, consuming the decision and cancelling movement. |

A missing target or unavailable selected action consumes the decision. Existing eligibility exceptions remain: impossible pickups and movement with insufficient stamina skip before condition evaluation. FIND explicitly explores when no target is visible. SPRINT can prefix a movement action. See the continuous movement section below for speeds and stamina.

Home starts at spawn. LastZombie and lastContainer refresh from visible targets at decisions and retain their last coordinates after sight is lost. Memory never tracks unseen movement. Saved coordinates persist across script replacement and server restarts.

### Mode lifecycle

Declare up to 16 unique modes before rules, using lowercase names matching `[a-z][a-z0-9_]{0,31}`. Undeclared references, duplicates, invalid names and late declarations are rejected. The first declaration is the default. With no declarations the actor has no mode, and mode references are invalid.

Deploying a script resets the entity to its new default even when names overlap; deploying a modeless script clears the mode. A restart preserves the current valid mode. A dead survivor's final mode remains inactive saved state. The new zombie starts independently in its zombie script's default mode, or no mode. Mode switching consumes one decision; the next decision evaluates the new mode.

```text
MODE scavenging
MODE fleeing

WHEN mode != fleeing AND visible nearest zombie
    SET_MODE fleeing

WHEN mode == fleeing AND count zombie 8 == 0
    SET_MODE scavenging

WHEN mode == fleeing
    MOVE_AWAY nearest zombie

WHEN itemsOnFloor AND inventorySpace
    PICK_UP items

OTHERWISE
    FIND food
```

### Zombies

Zombies use the same AST, generic count/distance/visible queries, health comparisons, Boolean logic and modes. They can MOVE, MOVE_TO, MOVE_AWAY, FOLLOW, ATTACK, EXPLORE, WAIT and SET_MODE. Their target actions and queries accept actors; attacks must target survivors. Inventory, environmental interactions, needs, sprint and coordinate memory remain survivor-only. Detection range defaults to five and cannot be extended by a query. Default behavior attacks within reach, approaches visible survivors, otherwise explores.

### Program budgets

The server permits 1-100 rules, 250 condition AST nodes total, 16 KiB of source and 512 characters per line. Each leaf, AND, OR, NOT and OTHERWISE counts as one node. There is no per-rule leaf limit. This bounds condition evaluation and target query counts without restricting a rule to five tests. Four memory slots and 16 bounded mode names limit persistent script state.

The parser also supports scenario options `maxRules`, `maxConditionNodes`, `memoryBudget` and `unlockedCapabilities`. Memory cost is a separate optional scenario score; condition nodes are the evaluation budget. Programs compile before deployment, not per tick.

### Optional server decision traces

Pass a `DecisionTrace` as the third argument to `runSurvivorProgram` for selection details, or the fourth argument to `decideActor` for selection plus execution results:

```ts
const trace: DecisionTrace = { rules: [] };
const result = decideActor(program, context, simulationTime, trace);
```

The trace contains the mode before/after, one-based selected rule, selected action, tested rules, actual condition values and results, skipped eligibility reasons, and execution failure text where available. Boolean children skipped by short-circuiting and rules after the selected rule are absent, not falsely reported as failed. An unavailable distance is null. Movement traces report selected intent, not a guarantee of arrival; navigation continues between decisions.

Tracing uses the same evaluator and resolver, with no extra perception or hidden branches. It is opt-in, per-call, and is not persisted or exposed in public snapshots. There is no new debugging UI. A reused trace is cleared on each decision.

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


## Continuous movement

Scripts select persistent movement intents, interrupted by a different movement or interaction decision. Repeating the same command keeps the path rather than restarting it. Grid pathfinding supplies cardinal waypoints through revealed terrain; actors follow them using floating-point coordinates. A radius of 0.22 tiles prevents walls, closed doors, furniture and living actors from being crossed. Blocked actors stop and retry; crowd congestion can still require a different route. Target tracking is refreshed at path segments and decisions, with continuous arrival and line-of-sight checks. Combat uses a 0.6-second attack cooldown and actual distance.

Prefix a survivor movement command with `SPRINT`, for example:

```text
WHEN count zombie 6 > 0 AND stamina > 20
    SPRINT MOVE_AWAY nearest zombie

OTHERWISE
    EXPLORE
```

Sprint raises the survivor speed to 1.6 tiles/second for up to three seconds. It requires 20 stamina to start, consumes 10 stamina per tile, ends when exhausted, and can start again eight seconds after activation. During cooldown the same command walks normally. Zombies cannot sprint. No command teleports an entity.

The browser renders with requestAnimationFrame, replaying bounded server movement traces slightly behind the simulation. It follows intermediate corners and does not extrapolate during network stalls. Hidden actors and hidden trajectory sections are excluded by the server; sprites are clipped to the current sight mask. Website layout and controls are unchanged.

Migration 003 changes survivor coordinates and health columns to double precision. Older integer-position world checkpoints load at their existing coordinates, with default speed and cooldown values. Back up the database before switching versions; reverting source alone does not restore earlier game progress.
