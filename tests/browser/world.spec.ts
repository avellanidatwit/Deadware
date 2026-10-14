import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/world.fixture.html');
  await expect(page.getByRole('img', { name: 'Isometric world' })).toBeVisible();
});

test('projection and cursor-anchored zoom are reversible at tile centers and fractional actor positions', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { IsometricCamera, worldToIso, isoToWorld } =
      await import('/src/rendering/IsometricCamera.ts');
    const camera = new IsometricCamera();
    camera.resize(1000, 650);
    let error = 0;
    for (const zoom of [0.35, 0.8, 1, 2, 3])
      for (const p of [
        { x: 0, y: 0 },
        { x: 12, y: 7 },
        { x: 299, y: 299 },
        { x: 3.28, y: 7.75 },
      ]) {
        camera.zoom = zoom;
        camera.center({ x: 8.3, y: 15 });
        const iso = isoToWorld(worldToIso(p)),
          back = camera.toWorld(camera.toScreen(p));
        error = Math.max(
          error,
          Math.hypot(p.x - iso.x, p.y - iso.y),
          Math.hypot(p.x - back.x, p.y - back.y),
        );
        const tile = camera.pick(camera.toScreen(p));
        if (tile.x !== Math.round(p.x) || tile.y !== Math.round(p.y)) return { error: 100 };
      }
    const cursor = { x: 124, y: 512 },
      before = camera.toWorld(cursor);
    camera.zoomAt(cursor, 0.4);
    const after = camera.toWorld(cursor);
    error = Math.max(error, Math.hypot(before.x - after.x, before.y - after.y));
    camera.zoomAt(cursor, 1000);
    const max = camera.zoom;
    camera.zoomAt(cursor, 0.0001);
    return { error, max, min: camera.zoom };
  });
  expect(result.error).toBeLessThan(1e-8);
  expect(result.max).toBe(3);
  expect(result.min).toBe(0.35);
});

test('depth sorting, deterministic textures, and remembered terrain respect visibility', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { compareDepth, rememberTerrain, permittedPosition } =
      await import('/src/rendering/scene.ts');
    const { noise } = await import('/src/rendering/renderConfig.ts');
    const old = {
      x: 2,
      y: 3,
      visible: true,
      explored: true,
      tileType: 'door',
      entities: [],
      items: [],
    };
    const hidden = {
      ...old,
      visible: false,
      tileType: 'openDoor',
      entities: [{ id: 'secret', x: 2, y: 3, symbol: 'Z' }],
      items: [{ id: 'secret-loot' }],
    };
    const cells = rememberTerrain([hidden], new Map([['2,3', old]]));
    const c = cells.get('2,3')!;
    const entries = [
      { id: 'front', x: 4, y: 4, layer: 1 },
      { id: 'actor', x: 3, y: 4, layer: 3 },
      { id: 'back', x: 2, y: 3, layer: 1 },
    ].sort(compareDepth);
    return {
      terrain: c.tileType,
      entities: c.entities.length,
      items: c.items.length,
      visible: permittedPosition(cells, { x: 2, y: 3 }),
      order: entries.map((e) => e.id),
      stable: noise(2, 3) === noise(2, 3),
    };
  });
  expect(result).toEqual({
    terrain: 'door',
    entities: 0,
    items: 0,
    visible: false,
    order: ['back', 'actor', 'front'],
    stable: true,
  });
});

test('tile hover and pinned selection work through pan, zoom, and keyboard inspection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = page.getByRole('img', { name: 'Isometric world' });
  const box = (await canvas.boundingBox())!;
  // Camera starts on observer (9,12); pick a ground point one tile west, away from sprite bounds.
  const x = box.x + box.width / 2 - 32,
    y = box.y + box.height / 2 - 16;
  await page.mouse.move(x, y);
  await expect(page.locator('.inspector-topline')).toContainText('(8, 12)');
  await page.mouse.click(x, y);
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
  await page.mouse.move(x + 150, y + 50);
  await expect(page.locator('.inspector-topline')).toContainText('(8, 12)');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.inspector-topline')).toContainText('(9, 12)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0);
  await page.getByLabel('Follow selected').check();
  await expect(page.getByLabel('Follow selected')).toBeChecked();
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 240, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0);
  await expect(page.getByLabel('Follow selected')).not.toBeChecked();
  await page.mouse.wheel(0, -250);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.mouse.move(x, y);
  await expect(page.locator('.inspector-topline')).toContainText('(8, 12)');
});

