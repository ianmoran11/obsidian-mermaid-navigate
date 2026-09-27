// Runs only against the isolated desktop Obsidian profile, never a personal vault.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
const page = browser.contexts()[0].pages().find(page => page.url().includes('index.html'));
const results = [];
const fixture = '# Code editing test\n\nBefore text\n\n```mermaid\nflowchart LR\n A[First] --> B[Kept]\n```\n\nBetween text\n\n```mermaid\nflowchart LR\n A[First] --> B[Kept]\n```\n\nAfter text\n';
const file = 'Code editing test.md';
const input = page.locator('.mn-fullscreen .mn-code-input');
const close = () => page.locator('.mn-fullscreen button[aria-label="Close fullscreen"]').click();
const cancel = () => page.getByRole('button', { name: 'Cancel code edits', exact: true }).click();
const read = () => page.evaluate(file => app.vault.read(app.vault.getAbstractFileByPath(file)), file);
try {
  assert.equal(await page.evaluate(() => app.vault.getName()), 'edit-test-vault');
  page.setDefaultTimeout(10000);
  await page.evaluate(async () => {
    app.setting.close();
    await app.plugins.disablePlugin('mermaid-navigate');
    await app.plugins.enablePlugin('mermaid-navigate');
  });
  await page.evaluate(async ({ file, fixture }) => {
    const existing = app.vault.getAbstractFileByPath(file);
    if (existing) await app.vault.modify(existing, fixture);
    else await app.vault.create(file, fixture);
    await app.workspace.openLinkText(file, '', false);
    await app.workspace.activeLeaf.setViewState({ type: 'markdown', state: { file, mode: 'preview' } });
  }, { file, fixture });
  const controls = page.locator('.markdown-reading-view .mn-controls');
  await expect(controls).toHaveCount(2);
  await controls.nth(1).getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('flowchart LR\n A[First] --> B[Kept]\n');
  results.push({ test: 'Reading view loads exact code from second identical diagram', pass: true });
  await input.fill('flowchart LR\n A[Changed] --> B[Kept]');
  await page.getByRole('button', { name: 'Show diagram', exact: true }).click();
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(input).toHaveValue('flowchart LR\n A[Changed] --> B[Kept]');
  await close();
  await expect(page.locator('.mn-fullscreen')).toBeVisible();
  await expect(page.locator('.mn-code-status')).toContainText('Unsaved changes');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mn-fullscreen')).toBeVisible();
  assert.equal(await read(), fixture);
  results.push({ test: 'Toggle preserves draft; Close/Escape guard unsaved changes', pass: true });
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.locator('.mn-fullscreen .mn-code-editor')).toBeHidden();
  await expect(page.locator('.mn-fullscreen .mn-layer')).toContainText('Changed');
  const updated = fixture.slice(0, fixture.lastIndexOf('A[First]')) + fixture.slice(fixture.lastIndexOf('A[First]')).replace('A[First]', 'A[Changed]');
  await expect.poll(read).toBe(updated);
  results.push({ test: 'Save changes only selected block and refreshes fullscreen SVG', pass: true });
  await page.locator('.mn-fullscreen').getByRole('button', { name: 'Show code', exact: true }).click();
  await input.fill('definitely not valid mermaid');
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('Nothing was saved');
  assert.equal(await read(), updated);
  results.push({ test: 'Invalid Mermaid is rejected without modifying note', pass: true });
  await cancel();
  await close();
  await controls.nth(1).getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(input).toBeEnabled();
  await input.fill('flowchart LR\n A[Draft] --> B[Keep this draft]');
  await page.evaluate(async file => {
    const note = app.vault.getAbstractFileByPath(file);
    await app.vault.process(note, text => '# Concurrent edit\n' + text);
  }, file);
  await page.getByRole('button', { name: 'Save diagram code', exact: true }).click();
  await expect(page.locator('.mn-code-status')).toContainText('note changed');
  assert.equal(await read(), '# Concurrent edit\n' + updated);
  await expect(input).toHaveValue('flowchart LR\n A[Draft] --> B[Keep this draft]');
  results.push({ test: 'Concurrent edit is not overwritten and draft remains available', pass: true });
  await cancel();
  await close();
  await page.evaluate(async ({file, fixture}) => {
    await app.vault.modify(app.vault.getAbstractFileByPath(file), fixture);
    await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file,mode:'source',source:false}});
    const editor=app.workspace.activeLeaf.view.editor;
    editor.setCursor({line:16,ch:0});
    editor.scrollIntoView({from:{line:0,ch:0},to:{line:16,ch:0}},true);
  }, {file,fixture});
  const liveControls = page.locator('.cm-preview-code-block .mn-controls');
  await expect(liveControls).toHaveCount(2);
  await liveControls.nth(1).getByRole('button', {name:'Show code',exact:true}).click();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('flowchart LR\n A[First] --> B[Kept]\n');
  await input.fill('flowchart LR\n A[Live Preview edit] --> B[Kept]');
  await page.getByRole('button',{name:'Save diagram code',exact:true}).click();
  await expect(page.locator('.mn-fullscreen .mn-code-editor')).toBeHidden();
  await expect(page.locator('.mn-fullscreen .mn-layer')).toContainText('Live Preview edit');
  const liveExpected = fixture.slice(0, fixture.lastIndexOf('A[First]')) + fixture.slice(fixture.lastIndexOf('A[First]')).replace('A[First]','A[Live Preview edit]');
  await expect.poll(() => page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue())).toBe(liveExpected);
  await expect.poll(read).toBe(liveExpected);
  results.push({ test: 'Live Preview locates second block and uses native editor save', pass: true });
  await page.locator('.mn-fullscreen').getByRole('button',{name:'Show code',exact:true}).click();
  await input.fill('flowchart TD\n A[Another draft]');
  await page.screenshot({path:'artifacts/desktop-code-editor.png'});
  await cancel();
  await close();
  assert.equal(await read(),liveExpected);
  await page.evaluate(() => { const editor=app.workspace.activeLeaf.view.editor; editor.focus(); });
  await page.keyboard.press('Meta+z');
  await expect.poll(() => page.evaluate(() => app.workspace.activeLeaf.view.editor.getValue())).toBe(fixture);
  results.push({ test: 'Cancel discards draft; native Undo reverses the saved code edit', pass: true });
  const simple = '# Original\n\n```mermaid\nflowchart LR\n A[Original] --> B[Kept]\n```\nFooter\n';
  await page.evaluate(async simple => {
    for (const [path, text] of [['Embedded-source.md', simple], ['Embed-test.md', '# Embed\n![[Embedded-source]]\nParent note unchanged\n']]) {
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.modify(existing, text); else await app.vault.create(path, text);
    }
    await app.workspace.openLinkText('Embed-test.md','',false);
    await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Embed-test.md',mode:'preview'}});
  }, simple);
  await expect(controls).toHaveCount(1);
  await controls.getByRole('button',{name:'Show code',exact:true}).click();
  await expect(input).toBeEnabled();
  await expect(page.locator('.mn-code-source')).toContainText('Embedded-source.md');
  await input.fill('flowchart LR\n A[Embedded edit] --> B[Kept]');
  await page.getByRole('button',{name:'Save diagram code',exact:true}).click();
  await expect(page.locator('.mn-fullscreen .mn-code-editor')).toBeHidden();
  assert.equal(await page.evaluate(() => app.vault.read(app.vault.getAbstractFileByPath('Embed-test.md'))), '# Embed\n![[Embedded-source]]\nParent note unchanged\n');
  assert.equal(await page.evaluate(() => app.vault.read(app.vault.getAbstractFileByPath('Embedded-source.md'))), simple.replace('A[Original]','A[Embedded edit]'));
  await close();
  results.push({test:'Rendered note embed edits original source, not embedding note',pass:true});

  const yaml = '---\ndescription: |\n  ```mermaid\n---\n# Note\n```mermaid\nflowchart LR\n A[Original] --> B[Kept]\n```\n\nEnd\n';
  await page.evaluate(async yaml => {
    const path='Yaml-edit-test.md', existing=app.vault.getAbstractFileByPath(path);
    if(existing)await app.vault.modify(existing,yaml);else await app.vault.create(path,yaml);
    await app.workspace.openLinkText(path,'',false);
    await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:path,mode:'source',source:false}});
    const editor=app.workspace.activeLeaf.view.editor;
    editor.setCursor({line:10,ch:0});editor.scrollIntoView({from:{line:5,ch:0},to:{line:10,ch:0}},true);
  },yaml);
  await expect(liveControls).toHaveCount(1);
  await liveControls.getByRole('button',{name:'Show code',exact:true}).click();
  await expect(input).toHaveValue('flowchart LR\n A[Original] --> B[Kept]\n');
  await input.fill('flowchart LR\n A[YAML-safe edit] --> B[Kept]');
  await page.getByRole('button',{name:'Save diagram code',exact:true}).click();
  await expect(page.locator('.mn-fullscreen .mn-code-editor')).toBeHidden();
  assert.equal(await page.evaluate(() => app.vault.read(app.vault.getAbstractFileByPath('Yaml-edit-test.md'))),yaml.replace('A[Original]','A[YAML-safe edit]'));
  await close();
  results.push({test:'Live Preview edit preserves YAML containing a phantom Mermaid fence',pass:true});

  await page.evaluate(async simple => {
    const path='Identity-test.md', existing=app.vault.getAbstractFileByPath(path);
    if(existing)await app.vault.modify(existing,simple);else await app.vault.create(path,simple);
    await app.workspace.openLinkText(path,'',false);
    await app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:path,mode:'preview'}});
  },simple);
  await expect(controls).toHaveCount(1);
  await controls.getByRole('button',{name:'Open diagram fullscreen',exact:true}).click();
  const moved = 'Moved-identity-' + Date.now() + '.md';
  await page.evaluate(async ({moved,simple}) => {
    await app.vault.rename(app.vault.getAbstractFileByPath('Identity-test.md'), moved);
    await app.vault.create('Identity-test.md', simple);
  },{moved,simple});
  await page.locator('.mn-fullscreen').getByRole('button',{name:'Show code',exact:true}).click();
  await expect(input).toBeEnabled();
  await expect(page.locator('.mn-code-source')).toContainText(moved);
  await input.fill('flowchart LR\n A[Identity-safe edit] --> B[Kept]');
  await page.getByRole('button',{name:'Save diagram code',exact:true}).click();
  await expect(page.locator('.mn-fullscreen .mn-code-editor')).toBeHidden();
  assert.equal(await page.evaluate(() => app.vault.read(app.vault.getAbstractFileByPath('Identity-test.md'))),simple);
  assert.equal(await page.evaluate(moved => app.vault.read(app.vault.getAbstractFileByPath(moved)),moved),simple.replace('A[Original]','A[Identity-safe edit]'));
  await close();
  results.push({test:'Deferred Show code follows original file identity after rename and path reuse',pass:true});
} catch (error) {
  results.push({ test: 'Integration failure', pass: false, error:String(error), stack:error.stack });
  await page.screenshot({path:'artifacts/desktop-code-failure.png'}).catch(()=>{});
  process.exitCode=1;
} finally {
  await fs.writeFile('artifacts/desktop-editing-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
}
