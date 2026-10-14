import { test, expect, type Page } from '@playwright/test';
const fixture = '/tests/behavior.fixture.html';
test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
  await expect(page.locator('.behavior-rule')).toHaveCount(4);
});
const draft = (page: Page) => page.getByTestId('script');
test('pointer drag changes priority, retains data, then edits the moved AST rule', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  const handle = page.locator('.drag-handle').first(),
    target = page.locator('.behavior-rule').nth(1);
  const a = (await handle.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 });
  await expect(page.locator('.is-dragging')).toHaveCount(1);
  await page.mouse.move(a.x + a.width / 2, b.y + 20, { steps: 15 });
  await expect(target).toHaveClass(/is-over/);
  await page.mouse.up();
  await expect(draft(page)).toHaveText(/^WHEN health < 35 AND hasItem bandage/);
  const moved = page.locator('.behavior-rule').nth(1);
  await moved.getByLabel('Distance in tiles', { exact: true }).fill('7');
  await moved.getByLabel('Action', { exact: true }).selectOption('MOVE_AWAY');
  await expect(draft(page)).toContainText(
    'WHEN distance nearest zombie <= 7\n    MOVE_AWAY nearest zombie',
  );
  await expect(draft(page)).toContainText('WHEN health < 35 AND hasItem bandage\n    USE bandage');
  await expect(page.locator('.behavior-rule').last()).toHaveAttribute('aria-label', 'Otherwise');
});
test('keyboard drag, cancel, and fallback boundary', async ({ page }) => {
  const handle = page.locator('.drag-handle').first();
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.is-dragging')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.behavior-rule').nth(1)).toHaveClass(/is-over/);
  await page.keyboard.press('Space');
  await expect(draft(page)).toHaveText(/^WHEN health < 35/);
  const before = await draft(page).textContent();
  await page.locator('.drag-handle').first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.is-dragging')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.behavior-rule').nth(1)).toHaveClass(/is-over/);
  await page.keyboard.press('Escape');
  await expect(draft(page)).toHaveText(before!);
  await page.locator('.drag-handle').last().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(draft(page)).toHaveText(before!);
  await expect(page.locator('.behavior-rule').last().locator('.drag-handle')).toHaveCount(0);
});
test('inline multi-condition and action edits serialize and round trip', async ({ page }) => {
  const rule = page.locator('.behavior-rule').nth(1);
  await rule.getByLabel('Join conditions').selectOption('or');
  await rule.getByLabel('Threshold', { exact: true }).fill('40');
  await rule.getByLabel('Item', { exact: true }).selectOption('water');
  await rule.getByLabel('Item to use').selectOption('water');
  await expect(draft(page)).toContainText('WHEN health < 40 OR hasItem water\n    USE water');
  const before = await draft(page).textContent();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await expect(page.locator('#main-script')).toHaveValue(before!);
  await page
    .locator('#main-script')
    .fill('WHEN stamina < 20 AND hasItem food\n EAT food\nOTHERWISE\n WAIT');
  await page.getByRole('button', { name: 'Behavior', exact: true }).click();
  await expect(page.locator('.behavior-rule')).toHaveCount(2);
  await expect(
    page.locator('.behavior-rule').first().getByLabel('Condition', { exact: true }).first(),
  ).toHaveValue('stamina');
});
test('all preset notes populate the checklist and add focuses an inline control', async ({
  page,
}) => {
  for (const name of ['Coward', 'Scavenger', 'Fighter', 'Explorer']) {
    await page
      .getByRole('group', { name: 'Behavior presets' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await expect(page.locator('.behavior-rule').last()).toHaveAttribute('aria-label', 'Otherwise');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  const count = await page.locator('.behavior-rule').count();
  await page.getByRole('button', { name: '+ Add rule', exact: true }).click();
  await expect(page.locator('.behavior-rule')).toHaveCount(count + 1);
  await expect(
    page
      .locator('.behavior-rule')
      .nth(count - 1)
      .getByLabel('Target selection')
      .first(),
  ).toBeFocused();
});
test('unsupported advanced script stays intact when Behavior is requested', async ({ page }) => {
  const advanced =
    '# Keep this annotation\nWHEN health < 30 OR stamina < 20 AND hasItem food\n WAIT';
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.locator('#main-script').fill(advanced);
  await page.getByRole('button', { name: 'Behavior', exact: true }).click();
  await expect(page.locator('#main-script')).toHaveValue(advanced);
  await expect(draft(page)).toHaveText(advanced);
  await expect(page.getByRole('alert')).toContainText('advanced SurvivorScript');
  await expect(page.locator('.behavior-rule')).toHaveCount(0);
});
test('mobile wrapping keeps controls usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('.behavior-rule').nth(1).getByLabel('Threshold', { exact: true }).fill('41');
  await expect(draft(page)).toContainText('health < 41');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.locator('.behavior-rule').nth(1).getByLabel('Options for rule 2').click();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(draft(page)).toHaveText(/^WHEN health < 41/);
});
test('common desktop rules use two sentence lines', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const row of await page.locator('.behavior-rule').all()) {
    expect((await row.locator('.behavior-conditions').boundingBox())!.height).toBeLessThanOrEqual(
      34,
    );
    expect((await row.locator('.behavior-action').boundingBox())!.height).toBeLessThanOrEqual(34);
  }
});