test('current hidden occupants cannot persist in inspector after a new snapshot', async ({
  page,
}) => {
  const canvas = page.getByRole('img', { name: 'Isometric world' });
  await canvas.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#tile-contents')).toContainText('Mara');
  await page.evaluate(() => {
    const w = structuredClone((window as any).fixtureWorld);
    const c = w.cells.find((c: any) => c.x === 9 && c.y === 12);
    c.visible = false;
    c.entities = [];
    c.items = [];
    w.tick++;
    (window as any).updateWorld(w);
  });
  await expect(page.locator('#tile-contents')).not.toContainText('Mara');
  await expect(page.locator('#tile-description')).toContainText('Previously explored');
});

test('all-zombies union and public inspection remain available without survivor inventory', async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = structuredClone((window as any).fixtureWorld);
    w.observer = null;
    const entity = w.cells.flatMap((c: any) => c.entities).find((e: any) => e.id === 'z0');
    w.zombieObservers = [
      {
        ...entity.actor,
        x: entity.x,
        y: entity.y,
        sightRange: 5,
        message: 'Zombie program is running.',
      },
    ];
    (window as any).updateWorld(w);
    (window as any).setAllZombies(true);
  });
  await page.getByRole('button', { name: 'Reset camera' }).click();
  const canvas = page.getByRole('img', { name: 'Isometric world' }),
    b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 20);
  await expect(page.locator('.identity-copy')).toContainText('Wanderer 0');
  await expect(page.locator('.inventory-grid')).toHaveCount(0);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 - 20);
  await expect(page.locator('#tile-contents')).toContainText('Wanderer 0');
});

test('renderer culls a 300x300 map, reuses terrain and sprites, and does not mutate snapshots', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { WorldRenderer } = await import('/src/rendering/WorldRenderer.ts');
    const canvas = document.createElement('canvas'),
      r = new WorldRenderer(canvas),
      w = structuredClone((window as any).fixtureWorld);
    w.width = 300;
    w.height = 300;
    w.cells = [];
    for (let y = 0; y < 300; y++)
      for (let x = 0; x < 300; x++)
        w.cells.push({
          x,
          y,
          visible: true,
          explored: true,
          tileType: 'road',
          entities: [],
          items: [],
        });
    for (let i = 0; i < 250; i++) {
      const x = 5 + (i % 18),
        y = 5 + Math.floor(i / 18);
      w.cells[y * 300 + x].entities.push({
        id: 'crowd-' + i,
        x,
        y,
        symbol: i % 2 ? 'S' : 'Z',
        motion: [
          { time: 9, x: x - 0.2, y },
          { time: 10, x, y },
        ],
        actor: { id: 'crowd-' + i, health: 100, maxHealth: 100 },
      });
    }
    const before = JSON.stringify(w);
    r.resize(900, 600);
    r.setSnapshot(w, 100);
    r.render(100, 9.5);
    const first = { ...r.stats },
      size = r.sprites.size;
    r.render(116, 9.516);
    const second = { ...r.stats };
    return {
      tiles: second.tiles,
      actors: second.actors,
      builds: first.terrainBuilds === second.terrainBuilds,
      cache: size === r.sprites.size,
      unchanged: JSON.stringify(w) === before,
      frameMs: second.frameMs,
      moved: Array.from(r.positions.values()).some((p: any) => !Number.isInteger(p.x)),
    };
  });
  expect(result.tiles).toBeLessThan(1800);
  expect(result.actors).toBeGreaterThan(100);
  expect(result.builds).toBe(true);
  expect(result.cache).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.moved).toBe(true);
  console.log('250-actor / 90,000-tile scene:', result);
});

