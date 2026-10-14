# Deadware isometric world

## Implementation

WorldView now uses an actual 64x32 diamond projection and original cached pixel art, rather than square cells with letters. Canvas 2D was retained: it already runs on the supported browser/Pages architecture, accommodates the existing interpolation, and avoids another renderer/runtime dependency. PixiJS would be appropriate if profiling later justifies GPU batching, but is unnecessary for this initial scope.

The authoritative server, coordinates, terrain categories, line of sight, collision, combat, SurvivorScript, database and API contracts are unchanged. Integer coordinates are tile centers, as required by the server's rounded grid lookup. World-to-isometric and inverse transforms operate on fractional positions as well as centers.

### Organization

- `client/src/rendering/IsometricCamera.ts`: reversible transforms, world picking, cursor-anchored zoom (0.35x-3x), pan, resize, smoothly eased centering/follow and viewport bounds.
- `renderConfig.ts`: palette, dimensions, client display settings and deterministic coordinate noise.
- `SpriteManager.ts`: original hand-authored pixel recipes, cache and replacement API. Categories cover terrain, roads, buildings/walls, vegetation, survivors, zombies, containers, vehicles, furniture, loot and effects. Unknown object names use the generic storage prop fallback.
- `BuildingRenderer.ts`: connected raised masonry, course shading, door jambs, closed panels and open leaves. Only explored/visible topology is used. Front walls fade when they overlap a permitted actor behind them.
- `EffectsRenderer.ts`: low-cost shadows, observed damage particles, day/dusk/night tint, optional rain/fog, restrained edge shading and reduced-motion support.
- `scene.ts`: last-seen terrain memory, current-position permission checks and deterministic depth ordering.
- `WorldRenderer.ts`: snapshot consumption, terrain cache, culling, actor interpolation/animation, depth-sorted objects, picking, effects and overlays.
- `client/src/ui/WorldView.tsx`: React controls and existing authorized inspection/inventory/history interface.
- `client/src/ui/worldRenderer.ts`: discoverable exports for the replacement modules.
- `client/tests/world.fixture.*`, `client/tests/capture-isometric.mjs`, `tests/browser/world.spec.ts`: seeded browser scene, optional screenshot capture and regressions.
- `client/src/style.css`: scoped dark World viewport/controls, retaining notebook styling elsewhere.

### Graphics

Ground uses deterministic texture variations, grass tufts, stones, pavement cracks and restrained foliage. Floors form coherent slabs; walls connect over the server's multi-tile building footprints. Furniture includes beds/sofas, chairs, tables/desks, shelves and storage. A two-tile vehicle is assembled only when both server-provided segments are currently visible; partial views use a single permitted segment. No hidden body orientation is inferred.

Characters have upright survivor versus stooped/ragged zombie silhouettes, six clothing variations, four facing directions, idle poses and four-frame walk cycles. Animation uses interpolated server motion and stops when confirmed samples stop. Zombies use a slower, offset cadence. Authorized death events drive a brief collapse/fade even after a removed victim disappears from the actor snapshot; explicit zero-health actors also have a prone pose. Damage particles require a health decrease between two permitted snapshots. Actor disappearance is never interpreted as death or combat.

All art is original programmatic pixel art. No source-game sprites, remote fonts, textures or graphics service are required. Texture contexts and final compositing use nearest-neighbor sampling. Colors and perspective are intentionally muted and readable rather than reproductions of any reference game.

### Add or replace assets

Keep assets separate from gameplay. `SpriteManager.register(category, name, sprite)` replaces a cached recipe by key. For example, a loaded `HTMLImageElement`, canvas or cropped `ImageBitmap` can be registered as:

```ts
renderer.sprites.register('terrain', 'empty-0', {
  image, width: 64, height: 32, anchorX: 32, anchorY: 16,
});
renderer.invalidateAssets();
```

