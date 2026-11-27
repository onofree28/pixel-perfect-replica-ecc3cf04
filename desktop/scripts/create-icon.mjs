import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(desktopDir, '..');
const png = await readFile(path.join(repoDir, 'extension', 'icon128.png'));
const ico = await pngToIco(png);
await mkdir(path.join(desktopDir, 'build'), { recursive: true });
await writeFile(path.join(desktopDir, 'build', 'app.ico'), ico);
