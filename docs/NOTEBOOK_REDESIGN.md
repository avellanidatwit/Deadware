# Deadware field notebook redesign

## Files changed in this pass

- `client/src/style.css`: shared notebook tokens and treatment of the existing application surfaces; compact wrapping rule sentences.
- `client/src/main.tsx`: Survivor behavior and Field instructions headings.
- `client/src/ui/BehaviorEditor.tsx`: compact checklist, Behavior / Script views, inline edits, condition tools, sortable priorities, focus after insertion, collapsed mode controls.
- `client/src/ui/NotebookRuleRow.tsx` (new): reusable sortable notebook row with margin handle and subtle priority number.
- `client/src/ui/ScriptLibraryControls.tsx`: four clickable preset notes, retaining the existing library and save controls.
- `shared/src/behaviorEditing.ts` (new): immutable priority reorder with fallback and invalid-index guards.
- `tests/behavior-builder.test.mjs`: priority, identity, immutability and fallback regression test.
- `tests/browser/behavior.spec.ts`, `client/tests/behavior.fixture.html`, `client/tests/behavior.fixture.tsx`, `playwright.config.ts` (new): isolated real-component browser harness and seven interaction/layout tests.
- `package.json`, `package-lock.json`: dnd-kit dependencies, Playwright development dependency, `test:browser` command.
- `.gitignore`: disposable browser results.
- This report and `docs/BEHAVIOR_BUILDER.md`: redesign documentation.

Existing unrelated changes in this checkout were preserved. The parser, serializer, execution engine and deployment APIs were not changed by this pass.

## Reusable UI and theme

`NotebookRuleRow` owns the sortable shell, drag affordance, priority number and visual drag state. `Choice`, `NumberField`, `Compare`, `TargetFields`, `ConditionFields` and `ActionFields` continue to share sentence controls inside the editor. Shared classes cover notebook headings, preset notes, annotations, menus and checklist rows.

CSS variables define paper, panel, paper tabs, ink, faded ink, border, ruled line, red margin, error ink/paper, marker highlight, shadow, meter inks, stains, edge wear and tape. A 32px repeating gradient draws ruled lines; a red vertical gradient draws the page margin. Low-opacity radial gradients suggest wear. There are no texture images or remote font requests. Readable system UI fonts serve controls and data; locally available handwriting fonts accent headings. Navigation uses paper tabs, tables use field-log separators, and primary form actions use an outlined stamp treatment.

Shared styles cover World, Code, Wiki, tutorial, Account, entity dossiers, inventories, logs, notifications and authentication. World canvas content retains its simulation rendering; its frame adds paper and restrained tape accents.

## Ordering and checklist rules

The two normal lines are `WHEN [condition sentence]` and an indented `-> [action sentence]`. Numbers are secondary margin annotations. The drag handle doubles as the checklist marker; there is no misleading enable checkbox and no new engine disable state.

Dragging uses dnd-kit Sortable with PointerSensor (mouse, pen and touch pointer input), a 6px activation threshold and KeyboardSensor with sortable coordinates. Only the handle has drag listeners. Nearby rows animate, the active row gets a paper shadow, and the current insertion target has an ink line. Dropping updates canonical script priority immediately without deploying. Each editor-authored row has a stable UI ID, so moving it does not remount its controls or reset their data. External script replacement/preset selection resets UI IDs intentionally.

OTHERWISE is not draggable or droppable. The shared reorder helper also rejects moving it or targeting its index. Adding a regular rule inserts before OTHERWISE. Space picks up/drops a focused handle, arrows move it, Escape cancels. Move up/down are available in the secondary menu as another fallback.

Duplicate, delete, add/remove condition and move fallbacks live in a small rule menu. Negation and optional search constraints use small sentence menus; active NOT and search-range values remain visible in the sentence. Pointer users see secondary affordances on hover/focus, and touch users see them persistently. Add rule inserts directly and focuses its first visible dropdown.

## AST and multiple conditions

Script text is still the draft source of truth. Visual edits follow the existing flow: parse into `SurvivorProgram` -> update the selected `Condition`/`SurvivorAction` -> serialize canonically -> validate with the parser -> update the draft. Existing form submission performs server validation and deployment. Reordering changes only the rule array order. Failed validation restores the previous UI ID order.

Flat multi-condition rules display their clauses in one wrapping sentence with AND or OR dropdowns between clauses. A rule uses a uniform connective; switching one connector changes the whole flat group. Nested Boolean programming is intentionally absent. Sprint is part of the action wording, such as Sprint away from, rather than a permanent extra checkbox.

Behavior is the initial view. Script preserves the raw editor. Merely switching views does not rewrite text; editing visually uses the existing canonical serializer, including its removal of comments. Generated script is collapsed below the checklist.

## Responsive behavior and accessibility

Common desktop rules fit two lines; longer multi-condition sentences wrap naturally rather than becoming large stacked forms. On mobile, action indentation and page margins shrink; compact inputs and all secondary tools remain usable. Browser tests check interaction and absence of horizontal document overflow at 375px.

Native labeled selects/number inputs, visible focus, readable ink contrast, semantic fieldset/legend, alert annotations and keyboard reordering remain available. dnd-kit provides keyboard instructions and live announcements. Reduced-motion preferences disable row transitions. Touch handles use `touch-action: none` while the surrounding page can scroll. Automated tests cover mouse and keyboard; physical-device touch behavior has not been manually checked.

## Example visual sentences and canonical scripts

Visual:

    WHEN nearest Zombie is within 2 tiles
      -> Attack nearest Zombie

```survivorscript
WHEN distance nearest zombie <= 2
    ATTACK nearest zombie
```

Visual:

    WHEN Health is below 35 AND Carrying Bandage
      -> Use Bandage

```survivorscript
WHEN health < 35 AND hasItem bandage
    USE bandage
```

Visual:

    WHEN Number of Zombies within 6 tiles is at least 3
      -> Sprint away from nearest Zombie

```survivorscript
WHEN count zombie 6 >= 3
    SPRINT MOVE_AWAY nearest zombie
```

Visual:

    WHEN Hunger is above 70 AND Carrying Food
      -> Eat Food
    OTHERWISE
      -> Explore

```survivorscript
WHEN hunger > 70 AND hasItem food
    EAT food

OTHERWISE
    EXPLORE
```

Count sentences pluralize Zombie and Survivor target labels. Needs remain explicit numeric conditions, rather than introducing ambiguous Hungry/Thirsty thresholds.

## Tests and limits

- `npm test`: 74 passed, 2 skipped; database/account integration tests require the existing PostgreSQL configuration. Existing parser/server assertions were retained.
- `npm run test:browser`: seven Chromium tests cover pointer reorder and subsequent AST edits, keyboard reorder/cancel/fallback boundary, condition/action edits and both mode round trips, all four presets and insertion focus, unsupported advanced script preservation, mobile interaction/overflow, and two-line desktop layout.
- `npm run build:client`: production TypeScript and Vite build pass.

Advanced scripts containing nested/mixed AND/OR trees, repeated negation, multiple OTHERWISE clauses or a nonfinal OTHERWISE remain protected from visual edits and available as text. Invalid scripts also remain in the raw editor without destructive conversion. Existing complex memory, mode and range controls remain available in compact/secondary controls, but can exceed two lines when combined heavily.

No screen is intentionally left on the previous dark theme. A manual authenticated walkthrough of live Account operations, inventories and all World inspector states remains to be done; those surfaces inherit the shared theme and existing layout. No functionality on those pages was rebuilt. Browser tests use a local isolated fixture with the production components, not a running database or authenticated deployment.
