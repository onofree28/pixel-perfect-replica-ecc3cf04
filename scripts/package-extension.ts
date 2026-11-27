import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('extension');
await mkdir(output, { recursive: true });
const result = await Bun.build({ entrypoints: ['src/extension/entry.tsx'], outdir: output, naming: 'app.js', target: 'browser', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1); }
const css = Bun.spawnSync(['node_modules/.bin/tailwindcss', '-i', 'src/styles.css', '-o', 'extension/app.css', '--minify']);
if (css.exitCode !== 0) throw new Error(css.stderr.toString());
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'extension/pdf.worker.min.mjs');
await cp('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs');
await cp('node_modules/highlight.js/styles/github-dark.css', 'public/code.css');
await cp('node_modules/highlight.js/styles/github-dark.css', 'extension/code.css');
const { spawnSync } = await import('node:child_process');
const packed = process.platform === 'win32'
  ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'
$destination = Join-Path (Get-Location) 'public/lovable-chat-assistant.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path (Get-Location) 'extension'), $destination, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [System.IO.Compression.ZipFile]::OpenRead($destination)
try { if ($archive.Entries.Count -eq 0) { throw 'O pacote da extensão está vazio.' } } finally { $archive.Dispose() }
Write-Output "Pacote criado: $destination"`], { encoding: 'utf8', cwd: process.cwd() })
  : spawnSync('python3', ['-c', `import zipfile, pathlib
root=pathlib.Path('extension')
with zipfile.ZipFile('/tmp/lovable-chat-assistant.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(root))
with zipfile.ZipFile('/tmp/lovable-chat-assistant.zip') as z:
 print('\\n'.join(z.namelist()))
 assert z.testzip() is None
`], { encoding: 'utf8' });
console.log(packed.stdout); if (packed.status !== 0) throw new Error(packed.stderr);
await mkdir('public', { recursive: true });
if (process.platform !== 'win32') await cp('/tmp/lovable-chat-assistant.zip', 'public/lovable-chat-assistant.zip');
await writeFile('public/extension-version.json', JSON.stringify({ version: '2.1.0', builtAt: new Date().toISOString() }));
