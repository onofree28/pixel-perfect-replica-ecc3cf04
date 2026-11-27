const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const GITHUB_CLIENT_ID = 'Ov23liFoS2c1TYWqEGv9';
const GITHUB_API = 'https://api.github.com';
const MAX_FILES = 3000;
const MAX_REPO_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
let window;
let previewWindow;
let projectProcess;
let selectedRepo;
let loginAbort;
let localUrl = '';
let clonePath = '';
let ghToken = '';
let previewRunId = 0;

function send(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1120, height: 800, minWidth: 840, minHeight: 640,
    backgroundColor: '#0b0d10', title: 'Lovable Chat Assistant Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('closed', () => { window = null; stopProject(); });
}

async function readStoredToken() {
  const tokenPath = path.join(app.getPath('userData'), 'github-token.enc');
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(await fs.readFile(tokenPath));
  } catch { return ''; }
}

async function storeToken(token) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não disponibilizou armazenamento criptografado para credenciais.');
  const tokenPath = path.join(app.getPath('userData'), 'github-token.enc');
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, safeStorage.encryptString(token), { mode: 0o600 });
  ghToken = token;
}

async function githubRequest(endpoint, options = {}) {
  if (!ghToken) throw new Error('Conecte sua conta GitHub primeiro.');
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json', Authorization: `Bearer ${ghToken}`,
      'X-GitHub-Api-Version': '2022-11-28', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const friendly = response.status === 401 ? 'A autorização do GitHub expirou. Conecte a conta novamente.'
      : response.status === 403 ? 'O GitHub recusou a operação. Verifique as permissões da conta e tente novamente.'
      : response.status === 404 ? 'O repositório ou arquivo não foi encontrado.'
      : `GitHub respondeu com erro ${response.status}.`;
    throw new Error(`${friendly} ${data.message || ''}`.trim());
  }
  return data;
}

async function getCurrentUser() {
  if (!ghToken) return null;
  try { const user = await githubRequest('/user'); return { login: user.login, name: user.name || user.login, avatar: user.avatar_url }; }
  catch { ghToken = ''; return null; }
}

