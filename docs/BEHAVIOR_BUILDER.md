> The current notebook checklist UI, file list, interactions, examples and verification are documented in [Notebook redesign](NOTEBOOK_REDESIGN.md). The implementation history below describes the earlier form-style builder.

# Behavior Builder implementation

Added files:
- `client/src/ui/ScriptLibraryControls.tsx`: independent starter dropdowns and library actions for survivor and zombie scripts.
- `tests/script-library.test.mjs`: independent saves, ownership, recovery, legacy pairs, and zombie preset deployment.
- `client/src/ui/BehaviorEditor.tsx`: sentence controls, rule cards, presets, mode management, preview and editor switching.
- `server/src/scripting/language/serializer.ts`: canonical serialization, compatibility checks and reference-safe mode renaming.
- `server/src/scripting/language/options.ts`: shared action/item/target restrictions.
- `shared/src/behaviorPresets.ts`: Coward, Scavenger, Fighter and Explorer scripts.
- `tests/behavior-builder.test.mjs`: 14 representation, preset deployment and validation tests.
- `docs/BEHAVIOR_BUILDER.md`: this report.

Modified files:
- `client/src/main.tsx`: full-width visual editor, separate survivor/zombie library controls, and existing explicit deployment.
- `server/src/world.mjs`, `server/src/api/app.ts`, and `shared/src/types/api.ts`: independent typed library entries, actor-specific save/update/delete endpoints, and compatible views of legacy script pairs.
- `client/src/style.css`: responsive cards and wrapping sentence controls.
- `client/src/content/tutorial.html` and `wiki.html`: visual-first guide, priority, needs, targeting, scavenging, modes and memory.
- `server/src/scripting/parser/parser.ts`: browser-compatible UTF-8 byte-size validation.
- `server/src/scripting/parser/actions.ts`: consume common validity options while retaining survivor/zombie actor validation.

## Architecture

There is no independent builder behavior format. Script text remains the application draft. The visual editor parses it using the same parser and `SurvivorProgram`, `Condition`, `SurvivorAction` and `Target` types used by execution. Every visual mutation serializes the program and validates the result before updating that draft. Switching views alone does not rewrite text, including comments. Visual edits produce deterministic canonical formatting and remove comments. Deployment and creation still use existing APIs and server validation. Independent library entries use `/behavior-scripts/:kind` and `/behavior-scripts/:kind/:id`, validating only the requested actor language. Legacy paired-script endpoints remain supported.

The UI accepts individual conditions and flat ALL (AND) or ANY (OR) lists. Mixed groups, repeated NOT, multiple fallbacks, or a fallback before other rules are refused by the visual editor without changing the script. The original raw editor remains available. The serializer also refuses trees requiring parentheses, which the language does not support.

## Supported controls

Conditions: health, hunger, thirst, stamina, ammo, all six numeric comparisons, inventory possession, equipped item, inventory quantity, visibility, distance, counts within a range, remembered slots, inventory full/space, floor items, and current mode equality/inequality. Individual conditions can be negated.

Actions: move toward/away, attack, shoot, search, find, open, follow, return, patrol, pick up a category/all eligible items, drop, eat, use, equip, reload, look at floor (optionally a category), directional movement, explore, wait, remember a target/current position and change mode. Movement actions have a Sprint toggle. Optional target search ranges and selectors survive round trips. WANDER is not offered because it is not a valid current language command.

Rule cards support add, reorder, delete and duplicate; condition lists support add/remove and ALL/ANY. At most one optional OTHERWISE is kept at the bottom without conditions. Missing fallback preserves the runtime's implicit Wait behavior and existing eligibility skips.

Modes use existing lowercase identifiers, with the first declaration marked default. Renaming updates condition/action references. Referenced modes cannot be deleted. Existing Home, Target, Last zombie and Last container memory slots are used; no arbitrary variables were added.

The full-width Code editor has a Starting behavior dropdown in each script section. Selecting a saved entry changes only that section. Each script has its own name, Save, Update, and Delete controls; saving one never depends on the other draft. New entries persist independently with an actor kind and code. Existing pairs and archived pairs are exposed as two independently editable entries, with separate names and deletion flags to preserve legacy API compatibility.

Zombie presets are Hunter, Pack follower, Cautious, Roamer, and Guard. Custom starts with Explore. All validate against the restricted zombie language and are tested through saving and deployment to a risen zombie.

Four editable survivor presets are ordinary scripts: Coward, Scavenger, Fighter and Explorer. Custom starts with OTHERWISE Explore. Selecting a starting behavior replaces the current draft without deploying it. New survivors use the visual interface, with presets available immediately.

Errors appear within the editor, with line-based errors also placed beside the matching rule where possible. The server remains the final deployment authority. Successful deployment gives explicit feedback.

## Examples and their cards

```text
WHEN health < 30 AND hasItem bandage
    USE bandage

OTHERWISE
    EXPLORE
```

Rule 1: WHEN Match All: Needs and health → Health → is below → 30; Inventory contains → Bandage. THEN Use → Bandage. OTHERWISE: Explore.

```text
WHEN count zombie 6 >= 3 AND stamina >= 20
    SPRINT MOVE_AWAY nearest zombie
```

Rule 1: WHEN Match All: Nearby count → Zombie → within 6 tiles → is at least 3; Needs and health → Stamina → is at least 20. THEN Move away from → nearest → Zombie, with Sprint checked.

```text
MODE scavenging
MODE fleeing

WHEN count zombie 6 >= 3
    SET_MODE fleeing

WHEN mode == fleeing
    MOVE_AWAY nearest zombie

OTHERWISE
    EXPLORE
```

Modes: Scavenging (default), Fleeing. Rule 1 checks at least 3 Zombies within 6 tiles and changes mode to Fleeing. Rule 2 checks Current mode is exactly Fleeing and moves away from nearest Zombie. OTHERWISE explores. As in raw SurvivorScript, changing mode consumes a decision; subsequent decisions use the new mode. Add a return-to-Scavenging rule to leave Fleeing.

```text
WHEN NOT remembered home
    REMEMBER position AS home

WHEN remembered home
    RETURN nearest home
```

Rule 1: Memory is known → Home, with Opposite condition checked; Remember → Position → as Home. Rule 2: Memory is known → Home; Return to → nearest → Home.

## Verification and follow-up

The full suite passes, including preset creation/deployment through `World.inject` and `World.deploy`, semantic round trips, mode rename/deletion validation, offered combinations, and unsupported script preservation. PostgreSQL/account integration tests require their existing database configuration and are skipped when absent. The production client build passes.

Existing decision tracing already reports rule matches, evaluated values, selected action and execution failures; it is retained. A future survivor detail explanation panel can consume it without changing the language. Other follow-ups: browser interaction/accessibility automation, database-backed integration runs, and moving the now browser-safe language modules into a shared package directory for cleaner ownership. This pass verifies production compilation and headless behavior; it does not claim a manual authenticated browser walkthrough.
