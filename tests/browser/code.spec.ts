import { expect, test } from '@playwright/test';

const original = 'flowchart LR\n A[Mermaid Navigate] --> B[Pinch, pan, and explore]\n';
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  await page.goto('/');
});

test('Show code opens an editable panel from a static diagram', async ({ page }) => {
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveValue(original);
  await expect(page.locator('.mn-fullscreen .mn-viewport')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show diagram', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Save diagram code', exact: true })).toBeEnabled();
});

test('Show code also opens from inline controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Pan and zoom diagram', exact: true }).click();
  await page.locator('#diagram .mn-toolbar').getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(page.locator('.mn-fullscreen .mn-code-input')).toHaveValue(original);
  await page.getByRole('button', { name: 'Cancel code edits', exact: true }).click();
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Close viewer', exact: true }).click();
  await expect(page.locator('#diagram .mn-viewport')).toBeVisible();
});

test('toggle retains unsaved code; saving updates diagram and only code body', async ({ page }) => {
  const before = await page.evaluate(() => (window as any).harness.source());
  await page.getByRole('button', { name: 'Open diagram fullscreen', exact: true }).click();
  const modal = page.locator('.mn-fullscreen');
  await modal.getByRole('button', { name: 'Show code', exact: true }).click();
  const input = modal.getByRole('textbox', { name: 'Mermaid source', exact: true });
  await input.fill('flowchart LR\n A[Edited label] --> B[Kept]');
  await modal.getByRole('button', { name: 'Show diagram', exact: true }).click();
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before);
  await modal.getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(input).toHaveValue('flowchart LR\n A[Edited label] --> B[Kept]');
  await modal.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(modal.locator('.mn-viewport')).toBeVisible();
  await expect(modal.locator('.mn-layer')).toContainText('Edited label');
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before.replace(original, 'flowchart LR\n A[Edited label] --> B[Kept]\n'));
  await modal.getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(input).toHaveValue('flowchart LR\n A[Edited label] --> B[Kept]\n');
});

test('Cancel discards edits without writing the note', async ({ page }) => {
  const before = await page.evaluate(() => (window as any).harness.source());
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Mermaid source', exact: true }).fill('flowchart TD\n X-->Y');
  await page.getByRole('button', { name: 'Cancel code edits', exact: true }).click();
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before);
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveValue(original);
});

test('Close and Escape preserve dirty drafts until Save or Cancel', async ({ page }) => {
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Mermaid source', exact: true }).fill('draft');
  await page.getByRole('button', { name: 'Show diagram', exact: true }).click();
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Close viewer', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('Unsaved changes');
  await expect(page.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveValue('draft');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mn-fullscreen')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel code edits', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mn-fullscreen')).toHaveCount(0);
});

test('invalid source and write conflicts preserve draft without overwriting', async ({ page }) => {
  const before = await page.evaluate(() => (window as any).harness.source());
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Mermaid source', exact: true });
  await input.fill('invalid');
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('Nothing was saved');
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before);
  await input.fill('flowchart TD\n A[Edited] --> B[Kept]');
  await page.evaluate(() => (window as any).harness.concurrentEdit());
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('note changed');
  await expect(input).toHaveValue('flowchart TD\n A[Edited] --> B[Kept]');
  expect(await page.evaluate(() => (window as any).harness.source())).toBe(before + 'External change\n');
});

test('uncertain source location fails safely with a usable Cancel', async ({ page }) => {
  await page.evaluate(() => (window as any).harness.failLoad());
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('Cannot safely');
  await expect(page.getByRole('button', { name: 'Save diagram code', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel code edits', exact: true }).click();
  await expect(page.locator('.mn-fullscreen .mn-viewport')).toBeVisible();
});

test('pending save blocks repeat Save, Cancel, and Close', async ({ page }) => {
  await page.evaluate(() => (window as any).harness.setDelay(700));
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Mermaid source', exact: true }).fill('flowchart LR\n A[Updated]-->B[Kept]');
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save diagram code', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel code edits', exact: true })).toBeDisabled();
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Close viewer', exact: true }).click();
  await expect(page.locator('.mn-fullscreen')).toBeVisible();
  await expect(page.locator('.mn-fullscreen .mn-viewport')).toBeVisible();
});

test('code editing controls fit a narrow short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.locator('.mn-controls').getByRole('button', { name: 'Show code', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Mermaid source', exact: true });
  await expect(input).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save diagram code', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Cancel code edits', exact: true })).toBeInViewport();
  const before = await page.locator('.mn-fullscreen .mn-layer').evaluate(el => (el as HTMLElement).style.transform);
  await input.press('End');
  await input.press('+');
  await input.press('ArrowLeft');
  expect(await page.locator('.mn-fullscreen .mn-layer').evaluate(el => (el as HTMLElement).style.transform)).toBe(before);
});
