import { FREE_AUTO, accountScope, freeModels, loadCooldowns, available, markLimited, resetTime, isLimitError } from './freeModels';
import { selectableProviders, type Attachment, type Provider, type ProviderConfig } from './types';
type NativeSession = { prompt(input: string): Promise<string>; destroy(): void };
type NativeAPI = { availability(): Promise<string>; create(options?: { signal: AbortSignal }): Promise<NativeSession> };
function nativeAPI(): NativeAPI | undefined { return (globalThis as typeof globalThis & { LanguageModel?: NativeAPI }).LanguageModel; }
export const providerNames: Record<Provider, string> = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter', ollama: 'Ollama', lmstudio: 'LM Studio', openai: 'OpenAI compatível', chrome: 'IA nativa do Chrome' };
export { selectableProviders };
export async function discoverModels(provider: Provider, config: ProviderConfig, signal: AbortSignal): Promise<string[]> {
  if (provider !== 'ollama' && provider !== 'lmstudio') throw new Error('A descoberta de modelos está disponível para Ollama e LM Studio.');
  const base = endpoint(config).href.replace(/\/$/, '');
  const response = await fetch(`${base}/models`, { signal });
  if (!response.ok) throw new Error(`${providerNames[provider]} não respondeu. Confira se o servidor está aberto e o endereço está correto.`);
  const data = await response.json() as { data?: { id?: string }[] };
  const models = (data.data ?? []).map(model => model.id).filter((id): id is string => Boolean(id));
  if (!models.length) throw new Error('Nenhum modelo encontrado. Baixe um modelo e tente novamente.');
  return models;
}
export function endpoint(config: ProviderConfig): URL {
  const url = new URL(config.url);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use HTTPS ou HTTP apenas para localhost. Não inclua credenciais na URL.');
  return url;
}
export async function complete(provider: Provider, config: ProviderConfig, system: string, input: string, signal: AbortSignal, attachments: Attachment[] = []): Promise<string> {
  if (provider === 'chrome') {
    const api = nativeAPI();
    if (!api || await api.availability() === 'unavailable') throw new Error('Prompt API indisponível neste Chrome/dispositivo. Escolha outro provedor.');
    if (attachments.some(a => a.data)) throw new Error('Imagens não são suportadas pelo adaptador nativo.');
    const session = await api.create({ signal });
    const stop = () => session.destroy(); signal.addEventListener('abort', stop);
    try { return await session.prompt(`${system}\n\n${input}`); } finally { signal.removeEventListener('abort', stop); session.destroy(); }
  }
  if (provider === 'openrouter' && config.model === FREE_AUTO) {
    if (!config.key) throw new Error('Configure a chave da conta OpenRouter.');
    const base = endpoint(config).href.replace(/\/$/, '');
    const scope = await accountScope(config.key, base, signal);
    const models = await freeModels(base, signal);
    for (let i = 0; i < models.length; i++) {
      const free = available(models, await loadCooldowns(scope), Date.now());
      const model = free[0];
      if (!model) break;
      try { return await complete(provider, { ...config, model }, system, input, signal, attachments); }
      catch (e) {
        const err = e as Error & { status?: number; reset?: string | null };
        if (!err.status || !(isLimitError(err.status, err.message) || err.status === 404 || err.status >= 500)) throw e;
        await markLimited(model, resetTime(Date.now(), err.status, err.message, err.reset), scope);
      }
    }
    const c = await loadCooldowns(scope); const next = Math.min(...models.map(m => c[m] ?? Infinity));
    throw new Error(`Todos os modelos gratuitos atingiram o limite. Eles voltam automaticamente${Number.isFinite(next) ? ` a partir de ${new Date(next).toLocaleString()}` : ' mais tarde'}.`);
  }
  if (!config.model) throw new Error('Informe o identificador do modelo nas configurações.');
  const base = endpoint(config).href.replace(/\/$/, '');
  if (['gemini', 'groq', 'openrouter', 'openai'].includes(provider) && !config.key) throw new Error('Configure a chave do provedor.');
  const images = attachments.filter(a => a.data);
  if (images.length && !config.vision) throw new Error('Confirme nas configurações que este modelo suporta imagens antes de enviá-las.');
  let url: string; let body: unknown; const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'gemini') {
    url = `${base}/models/${encodeURIComponent(config.model)}:generateContent`;
    headers['x-goog-api-key'] = config.key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }, ...images.map(a => ({ inlineData: { mimeType: a.type, data: a.data?.split(',')[1] } }))] }], generationConfig: { temperature: 0.2, maxOutputTokens: 16384 } };
  } else {
    url = `${base}/chat/completions`;
    if (config.key) headers['Authorization'] = `Bearer ${config.key}`;
    body = { model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: images.length ? [{ type: 'text', text: input }, ...images.map(a => ({ type: 'image_url', image_url: { url: a.data } }))] : input }], temperature: 0.2, stream: false };
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const meta = (data.error as { metadata?: { headers?: Record<string, string>; raw?: string } } | undefined)?.metadata;
    const err = new Error(`${providerNames[provider]} (${response.status}): ${[data.error?.message, meta?.raw].filter(Boolean).join(' — ') || 'A requisição foi recusada. Verifique modelo, chave, saldo e disponibilidade.'}`) as Error & { status?: number; reset?: string | null };
    err.status = response.status; err.reset = response.headers.get('x-ratelimit-reset') ?? meta?.headers?.['X-RateLimit-Reset'] ?? null;
    throw err;
  }
  const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; choices?: { message?: { content?: string }; finish_reason?: string }[]; promptFeedback?: { blockReason?: string } };
  const finish = provider === 'gemini' ? data.candidates?.[0]?.finishReason : data.choices?.[0]?.finish_reason;
  if (finish === 'MAX_TOKENS' || finish === 'length') throw new Error('A resposta excedeu o limite do modelo. Reduza o pedido; nenhuma alteração foi preparada.');
  const text = provider === 'gemini' ? data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') : data.choices?.[0]?.message?.content;
  if (!text) throw new Error('O provedor não retornou texto. Verifique filtros e compatibilidade do modelo.');
  return text;
}
export async function testProvider(provider: Provider, config: ProviderConfig, signal: AbortSignal): Promise<string> {
  await complete(provider, config, 'Responda brevemente.', 'Responda apenas OK para testar a conexão.', signal);
  return 'Conexão verificada pelo provedor.';
}