ipcMain.handle('github:status', async () => getCurrentUser());
ipcMain.handle('github:login', async () => {
  loginAbort?.abort(); loginAbort = new AbortController();
  const signal = loginAbort.signal;
  const deviceResponse = await fetch('https://github.com/login/device/code', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }), signal
  });
  const device = await deviceResponse.json();
  if (!device.device_code) throw new Error(device.error_description || 'Não foi possível iniciar o login GitHub.');
  send('github:device', { code: device.user_code, url: device.verification_uri });
  await shell.openExternal(device.verification_uri);
  let delay = Number(device.interval || 5) * 1000;
  const expires = Date.now() + Number(device.expires_in || 900) * 1000;
  while (Date.now() < expires) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, delay);
      signal.addEventListener('abort', () => { clearTimeout(timeout); reject(new Error('Login cancelado.')); }, { once: true });
    });
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, device_code: device.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }), signal
    });
    const result = await response.json();
    if (result.access_token) {
      await storeToken(result.access_token);
      loginAbort = null;
      return await getCurrentUser();
    }
    if (result.error === 'slow_down') delay += 5000;
    else if (result.error !== 'authorization_pending') throw new Error(result.error_description || `Login GitHub: ${result.error}`);
  }
  throw new Error('O código de acesso expirou. Tente conectar novamente.');
});
ipcMain.handle('github:logout', async () => {
  loginAbort?.abort(); loginAbort = null; ghToken = ''; selectedRepo = null;
  await fs.rm(path.join(app.getPath('userData'), 'github-token.enc'), { force: true });
  return true;
});
ipcMain.handle('github:repos', async () => {
  const repos = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await githubRequest(`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.map(repo => ({ full_name: repo.full_name, name: repo.name, private: repo.private, default_branch: repo.default_branch, description: repo.description || '', updated_at: repo.updated_at }));
});
ipcMain.handle('github:create-repo', async (_event, input) => {
  const name = String(input?.name || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name)) throw new Error('Use um nome de repositório com letras, números, ponto, hífen ou sublinhado.');
  const created = await githubRequest('/user/repos', { method: 'POST', body: JSON.stringify({ name, description: String(input.description || '').slice(0, 350), private: input.private !== false, auto_init: true }) });
  const repo = { full_name: created.full_name, name: created.name, private: created.private, default_branch: created.default_branch || 'main', description: created.description || '' };
  if (input.starter !== false) await addStarterWebsite(repo);
  return repo;
});

async function addStarterWebsite(repo) {
  const base = `/repos/${repo.full_name}`;
  const branchPath = `/git/ref/heads/${encodeURIComponent(repo.default_branch)}`;
  const baseSha = (await githubRequest(`${base}${branchPath}`)).object.sha;
  const previous = await githubRequest(`${base}/git/commits/${baseSha}`);
  const files = {
    'package.json': JSON.stringify({ name: repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'new-project', private: true, version: '0.1.0', scripts: { dev: 'node server.cjs' } }, null, 2) + '\n',
    'server.cjs': "const http = require('node:http');\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst root = process.cwd();\nconst types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };\nhttp.createServer((req, res) => {\n  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }\n  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\\/+/, '');\n  const target = path.resolve(root, relative);\n  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }\n  fs.readFile(target, (error, data) => { if (error) { res.writeHead(404).end('Not found'); return; } res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });\n}).listen(0, '127.0.0.1', function () { console.log('Local: http://127.0.0.1:' + this.address().port); });\n",
    'index.html': '<!doctype html>\n<html lang="pt-BR">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#101710"><title>' + repo.name + '</title><link rel="stylesheet" href="/src/style.css"></head>\n<body><main><div class="badge"><span></span> SEU NOVO PROJETO</div><h1>Uma ideia nova<br><em>começa aqui.</em></h1><p>Seu projeto já está conectado ao GitHub e pronto para ganhar forma. Abra o Lovable Chat Assistant e peça a primeira alteração.</p><a href="https://github.com/' + repo.full_name + '" target="_blank" rel="noreferrer">Ver repositório <b>↗</b></a><footer>Feito para construir, testar e evoluir.</footer></main><div class="orb orb-one"></div><div class="orb orb-two"></div></body>\n</html>\n',
    'src/style.css': ':root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#edf4ed;background:#0c100d;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;overflow:hidden;background:radial-gradient(ellipse at 75% 35%,#19291d 0,transparent 38%),#0c100d}main{position:relative;z-index:1;width:min(740px,90vw);padding:64px 0}.badge{display:inline-flex;align-items:center;gap:9px;border:1px solid #35473a;border-radius:30px;padding:8px 13px;color:#a5b9a8;font-size:11px;letter-spacing:1.4px}.badge span{width:7px;height:7px;border-radius:50%;background:#5add79;box-shadow:0 0 14px #5add79}h1{font-size:clamp(48px,8vw,82px);line-height:.98;letter-spacing:-5px;margin:32px 0 20px;font-weight:720}h1 em{font-style:normal;color:#62d981}p{max-width:510px;color:#a8b4aa;line-height:1.8;font-size:17px;margin-bottom:31px}a{display:inline-flex;align-items:center;gap:24px;padding:13px 18px;border-radius:9px;background:#5bd67b;color:#0b140d;text-decoration:none;font-weight:700}a b{font-size:18px}footer{margin-top:72px;color:#68766a;font-size:12px}.orb{position:fixed;border:1px solid #334a37;border-radius:50%;opacity:.23}.orb-one{width:450px;height:450px;right:-145px;top:-110px}.orb-two{width:590px;height:590px;right:-210px;top:-180px}@media(max-width:600px){h1{letter-spacing:-3px}p{font-size:15px}main{padding:40px 0}}\n',
    '.gitignore': 'node_modules/\n.DS_Store\n'
  };
  const tree = [];
  for (const [filePath, content] of Object.entries(files)) {
    const blob = await githubRequest(`${base}/git/blobs`, { method: 'POST', body: JSON.stringify({ content, encoding: 'utf-8' }) });
    tree.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const nextTree = await githubRequest(`${base}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: previous.tree.sha, tree }) });
  const commit = await githubRequest(`${base}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'chore: add starter website', tree: nextTree.sha, parents: [baseSha] }) });
  const currentSha = (await githubRequest(`${base}${branchPath}`)).object.sha;
  if (currentSha !== baseSha) throw new Error('O repositório mudou durante a criação do projeto. As alterações não foram aplicadas.');
  await githubRequest(`${base}${branchPath}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
}
ipcMain.handle('github:select-repo', (_event, input) => {
  const fullName = String(input?.full_name || '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw new Error('Selecione um repositório GitHub válido.');
  selectedRepo = { full_name: fullName, default_branch: String(input.default_branch || 'main') };
  return selectedRepo;
});

async function downloadRepoToTemp(runId) {
  if (!selectedRepo) throw new Error('Selecione um repositório primeiro.');
  send('preview:status', { state: 'downloading', message: `Baixando ${selectedRepo.full_name} para uma pasta temporária…` });
  const tree = await githubRequest(`/repos/${selectedRepo.full_name}/git/trees/${encodeURIComponent(selectedRepo.default_branch)}?recursive=1`);
  if (tree.truncated) throw new Error('O repositório é grande demais para baixar em uma única etapa.');
  const files = tree.tree.filter(item => item.type === 'blob' && item.path && !item.path.split('/').some(part => part === '.git'));
  if (files.length > MAX_FILES) throw new Error(`O projeto contém mais de ${MAX_FILES} arquivos. Reduza o tamanho antes de visualizar.`);
  const size = files.reduce((total, file) => total + (file.size || 0), 0);
  if (size > MAX_REPO_BYTES) throw new Error('O projeto excede o limite de 200 MB para prévia local.');
  if (!files.length) throw new Error('Este repositório ainda não tem arquivos. Crie o projeto ou adicione um arquivo antes de visualizar.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lovable-chat-preview-'));
  try {
    let completed = 0;
    for (let i = 0; i < files.length; i += 8) {
      if (runId !== previewRunId) throw new Error('Prévia cancelada.');
      const batch = files.slice(i, i + 8);
      await Promise.all(batch.map(async file => {
        if ((file.size || 0) > MAX_FILE_BYTES) return;
        const relative = path.normalize(file.path);
        if (path.isAbsolute(relative) || relative.split(path.sep).some(part => part === '..')) return;
        const destination = path.resolve(root, relative);
        if (!destination.startsWith(root + path.sep)) return;
        const blob = await githubRequest(`/repos/${selectedRepo.full_name}/git/blobs/${file.sha}`);
        if (blob.encoding !== 'base64') return;
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, Buffer.from(blob.content.replace(/\s/g, ''), 'base64'));
        completed += 1;
        if (completed % 25 === 0 || completed === files.length) send('preview:status', { state: 'downloading', message: `Baixando arquivos… ${completed}/${files.length}` });
      }));
    }
    const manifestPath = path.join(root, 'package.json');
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); }
    catch { throw new Error('O repositório foi baixado, mas não contém um package.json válido para iniciar uma prévia web.'); }
    if (!manifest.scripts?.dev) throw new Error('O repositório precisa ter um script "dev" em package.json para abrir a prévia.');
    if (runId !== previewRunId) throw new Error('Prévia cancelada.');
    return { root, manifest };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function startLocalServer(root) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  send('preview:status', { state: 'installing', message: 'Instalando dependências do projeto…' });
  const install = spawn(command, ['install', '--no-audit', '--no-fund'], { cwd: root, windowsHide: true, shell: process.platform === 'win32', env: { ...process.env, BROWSER: 'none' } });
  const relay = child => {
    child.stdout.on('data', chunk => send('preview:output', chunk.toString()));
    child.stderr.on('data', chunk => send('preview:output', chunk.toString()));
  };
  relay(install);
  install.on('error', error => send('preview:status', { state: 'error', message: `Não foi possível instalar as dependências. Node.js/npm pode não estar instalado: ${error.message}` }));
  install.on('exit', code => {
    if (code !== 0) { send('preview:status', { state: 'error', message: `A instalação das dependências terminou com erro (${code}).` }); return; }
    send('preview:status', { state: 'starting', message: 'Iniciando o servidor de desenvolvimento…' });
    const server = spawn(command, ['run', 'dev', '--', '--host', '127.0.0.1'], { cwd: root, windowsHide: true, shell: process.platform === 'win32', env: { ...process.env, BROWSER: 'none' } });
    projectProcess = server;
    const collect = chunk => {
      const text = chunk.toString(); send('preview:output', text);
      const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i);
      if (match) {
        localUrl = match[0]; send('preview:url', localUrl);
        send('preview:status', { state: 'running', message: `Prévia local ativa em ${localUrl}` });
      }
    };
    server.stdout.on('data', collect); server.stderr.on('data', collect);
    server.on('error', error => { send('preview:status', { state: 'error', message: `Não foi possível iniciar o servidor: ${error.message}` }); projectProcess = null; });
    server.on('exit', code => { projectProcess = null; localUrl = ''; send('preview:status', { state: 'stopped', message: `Servidor encerrado (${code ?? 'sem código'}).` }); });
  });
  projectProcess = install;
}