Terrain keys are `${tileType}-${variant}` (variants 0-7); roads use category `roads`. Actor keys are `${facing}-${frame}-${variant}-${dead}-${pose}` under `survivors`/`zombies`; facing 0/1/2/3 corresponds to north/east/south/west in unchanged world coordinates. Objects use `${name}-${variant}` under containers/furniture/vehicles. Combined vehicles use `car-horizontal` or `car-vertical` in vehicles. Add new art recipes or image loaders here without adding gameplay terrain or changing renderer coordinate conventions. Anchors locate the sprite's ground contact point.

## Interaction and permissions

Drag the map to pan; scroll to zoom around the cursor. Reset centers the current observer (or first owned zombie) at 1x. Follow tracks the selected visible actor, falling back to the observer. Manual pan/wheel cancels follow. Arrow keys inspect logical neighboring tiles and ease the camera toward them; +/- zoom; 0 resets; Escape clears selection. Pointer capture prevents a pan from accidentally selecting a tile. Click pins an inspection, and actor selection highlights its interpolated ground position. Public actor details remain distinct from the owned observer's private inventory/equipment.

Display controls include day/dusk/night, clear/rain/fog, grid, names, health bars, sight boundaries, observed movement trails, coordinates and render statistics. Overlays and weather default off; lighting/weather are explicitly cosmetic. Trails are permitted historical samples, not invented future paths or destinations.

Unexplored tiles conceal terrain, actors, loot and props. Remembered terrain is darkened and contains no current actors/items/containers. Terrain seen earlier in this client session is frozen when out of sight, including door changes. On first load/reconnect, remembered terrain necessarily starts from the existing API's explored terrain projection; persistent historic door memory would require server-side last-seen terrain data. All-zombies uses the server's union of owned zombie sight; the renderer does not expand it or invent exploration memory. Interpolated actors require their current rounded footprint to be visible. New snapshots clear stale hit-test data immediately. Inspection reads current authoritative occupants/visibility, even before the rendering effect runs.

Raised sprites may extend visually above their permitted ground footprint; this is not a visibility expansion. Only permitted entities are ever submitted for drawing or picking.

## Performance

The renderer is an imperative object held in a React ref; animation does not rerender React. Snapshot processing occurs on receipt. Ground is cached in a viewport-sized canvas and rebuilt only after known terrain/visibility, camera, grid setting or viewport changes. Tile sprites and actor/prop variants are reused. Camera inverse bounds limit terrain lookup to the viewport. Offscreen objects and actors are culled before drawing; visible actors/objects/walls sort together by world-foot depth with stable tie breaks. Rain is capped at 65 strokes. Device pixel ratio is capped at 2. No full-world raster texture is allocated, even for the supported 300x300 map.

A browser stress scene covers 90,000 cells and 250 actors. At its tested viewport, 656 tiles and 244 actors were drawn; static terrain and sprite caches were reused between frames and the supplied snapshot stayed identical. This is a functional stress check, not a guarantee of a particular frame rate on every device. Timing is available via the optional render-statistics overlay.

## Verification

- `npm test`: 82 passed, 2 existing PostgreSQL-dependent integration tests skipped without database configuration. Existing simulation, motion, visibility, library and language assertions retained.
- Browser suite includes the existing seven Behavior Builder tests plus twelve World tests: reversible projection/picking/zoom, stable depth/memory, hover/click/pan/zoom/keyboard, current hidden occupants, all-zombies inspection, culling/interpolation/cache/immutability with 250 actors, mobile controls/overflow, real application routes with mocked API responses, and identical framebuffer pixels for unknown cells regardless of secret terrain/loot/actors, known-only roof grouping/cutaway, combat event deduplication/expiry and removed-victim animation.
- Production build and Pages repository-path artifact check exercise the existing Vite workflow.
- CI retains PostgreSQL tests and Pages build, and now installs Chromium and runs browser tests.