test('lighting, weather, overlay controls, and responsive viewport stay usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Ambient lighting').selectOption('night');
  await page.getByLabel('Cosmetic weather').selectOption('rain');
  await page.locator('.world-overlays summary').click();
  for (const name of [
    'Grid lines',
    'Entity names',
    'Health bars',
    'Sight boundary',
    'Observed movement trails',
    'Coordinates',
    'Render statistics',
  ])
    await page.getByLabel(name, { exact: true }).check();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('img', { name: 'Isometric world' })).toBeVisible();
});

test('real application still loads API snapshots, Code, Wiki and Account routes', async ({
  page,
}) => {
  const world = await page.evaluate(() => (window as any).fixtureWorld);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: any = {};
      if (path === '/api/me')
        data = { id: 'owner', username: 'Scout', email: 'scout@example.test' };
      if (path === '/api/world') data = world;
      if (path === '/api/programming')
        data = {
          entities: [],
          queue: [],
          scripts: [],
          behaviorScripts: [],
          defaults: { script: 'OTHERWISE\n EXPLORE', zombieScript: 'OTHERWISE\n WAIT' },
        };
      await route.fulfill({ json: data });
    },
  );
  await page.goto('/#view');
  await expect(page.getByRole('img', { name: 'Isometric world' })).toBeVisible();
  await page.locator('nav a[href="#code"]').click();
  await expect(page.getByRole('button', { name: 'Behavior', exact: true })).toBeVisible();
  await page.locator('nav a[href="#wiki"]').click();
  await expect(page.locator('.reading-page')).toBeVisible();
  await page.locator('nav a[href="#account"]').click();
  await expect(page.locator('.account-settings')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hidden terrain, loot and actors produce identical pixels regardless of secret contents', async ({
  page,
}) => {
  const same = await page.evaluate(async () => {
    const { WorldRenderer } = await import('/src/rendering/WorldRenderer.ts');
    const w = structuredClone((window as any).fixtureWorld);
    w.observer.x = 17;
    w.observer.y = 17;
    for (const cell of w.cells) {
      cell.visible = false;
      cell.explored = false;
      cell.entities = [];
      cell.items = [];
    }
    const snapshot = (secret: boolean) => {
      const input = structuredClone(w);
      if (secret)
        for (const cell of input.cells) {
          cell.tileType = 'buildingWall';
          cell.entities = [{ id: 'hidden', x: cell.x, y: cell.y, symbol: 'Z' }];
          cell.items = [{ id: 'hidden-loot', type: 'gun' }];
        }
      return input;
    };
    const pixels = (input: any) => {
      const canvas = document.createElement('canvas'),
        r = new WorldRenderer(canvas);
      r.resize(600, 400);
      r.setSnapshot(input);
      r.render(100, 10);
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = pixels(snapshot(false)),
      b = pixels(snapshot(true));
    return a.length === b.length && a.every((value, index) => value === b[index]);
  });
  expect(same).toBe(true);
});

