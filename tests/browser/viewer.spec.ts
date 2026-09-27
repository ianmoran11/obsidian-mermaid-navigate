import { expect, test, type Page } from '@playwright/test';

const matrix = (page: Page) => page.locator('.mn-layer').first().evaluate(el => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: m.e, y: m.f, scale: m.a };
});

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
});

test('opt-in controls preserve the native SVG and note scrolling', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Pan and zoom diagram', exact: true })).toHaveCount(1);
  await expect(page.locator('#diagram > svg')).toBeVisible();
  await expect(page.locator('.mn-viewport')).toHaveCount(0);
  const before = await page.locator('#diagram > svg').evaluate(el => el.outerHTML);
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await expect(page.locator('.mn-viewport')).toBeVisible();
  await expect(page.locator('#diagram > svg')).toBeHidden();
  await page.getByRole('button', { name: 'Stop interacting and restore note scrolling' }).click();
  await expect(page.locator('#diagram > svg')).toBeVisible();
  expect(await page.locator('#diagram > svg').evaluate(el => el.outerHTML.replace(' class=""', ''))).toBe(before);
});

test('zoom buttons, keyboard pan, wheel zoom, and fit reset work', async ({ page }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  const fitted = await matrix(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect((await matrix(page)).scale).toBeCloseTo(fitted.scale * 1.25, 4);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  expect((await matrix(page)).scale).toBeCloseTo(fitted.scale, 4);
  await page.locator('.mn-viewport').focus();
  await page.keyboard.press('ArrowRight');
  expect((await matrix(page)).x).toBeCloseTo(fitted.x - 40, 3);
  await page.locator('.mn-viewport').dispatchEvent('wheel', { deltaY: -100, clientX: 200, clientY: 200 });
  expect((await matrix(page)).scale).toBeGreaterThan(fitted.scale);
  await page.keyboard.press('0');
  expect((await matrix(page)).scale).toBeCloseTo(fitted.scale, 4);
  await page.keyboard.press('1');
  expect((await matrix(page)).scale).toBe(1);
});

test('mouse drag pans without resizing', async ({ page }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  const before = await matrix(page);
  const rect = (await page.locator('.mn-viewport').boundingBox())!;
  await page.mouse.move(rect.x + 100, rect.y + 100);
  await page.mouse.down();
  await page.mouse.move(rect.x + 170, rect.y + 140, { steps: 5 });
  await page.mouse.up();
  const after = await matrix(page);
  expect(after.x - before.x).toBeCloseTo(70, 3);
  expect(after.y - before.y).toBeCloseTo(40, 3);
  expect(after.scale).toBe(before.scale);
});

test('fullscreen fills the screen and closes without changing source', async ({ page }) => {
  const source = await page.locator('#diagram > svg').evaluate(el => el.outerHTML);
  await page.getByRole('button', { name: 'Open diagram fullscreen', exact: true }).click();
  const box = (await page.locator('.mn-fullscreen').boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.width).toBe(size.width);
  expect(box.height).toBe(size.height);
  const ids = await page.locator('[id]').evaluateAll(els => els.map(el => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByRole('button', { name: 'Close viewer', exact: true }).click();
  await expect(page.locator('.mn-fullscreen')).toHaveCount(0);
  expect(await page.locator('#diagram > svg').evaluate(el => el.outerHTML)).toBe(source);
});

test('late rendering, rerender, and plugin unload clean up', async ({ page }) => {
  await page.evaluate(() => (window as any).harness.delayed());
  await expect(page.locator('.mn-controls')).toHaveCount(2);
  await page.locator('#diagram').getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await page.evaluate(() => (window as any).harness.rerender());
  await expect(page.locator('#diagram .mn-controls')).toHaveCount(1);
  await expect(page.locator('.mn-viewer')).toHaveCount(0);
  await expect(page.locator('#diagram > svg')).toContainText('Updated diagram');
  await page.locator('#diagram').getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await page.evaluate(() => (window as any).harness.destroy());
  await expect(page.locator('.mn-controls, .mn-viewer, .mn-source-hidden')).toHaveCount(0);
  await expect(page.locator('#diagram > svg')).toBeVisible();
});

test('two-finger pinch zooms; lifting one finger continues panning', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  const session = await context.newCDPSession(page);
  const before = await matrix(page);
  const rect = (await page.locator('.mn-viewport').boundingBox())!;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const points = (distance: number) => [{ x: cx - distance, y: cy, id: 1 }, { x: cx + distance, y: cy, id: 2 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
  for (let distance = 35; distance <= 60; distance += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
  await expect.poll(async () => (await matrix(page)).scale).toBeCloseTo(before.scale * 2, 3);
  const pinched = await matrix(page);
  // CDP touchEnd lists the finger being lifted, not the remaining finger.
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx + 60, y: cy, id: 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 40, y: cy + 20, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await matrix(page)).x - pinched.x).toBeCloseTo(20, 3);
  const panned = await matrix(page);
  expect(panned.scale).toBe(pinched.scale);
  expect(panned.x - pinched.x).toBeCloseTo(20, 3);
  expect(panned.y - pinched.y).toBeCloseTo(20, 3);
  await session.detach();
});

test('links remain clickable but dragging a link does not navigate', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  const link = page.locator('.mn-layer a');
  if (testInfo.project.name === 'touch') await link.tap();
  else await link.click();
  await expect(page).toHaveURL(/#example-link$/);
  await page.evaluate(() => history.replaceState(null, '', '/'));
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/#example-link$/);
});

test('fullscreen retains common Mermaid theme selectors', async ({ page }) => {
  await page.addStyleTag({ content: '.mermaid .node { fill: rgb(200, 90, 50) !important; }' });
  await page.getByRole('button', { name: 'Open diagram fullscreen', exact: true }).click();
  await expect(page.locator('.mn-fullscreen .node').first()).toHaveCSS('fill', 'rgb(200, 90, 50)');
});

test('changes inside the native SVG discard stale interactive copies', async ({ page }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await page.locator('#diagram > svg > text').first().evaluate(el => { el.textContent = 'Changed in place'; });
  await expect(page.locator('.mn-viewer')).toHaveCount(0);
  await expect(page.locator('#diagram > svg')).toBeVisible();
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await expect(page.locator('.mn-layer svg')).toContainText('Changed in place');
});

test('resizing refits an untouched diagram', async ({ page }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  const initial = await matrix(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(async () => (await matrix(page)).scale).toBeLessThan(initial.scale);
  const box = (await page.locator('.mn-toolbar').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(320);
});
