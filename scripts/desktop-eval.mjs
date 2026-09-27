// Development helper. Only connects to the isolated Obsidian test profile on 9224.
import { chromium } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
try {
  const page = browser.contexts()[0].pages().find(page => page.url().includes('index.html'));
  if (!page) throw new Error('Obsidian test window not found');
  const value = await page.evaluate(async expression => await (0, eval)(expression), process.argv[2]);
  console.log(JSON.stringify(value, null, 2));
} finally { await browser.close(); }