test('roofs group only known building cells and cut away for visible interiors, actors or inspection', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { roofGroups, roofCutaway } = await import('/src/rendering/RoofRenderer.ts');
    const cell = (x: number, y: number, tileType: string, explored = true, visible = false) => ({
      x,
      y,
      tileType,
      explored,
      visible,
      items: [],
      entities: [],
    });
    const cells = new Map([
      ['1,1', cell(1, 1, 'buildingWall', true, true)],
      ['1,2', cell(1, 2, 'buildingFloor')],
      ['2,2', cell(2, 2, 'buildingFloor', false)],
      ['8,8', cell(8, 8, 'buildingWall', true, true)],
    ]);
    const groups = roofGroups(cells),
      group = groups.find((g: any) => g.keys.has('1,1'))!;
    const exterior = roofCutaway(group, null, []),
      inspect = roofCutaway(group, { x: 1, y: 2 }, []),
      actor = roofCutaway(group, null, [{ x: 1, y: 2 }]);
    group.tiles.find((c: any) => c.tileType === 'buildingFloor')!.visible = true;
    return {
      count: groups.length,
      tiles: group.tiles.length,
      unknown: group.keys.has('2,2'),
      exterior,
      inspect,
      actor,
      interior: roofCutaway(group, null, []),
    };
  });
  expect(result).toEqual({
    count: 2,
    tiles: 2,
    unknown: false,
    exterior: false,
    inspect: true,
    actor: true,
    interior: true,
  });
  await page.locator('.world-overlays summary').click();
  await expect(page.getByLabel('Roofs (automatic cutaway)', { exact: true })).toBeChecked();
  await page.getByLabel('Roofs (automatic cutaway)', { exact: true }).uncheck();
});

test('combat effects deduplicate events, align with motion time, expire and reject hidden positions', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { CombatEffects } = await import('/src/rendering/CombatEffects.ts');
    const effects = new CombatEffects();
    const event = {
      id: 'event-1',
      time: 10,
      type: 'attack',
      actor: { id: 'human', kind: 'survivor', x: 1, y: 1 },
      target: { id: 'z', kind: 'zombie', x: 2, y: 1 },
      weapon: 'gun',
      damage: 25,
    };
    const cells = new Map([
        ['1,1', { visible: true }],
        ['2,1', { visible: true }],
      ]),
      stream = { streamId: 'world-1', events: [event] };
    effects.receive(stream, 10);
    effects.receive(stream, 10);
    const future = effects.active(9.9, cells).length,
      active = effects.active(10.1, cells).length;
    cells.get('2,1')!.visible = false;
    const hidden = effects.active(10.2, cells).length;
    cells.get('2,1')!.visible = true;
    const stalled = effects.active(10.2, cells, performance.now() + 1000).length;
    const expired = effects.active(11, cells).length;
    effects.receive(stream, 11);
    const replay = effects.active(11, cells).length;
    effects.receive(
      { streamId: 'world-2', events: [{ ...event, time: 12, type: 'death', target: undefined }] },
      12,
    );
    const reset = effects.active(12.1, cells).length;
    return { future, active, hidden, stalled, expired, replay, reset };
  });
  expect(result).toEqual({
    future: 0,
    active: 1,
    hidden: 0,
    stalled: 0,
    expired: 0,
    replay: 0,
    reset: 1,
  });
});

test('authoritative attack and removed-actor death events change rendered pixels once and expire', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { WorldRenderer } = await import('/src/rendering/WorldRenderer.ts');
    const w = structuredClone((window as any).fixtureWorld);
    const canvas = document.createElement('canvas'),
      r = new WorldRenderer(canvas);
    r.resize(700, 500);
    r.setSnapshot(w);
    r.render(100, 10);
    const before = canvas.toDataURL();
    w.visualEvents = {
      streamId: 'combat-demo',
      events: [
        {
          id: 'shot',
          time: 10,
          type: 'attack',
          actor: { id: 'human', kind: 'survivor', x: 9, y: 12 },
          target: { id: 'removed', kind: 'zombie', x: 10, y: 12 },
          weapon: 'gun',
          damage: 100,
        },
        {
          id: 'death',
          time: 10,
          type: 'death',
          actor: { id: 'removed', kind: 'zombie', x: 10, y: 12 },
        },
      ],
    };
    r.setSnapshot(w);
    r.render(150, 10.1);
    const active = canvas.toDataURL();
    const count = r.combatEffects.active(10.1, r.cells, 150).length;
    r.render(1000, 11);
    return {
      changed: before !== active,
      count,
      expired: r.combatEffects.active(11, r.cells, 1000).length,
    };
  });
  expect(result).toEqual({ changed: true, count: 2, expired: 0 });
});
