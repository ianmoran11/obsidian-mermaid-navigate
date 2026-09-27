// Explicit opt-in integration test for the connected Android Obsidian WebView.
// Assumes scripts/phone-cdp.mjs port forwarding and the disposable test note.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { connect } from './phone-cdp.mjs';
const expectedVault = process.env.TEST_VAULT;
assert.ok(expectedVault, 'Set TEST_VAULT to the exact authorized test vault name before running this script.');
await fs.mkdir('artifacts', { recursive: true });
const client = await connect();
const results = [];
const { evaluate, send } = client;
try {
  assert.equal(await evaluate('app.vault.getName()'), expectedVault, 'Refusing an unexpected vault');
} catch (error) {
  client.close();
  throw error;
}
const settle = () => evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Timed out: ' + expression);
}
async function tap(selector) {
  await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getBoundingClientRect().width>0);if(!el)throw new Error('Missing visible control');el.scrollIntoView({block:'center',behavior:'instant'})})()`);
  // Obsidian virtualizes Reading view during scroll; re-resolve after layout settles.
  await new Promise(r => setTimeout(r, 350));
  const p = await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getBoundingClientRect().width>0);const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
}
const transform = () => evaluate(`(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.mn-layer')).transform);return {x:m.e,y:m.f,scale:m.a}})()`);
async function screenshot(name) {
  const display = process.env.ANDROID_DISPLAY_ID;
  const data = execFileSync('adb', ['exec-out', 'screencap', '-p', ...(display ? ['-d', display] : [])], { timeout: 10000 });
  const start = data.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
  assert.ok(start >= 0, 'Screenshot contains a PNG');
  await fs.writeFile(`artifacts/phone-${name}.png`, data.subarray(start));
}
try {
  await evaluate(`(async()=>{await app.plugins.disablePlugin('mermaid-navigate');await app.plugins.enablePlugin('mermaid-navigate')})()`);
  const noteBefore = await evaluate(`app.vault.adapter.read('Mermaid Navigate - Test.md')`);
  await evaluate(`app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Mermaid Navigate - Test.md',mode:'preview'}})`);
  await until(`document.querySelectorAll('.mn-controls').length>=1`);
  results.push({ test: 'Reading view: native diagrams receive controls', pass: true });
  await tap('.mn-controls button[aria-label="Pan and zoom diagram"]');
  await until(`!!document.querySelector('.mn-layer svg')`);
  const before = await transform();
  assert.ok(before.scale > 0 && before.scale < 1);
  await tap('.mn-toolbar button[aria-label="Zoom in"]');
  const zoomed = await transform();
  assert.ok(zoomed.scale > before.scale);
  await tap('.mn-toolbar button[aria-label="Zoom out"]');
  assert.ok(Math.abs((await transform()).scale - before.scale) < 0.001);
  results.push({ test: 'Inline zoom buttons', pass: true, before, zoomed });
  await screenshot('inline');
  await tap('.mn-toolbar button[aria-label="Open fullscreen"]');
  await until(`!!document.querySelector('.mn-fullscreen .mn-viewport')`);
  // Close inline viewer behind the modal only after modal tests, so select fullscreen explicitly below.
  const bounds = await evaluate(`(()=>{const r=document.querySelector('.mn-fullscreen').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,screenWidth:innerWidth,screenHeight:innerHeight}})()`);
  assert.ok(Math.abs(bounds.width - bounds.screenWidth) < 2);
  assert.ok(Math.abs(bounds.height - bounds.screenHeight) < 2);
  results.push({ test: 'Fullscreen fills actual phone WebView', pass: true, bounds });
  const fullTransform = () => evaluate(`(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.mn-fullscreen .mn-layer')).transform);return {x:m.e,y:m.f,scale:m.a}})()`);
  const r = await evaluate(`(()=>{const r=document.querySelector('.mn-fullscreen .mn-viewport').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const start = await fullTransform();
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let step = 1; step <= 5; step++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + step * 10, y: cy + step * 8, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const panned = await fullTransform();
  assert.ok(Math.abs(panned.x - start.x - 50) < 2);
  assert.ok(Math.abs(panned.y - start.y - 40) < 2);
  results.push({ test: 'One-finger pan in actual WebView', pass: true, start, panned });
  const points = distance => [{ x: cx - distance, y: cy, id: 1 }, { x: cx + distance, y: cy, id: 2 }];
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(35) });
  for (let distance = 40; distance <= 70; distance += 5) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
  const pinched = await fullTransform();
  assert.ok(Math.abs(pinched.scale / panned.scale - 2) < 0.05);
  results.push({ test: 'Two-finger pinch zoom in actual WebView', pass: true, pinched });
  await screenshot('fullscreen-pinched');
  await tap('.mn-fullscreen button[aria-label="Fit diagram (0)"]');
  assert.ok(Math.abs((await fullTransform()).scale - start.scale) < 0.001);
  await tap('.mn-fullscreen button[aria-label="Actual size (1)"]');
  assert.equal((await fullTransform()).scale, 1);
  await screenshot('fullscreen-detail');
  await tap('.mn-fullscreen button[aria-label="Close fullscreen"]');
  await until(`!document.querySelector('.mn-fullscreen')`);
  results.push({ test: 'Fit, actual size, close fullscreen', pass: true });
  await tap('.mn-toolbar button[aria-label="Stop interacting and restore note scrolling"]');
  await until(`!document.querySelector('.mn-viewport')`);
  await tap('.mn-controls button[aria-label="Open diagram fullscreen"]');
  await until(`!!document.querySelector('.mn-fullscreen')`);
  execFileSync('adb', ['shell', 'input', 'keyevent', '4']);
  await until(`!document.querySelector('.mn-fullscreen')`);
  results.push({ test: 'Native Android Back dismisses fullscreen', pass: true });
  await evaluate(`app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Mermaid Navigate - Test.md',mode:'source',source:false}})`);
  await until(`!!document.querySelector('.cm-preview-code-block .mn-controls')`);
  await tap('.cm-preview-code-block .mn-controls button[aria-label="Open diagram fullscreen"]');
  await until(`!!document.querySelector('.mn-fullscreen .mn-layer svg')`);
  await screenshot('live-preview-fullscreen');
  await tap('.mn-fullscreen button[aria-label="Close fullscreen"]');
  results.push({ test: 'Live Preview native Mermaid fullscreen', pass: true });
  await evaluate(`app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Mermaid Navigate - Test.md',mode:'preview'}})`);
  await until(`!!document.querySelector('.markdown-reading-view .mermaid > svg')`);
  await evaluate(`app.plugins.disablePlugin('mermaid-navigate')`);
  await until(`document.querySelectorAll('.mn-controls,.mn-viewer,.mn-source-hidden').length===0`);
  assert.ok(await evaluate(`!!document.querySelector('.mermaid > svg')`));
  await evaluate(`app.plugins.enablePlugin('mermaid-navigate')`);
  await until(`!!document.querySelector('.mn-controls')`);
  results.push({ test: 'Disable restores native SVG; re-enable adds controls once', pass: true });
  assert.equal(await evaluate(`app.vault.adapter.read('Mermaid Navigate - Test.md')`), noteBefore);
  results.push({ test: 'Markdown source remains byte-for-byte unchanged', pass: true });
  await evaluate(`app.workspace.activeLeaf.setViewState({type:'markdown',state:{file:'Mermaid Navigate - Test.md',mode:'preview'}})`);
} catch (error) {
  results.push({ test: 'Integration failure', pass: false, error: String(error), stack: error.stack });
  await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await evaluate(`app.plugins.plugins['mermaid-navigate'] ? true : app.plugins.enablePlugin('mermaid-navigate')`).catch(() => {});
  await fs.writeFile('artifacts/phone-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  client.close();
}
