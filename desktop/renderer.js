const api = window.desktopApp;
const $ = selector => document.querySelector(selector);
const welcome = $('#welcome');
const workspace = $('#workspace');
const repoSelect = $('#repo-select');
const projectCard = $('#selected-project');
const previewCard = $('#preview-card');
const connectButton = $('#connect');
const connectStatus = $('#device-code');
const output = $('#output');
let repositories = [];
let selected = null;
let connected = false;
let isRunning = false;

function setStatus(title, message, state = 'ready') {
  previewCard.hidden = false;
  $('#status-title').textContent = title;
  $('#status-message').textContent = message;
  $('#progress').className = `progress-bar ${state}`;
}

function setConnected(user) {
  connected = Boolean(user);
  welcome.hidden = connected;
  workspace.hidden = !connected;
  $('#logout').hidden = !connected;
  $('#account-name').textContent = user?.name || 'Não conectado';
  $('#account-subtitle').textContent = user ? `@${user.login}` : 'Conecte seu GitHub';
  $('#avatar').textContent = user?.login?.slice(0, 2).toUpperCase() || 'GH';
}

async function loadRepositories() {
  $('#refresh').disabled = true;
  $('#refresh').textContent = 'Carregando…';
  try {
    repositories = await api.listRepositories();
    const current = selected?.full_name || repoSelect.value;
    repoSelect.replaceChildren(new Option('Selecione um repositório…', ''));
    for (const repo of repositories) {
      const option = new Option(`${repo.full_name}${repo.private ? ' · privado' : ''}`, repo.full_name);
      option.dataset.branch = repo.default_branch || 'main';
      repoSelect.add(option);
    }
    if (current && repositories.some(repo => repo.full_name === current)) repoSelect.value = current;
    if (repoSelect.value) await chooseRepository(repoSelect.value);
    if (!repositories.length) setStatus('Nenhum repositório ainda', 'Crie um repositório acima para começar.');
  } catch (error) { setStatus('Não foi possível carregar os repositórios', error.message, 'error'); }
  finally { $('#refresh').disabled = false; $('#refresh').textContent = '↻ Atualizar'; }
}

async function chooseRepository(fullName) {
  selected = repositories.find(repo => repo.full_name === fullName) || null;
  if (!selected) { projectCard.hidden = true; $('#selected-chip').hidden = true; return; }
  selected = await api.selectRepository(selected);
  const repo = repositories.find(item => item.full_name === fullName);
  selected = { ...repo, ...selected };
  $('#selected-chip').hidden = false;
  $('#selected-name').textContent = fullName;
  $('#repo-title').textContent = fullName;
  $('#repo-description').textContent = repo.description || 'Repositório GitHub';
  $('#repo-branch').textContent = `⎇ ${selected.default_branch || 'main'}`;
  projectCard.hidden = false;
  previewCard.hidden = true;
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true;
  connectButton.textContent = 'Aguardando autorização…';
  connectStatus.hidden = false;
  try {
    const user = await api.connectGitHub();
    setConnected(user);
    await loadRepositories();
  } catch (error) { setStatus('Falha ao conectar GitHub', error.message, 'error'); }
  finally { connectButton.disabled = false; connectButton.innerHTML = '<span class="github-glyph">●</span> Conectar com GitHub'; connectStatus.hidden = true; }
});

api.onDeviceCode(({ code }) => { $('#code-value').textContent = code; });
$('#refresh').addEventListener('click', () => void loadRepositories());
$('#nav-repos').addEventListener('click', () => { if (connected) workspace.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
repoSelect.addEventListener('change', () => void chooseRepository(repoSelect.value));
$('#create-repo').addEventListener('click', async () => {
  const name = $('#new-name').value.trim();
  if (!name) { setStatus('Dê um nome ao repositório', 'O nome será usado para criar seu repositório no GitHub.', 'error'); return; }
  const button = $('#create-repo'); button.disabled = true; button.textContent = 'Criando…';
  try {
    const starter = $('#new-starter').checked;
    const repo = await api.createRepository({ name, description: $('#new-description').value.trim(), private: $('#new-private').checked, starter });
    repositories.unshift(repo);
    await loadRepositories();
    repoSelect.value = repo.full_name;
    await chooseRepository(repo.full_name);
    $('#new-name').value = ''; $('#new-description').value = '';
    $('details.create-details').open = false;
    setStatus('Repositório criado', starter ? `${repo.full_name} já tem um site inicial pronto para prévia.` : `${repo.full_name} está pronto. Adicione um app web com script dev para visualizar.`);
  } catch (error) { setStatus('Não foi possível criar o repositório', error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Criar no GitHub'; }
});

$('#preview').addEventListener('click', async () => {
  if (!selected) return;
  $('#preview').disabled = true;
  $('#stop').hidden = false;
  output.textContent = '';
  try {
    const result = await api.startPreview();
    setStatus('Preparando prévia local', result.message, 'active');
    isRunning = true;
  } catch (error) {
    setStatus('Prévia não iniciada', error.message, 'error');
    $('#preview').disabled = false; $('#stop').hidden = true;
  }
});

$('#stop').addEventListener('click', async () => {
  $('#stop').disabled = true;
  try { await api.stopPreview(); } finally { $('#stop').disabled = false; $('#preview').disabled = false; $('#stop').hidden = true; isRunning = false; }
});
$('#open-preview').addEventListener('click', () => api.openPreview().catch(error => setStatus('Prévia indisponível', error.message, 'error')));
api.onPreviewStatus(value => {
  const titles = { downloading: 'Baixando arquivos do GitHub', installing: 'Preparando dependências', starting: 'Iniciando o app', running: 'Seu app está rodando', stopped: 'Prévia encerrada', error: 'Não foi possível abrir a prévia' };
  setStatus(titles[value.state] || 'Prévia local', value.message, value.state === 'error' ? 'error' : ['running', 'stopped'].includes(value.state) ? 'complete' : 'active');
  if (value.state === 'error' || value.state === 'stopped') { $('#preview').disabled = false; $('#stop').hidden = true; isRunning = false; }
  if (value.state === 'running') $('#open-preview').hidden = false;
  if (value.state === 'stopped') $('#open-preview').hidden = true;
});
api.onPreviewOutput(text => { output.textContent = (output.textContent + text).slice(-18000); output.scrollTop = output.scrollHeight; });
api.onPreviewUrl(() => { $('#open-preview').hidden = false; void api.openPreview().catch(error => setStatus('Prévia indisponível', error.message, 'error')); });
$('#logout').addEventListener('click', async () => {
  await api.stopPreview(); await api.disconnectGitHub();
  selected = null; repositories = []; repoSelect.replaceChildren(new Option('Selecione um repositório…', ''));
  projectCard.hidden = true; $('#selected-chip').hidden = true; previewCard.hidden = true;
  setConnected(null);
});

api.githubStatus().then(async user => { if (user) { setConnected(user); await loadRepositories(); } }).catch(error => setStatus('GitHub indisponível', error.message, 'error'));
