import { GITHUB_CLIENT_ID, selectableProviders, type Settings, type Provider } from './types';
import { useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { discoverModels, endpoint, providerNames } from './providers';
import { GitHub } from './github';
import { inExtension } from './storage';
import { redact } from './security';
import { githubLogin, openRouterLogin } from './oauth';
import { addOpenRouterAccount, selectOpenRouterAccount } from './openrouterAccounts';

type SettingsTab = Provider | 'github';
export function SettingsPanel({ settings, onSave, close }: { settings: Settings; onSave: (s: Settings) => Promise<void>; close: () => void }) {
  const initialProvider = selectableProviders.includes(settings.provider) ? settings.provider : 'openrouter';
  const [draft, setDraft] = useState(() => ({ ...structuredClone(settings), provider: initialProvider }));
  const [tab, setTab] = useState<SettingsTab>(initialProvider);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const enabled = inExtension();
  const config = tab !== 'github' ? draft.providers[tab] : null;

  function chooseTab(next: SettingsTab) { setTab(next); setStatus(''); setModels([]); }
  function updateProvider(provider: Provider, key: string, value: string | boolean) {
    setDraft(current => ({ ...current, providers: { ...current.providers, [provider]: { ...current.providers[provider], [key]: value } } }));
  }
  async function grant(provider: Provider) {
    if (!enabled) throw new Error('Instale a extensão para configurar conexões.');
    if (provider === 'chrome') return;
    const url = endpoint(draft.providers[provider]);
    if (!await chrome.permissions.request({ origins: [`${url.origin}/*`] })) throw new Error('Permissão de acesso ao provedor não autorizada.');
  }
  async function login() {
    setBusy(true); setStatus('');
    try {
      const account = await openRouterLogin();
      setDraft(current => { const added = addOpenRouterAccount(current, account.key, account.userId); return { ...added, provider: 'openrouter', providers: { ...added.providers, openrouter: { ...added.providers.openrouter, model: 'free:auto' } } }; });
      setStatus('Conta OpenRouter adicionada. Salve para usar os modelos gratuitos.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Falha no login.'); }
    finally { setBusy(false); }
  }
  async function ghLogin() {
    setBusy(true); setStatus('');
    try {
      const token = await githubLogin(draft.githubClientId || GITHUB_CLIENT_ID, code => setStatus(`Digite o código ${code} na página do GitHub que abriu e autorize.`), new AbortController().signal);
      setDraft(current => ({ ...current, githubToken: token }));
      setStatus('GitHub conectado por login. Salve as configurações.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Falha no login.'); }
    finally { setBusy(false); }
  }
  async function testGitHub() {
    setBusy(true); setStatus('');
    try {
      const user = await new GitHub(draft.githubToken).request<{ login: string }>('/user');
      setStatus(`GitHub conectado: ${user.login}`);
    } catch (error) { setStatus(redact(error instanceof Error ? error.message : 'Falha na conexão.', [draft.githubToken, ...Object.values(draft.providers).map(provider => provider.key), ...(draft.openRouterAccounts ?? []).map(account => account.key)])); }
    finally { setBusy(false); }
  }
  async function findModels(provider: Provider) {
    setBusy(true); setStatus('');
    try {
      await grant(provider);
      const found = await discoverModels(provider, draft.providers[provider], new AbortController().signal);
      setModels(found);
      if (!found.includes(draft.providers[provider].model)) updateProvider(provider, 'model', found[0]!);
      setStatus(`${found.length} modelo(s) encontrado(s).`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível encontrar modelos.'); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      if (tab !== 'github' && tab === draft.provider) await grant(tab);
      await onSave(draft);
      close();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop"><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Configurações">
    <header className="modal-title"><div><span className="eyebrow">CONEXÕES</span><h2>Configure seus serviços</h2></div><Button variant="ghost" size="icon" onClick={close} aria-label="Fechar configurações"><X /></Button></header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Serviços">
        <Button variant={tab === 'github' ? 'secondary' : 'ghost'} onClick={() => chooseTab('github')}><KeyRound /> GitHub</Button>
        <div className="settings-nav-label">INTELIGÊNCIA ARTIFICIAL</div>
        {selectableProviders.map(provider => <Button key={provider} variant={tab === provider ? 'secondary' : 'ghost'} onClick={() => chooseTab(provider)}>{providerNames[provider]}</Button>)}
      </nav>
      <div className="settings-content">
        {!enabled && <div className="notice">Instale a extensão para conectar contas e serviços locais. Esta prévia não armazena credenciais.</div>}
        {tab === 'github' ? <>
          <div><h3>Conecte seu GitHub</h3><p className="muted">O login autoriza a extensão a ler e propor alterações nos repositórios escolhidos.</p></div>
          <Button disabled={!enabled || busy} onClick={() => void ghLogin()}><KeyRound /> Entrar com GitHub</Button>
          {draft.githubToken && <div className="connection-status"><span className="status-dot connected" /> GitHub conectado</div>}
          <details className="advanced-settings"><summary>Usar token do GitHub</summary><label>Token de acesso<input disabled={!enabled} type="password" autoComplete="off" value={draft.githubToken} onChange={event => setDraft(current => ({ ...current, githubToken: event.target.value }))} placeholder="Cole o token" /></label><a className="external-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Criar token no GitHub <ExternalLink size={14} /></a></details>
        </> : config && <>
          <div><h3>{providerNames[tab]}</h3>
            {tab === 'openrouter' && <p className="muted">Entre com sua conta OpenRouter. Não é necessário copiar uma chave. O modo gratuito escolhe modelos disponíveis automaticamente.</p>}
            {tab === 'ollama' && <p className="muted">Use modelos instalados no seu computador. Abra o Ollama antes de conectar; não precisa de conta nem chave.</p>}
            {tab === 'lmstudio' && <p className="muted">Use modelos baixados no LM Studio. Inicie o servidor local na aba Developer; não precisa de conta nem chave.</p>}
            {tab === 'chrome' && <p className="muted">Usa a IA integrada ao Chrome quando disponível neste navegador e dispositivo. Não precisa de conta ou configuração.</p>}
          </div>
          {tab === 'openrouter' && <>
            {(draft.openRouterAccounts?.length ?? 0) > 0 && <label>Conta ativa<select value={draft.activeOpenRouterAccountId ?? ''} onChange={event => setDraft(current => selectOpenRouterAccount(current, event.target.value))}>{draft.openRouterAccounts?.map((account, index) => <option key={account.id} value={account.id}>{account.label || `Conta ${index + 1}`}</option>)}</select></label>}
            {config.key && <div className="connection-status"><span className="status-dot connected" /> Conta conectada</div>}
            <Button disabled={!enabled || busy} onClick={() => void login()}><KeyRound /> {config.key ? 'Adicionar outra conta' : 'Entrar com OpenRouter'}</Button>
            <div className="notice">Usar modelo gratuito automático · sem cobrança por modelo. A cota gratuita continua sujeita aos limites do OpenRouter.</div>
          </>}
          {(tab === 'ollama' || tab === 'lmstudio') && <>
            <label>Endereço do servidor<input disabled={!enabled} value={config.url} onChange={event => updateProvider(tab, 'url', event.target.value)} placeholder={tab === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1'} /></label>
            <Button variant="outline" disabled={!enabled || busy} onClick={() => void findModels(tab)}>{busy ? <Loader2 className="spin" /> : <RefreshCw />} Buscar modelos instalados</Button>
            {models.length > 0 && <label>Modelo<select value={config.model} onChange={event => updateProvider(tab, 'model', event.target.value)}>{models.map(model => <option key={model} value={model}>{model}</option>)}</select></label>}
            {models.length === 0 && config.model && <p className="muted">Modelo salvo: {config.model}. Busque os modelos para confirmar a conexão.</p>}
          </>}
          <label className="check-label"><input type="radio" checked={draft.provider === tab} onChange={() => setDraft(current => ({ ...current, provider: tab }))} /> Usar esta IA no chat</label>
        </>}
        {status && <div className="notice" role="status">{status}</div>}
        <div className="security-note"><ShieldCheck size={17} /><span>Credenciais ficam no perfil local do Chrome e não são enviadas como contexto ao modelo.</span></div>
      </div>
    </div>
    <footer className="modal-footer">{tab === 'github' && <Button variant="outline" disabled={!enabled || busy || !draft.githubToken} onClick={() => void testGitHub()}>{busy ? <Loader2 className="spin" /> : <CheckCircle2 />} Testar GitHub</Button>}<Button disabled={!enabled || busy} onClick={() => void save()}>Salvar</Button></footer>
  </section></div>;
}