The browser fixture uses production WorldView and renderer modules, while the route smoke test loads the actual application. This is integrated application code, not a replacement demo. Browser tests mock snapshots and API responses; a live authenticated production walkthrough and physical-device testing remain useful follow-up verification.

## Remaining limits

Camera rotation, authoritative world time/weather, new gameplay terrain, persistent blood, pickup effects and door-opening event animations are not included. Cosmetic combat feedback is now based on permission-filtered execution events rather than action-history inference. Roof panels are cutaways over known existing building cells; there is no extrapolation of hidden rooms or additional building metadata. A richer atlas and additional terrain/prop art can be added through the existing asset API.

For reproducible base preview screenshots, start `npm run dev:client`, then run `node client/tests/capture-isometric.mjs`. It loads the real app with seeded, mocked API snapshots and saves desktop, dusk/rain and mobile images under ignored `test-results/`.

## Roofs, combat events and expanded art follow-up

New modules are `RoofRenderer.ts`, `TerrainTransitions.ts` and `CombatEffects.ts`. Roofs default on with an optional checkbox in Overlays. Connected groups contain only explored/visible building cells; unknown interiors are never filled by extrapolating a bounding box. Corrugated roof panels sort at ground-foot depth alongside walls/actors. Roof groups cut away for currently visible interior floors, visible occupants/active death effects, and hovered or selected known building tiles.

The art pass doubles actor clothing variants from three to six, adds hats/hood details and ragged zombie details, varies furniture finishes/blankets, adds exposed-earth patches, and connects pavement/floor edges to known neighboring ground. Transitions never consult hidden terrain.

The optional `WorldSnapshot.visualEvents` contains a stream ID and events with opaque UUID, authoritative simulation timestamp, type, public actor ID/kind/position, and (for successful attacks) permitted target position, melee/gun type and actual health damage. It is backwards compatible with clients/servers that omit the field. No database schema change is needed.

Combat execution emits successful attacks for survivors and zombies; actual deaths are emitted once, including starvation deaths. Cooldowns, failed actions, missing targets and unsuccessful shots emit no attack. The server transiently retains at most 2,048 events for 30 seconds. Private occurrence-time witness IDs never leave the server. Snapshot delivery requires the selected observer (or an owned zombie in union view) to have witnessed every event position at occurrence, and requires those positions still to be in the current permitted sight mask. No global sequence counter exposes hidden combat counts. Removed victims can still animate from an authorized death event.

The client deduplicates UUIDs per stream, aligns onset with the buffered motion clock, uses short attack poses/muzzle flashes and fading collapse sprites, suppresses effects in hidden cells, and expires them by elapsed wall time even if snapshots stall. Reconnects do not replay old combat. Effects are transient presentation feedback, not a durable event log; long disconnections, extreme event volume or exceptionally slow polling may omit animations rather than invent outcomes. Existing health feedback and action history remain available.

Actor asset keys now include pose: `${facing}-${frame}-${variant}-${dead}-${pose}`, with variants 0-5 and pose idle/attack/dying. Sprite registration and anchors work as before. Roof and transition art is authored in its dedicated renderer module rather than gameplay definitions.

Additional regression tests cover known-only roof groups/cutaway, event deduplication/timing/expiry/stalled snapshots, actual removed-victim animation, failed combat/cooldowns, event-time versus current visibility, opaque IDs, all-zombies witness filtering and restart behavior. Windows service deployment is separately documented in [Windows service guide](WINDOWS_SERVICE.md).


Final follow-up verification on Windows: 82 Node/server tests passed, two PostgreSQL-dependent tests skipped; all 19 browser tests passed. The native host readiness/stop self-test and PowerShell parsing passed. Production Vite builds and the /Deadware/ Pages artifact check passed. No service was registered and no reboot test was performed. Run `node client/tests/capture-roofs.mjs` against the development server for a seeded exterior-roof/cutaway preview.
