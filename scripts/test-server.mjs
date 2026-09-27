import http from 'node:http';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['tests/browser/harness.ts'], bundle: true, write: false, format: 'iife', target: 'es2020' });
const css = await fs.readFile('styles.css', 'utf8');
http.createServer((req, res) => {
  if (req.url === '/harness.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); }
  else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{font-family:system-ui;margin:16px}#diagram{max-width:900px;margin:auto}svg{max-width:100%;height:auto}p{margin:24px 0}.modal{background:white}</style></head><body><h1>Mermaid Navigate test</h1><p>Scroll normally until you activate the viewer.</p><div class="mermaid" id="diagram"></div><p style="height:900px">Note content below the diagram.</p><script src="/harness.js"></script></body></html>`);
  }
}).listen(4173, '127.0.0.1');