ipcMain.handle('preview:start', async () => {
  if (!selectedRepo) throw new Error('Selecione um repositório GitHub antes de visualizar.');
  if (projectProcess) throw new Error('A prévia já está em execução.');
  const runId = ++previewRunId;
  const downloaded = await downloadRepoToTemp(runId);
  if (runId !== previewRunId) { await fs.rm(downloaded.root, { recursive: true, force: true }).catch(() => {}); throw new Error('Prévia cancelada.'); }
  clonePath = downloaded.root;
  startLocalServer(clonePath);
  return { message: 'Projeto baixado. Preparando a prévia local…' };
});
ipcMain.handle('preview:stop', async () => { await stopProject(); return true; });
ipcMain.handle('preview:open', async () => {
  if (!localUrl || !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+/.test(localUrl)) throw new Error('A prévia local ainda não está pronta.');
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close();
  previewWindow = new BrowserWindow({ width: 1360, height: 920, title: `Prévia · ${selectedRepo?.full_name || 'projeto'}`, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  previewWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await previewWindow.loadURL(localUrl);
  previewWindow.on('closed', () => { previewWindow = null; });
  return true;
});

async function stopProject() {
  if (projectProcess) {
    const child = projectProcess; projectProcess = null;
    if (process.platform === 'win32' && child.pid) await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      const timeout = setTimeout(resolve, 4000);
      killer.once('close', () => { clearTimeout(timeout); resolve(); });
      killer.once('error', () => { clearTimeout(timeout); resolve(); });
    });
    else await new Promise(resolve => {
      const timeout = setTimeout(resolve, 3000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      child.kill('SIGTERM');
    });
  }
  previewRunId += 1;
  localUrl = '';
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close();
  previewWindow = null;
  if (clonePath) { const oldPath = clonePath; clonePath = ''; await fs.rm(oldPath, { recursive: true, force: true }).catch(() => {}); }
  send('preview:status', { state: 'stopped', message: 'Prévia encerrada e arquivos temporários removidos.' });
}

app.whenReady().then(async () => { ghToken = await readStoredToken(); createWindow(); });
app.on('window-all-closed', () => { void stopProject(); if (process.platform !== 'darwin') app.quit(); });
