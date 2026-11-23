import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('extension');
await mkdir(output, { recursive: true });
const result = await Bun.build({ entrypoints: ['src/extension/entry.tsx'], outdir: output, naming: 'app.js', target: 'browser', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
if (!result.success) { for (const log of result.logs) console.error(log); process.exit(1); }
await cp('src/extension/assistant.css', 'extension/app.css');
await cp('node_modules/highlight.js/styles/github-dark.css', 'extension/code.css');
const { spawnSync } = await import('node:child_process');
const packed = spawnSync('python3', ['-c', `import zipfile, pathlib
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
await cp('/tmp/lovable-chat-assistant.zip', 'public/lovable-chat-assistant.zip');
await writeFile('public/extension-version.json', JSON.stringify({ version: '2.0.0', builtAt: new Date().toISOString() }));