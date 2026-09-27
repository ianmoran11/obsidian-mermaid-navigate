import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const folder = `dist/${manifest.id}`;
await mkdir(folder, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(file, `${folder}/${file}`);
// macOS/Linux release archive; the folder itself is also ready to install.
const archive = `${manifest.id}-${manifest.version}.zip`;
execFileSync('zip', ['-q', '-r', archive, manifest.id], { cwd: 'dist' });
console.log(`Install folder: ${folder}\nArchive: dist/${archive}`);
