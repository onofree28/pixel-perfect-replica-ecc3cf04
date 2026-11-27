// Rotação automática entre modelos gratuitos do OpenRouter, com renovação quando o limite expira.
export const FREE_AUTO = 'free:auto';
export type Cooldowns = Record<string, number>; // modelo -> horário (ms) em que volta a ficar disponível
const KEY_PREFIX = 'freeModelCooldowns:';
const memory: Record<string, Cooldowns> = {};
const scopeCache: Record<string, string> = {};
let cache: { at: number; models: string[] } | null = null;
const store = () => (globalThis as { chrome?: typeof chrome }).chrome?.storage?.local;

async function hash(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Usa usuário/workspace do OpenRouter; persiste apenas um hash, nunca a chave ou a identidade em texto. */
export async function accountScope(apiKey: string, base: string, signal: AbortSignal): Promise<string> {
  const keyHash = await hash(apiKey.trim());
  const cacheKey = `${base}:${keyHash}`;
  if (scopeCache[cacheKey]) return scopeCache[cacheKey];
  let identity = apiKey.trim();
  try {
    const response = await fetch(`${base}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (response.ok) {
      const result = await response.json() as { data?: { creator_user_id?: string; workspace_id?: string } };
      const account = [result.data?.creator_user_id, result.data?.workspace_id].filter(Boolean).join(':');
      if (account) identity = account;
    }
  } catch (error) {
    if (signal.aborted) throw error;
  }
  const scope = await hash(identity);
  scopeCache[cacheKey] = scope;
  return scope;
}
export async function loadCooldowns(scope: string): Promise<Cooldowns> {
  const key = `${KEY_PREFIX}${scope}`;
  const s = store(); if (!s) return memory[key] ?? {};
  const r = await s.get(key); return (r[key] as Cooldowns) ?? {};
}
async function saveCooldowns(scope: string, cooldowns: Cooldowns) {
  const key = `${KEY_PREFIX}${scope}`;
  memory[key] = cooldowns; await store()?.set({ [key]: cooldowns });
}

/** Quando o limite se renova: usa o cabeçalho de reset; senão, limite diário renova à 00:00 UTC e o por minuto em 60s. */
export function resetTime(now: number, status: number, message: string, resetHeader?: string | null): number {
  const h = Number(resetHeader);
  if (h > 0) return h < 1e12 ? h * 1000 : h;
  if (status === 402 || /per[- ]day|daily|free-models-per-day/i.test(message)) { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }
  return now + 60_000;
}
/** Modelos disponíveis agora: os que estão em espera e cujo prazo já passou voltam automaticamente. */
export function available(models: string[], cooldowns: Cooldowns, now: number): string[] {
  return models.filter(m => (cooldowns[m] ?? 0) <= now);
}
export function isLimitError(status: number, message: string) { return status === 429 || status === 402 || /rate.?limit|quota/i.test(message); }

export async function freeModels(base: string, signal: AbortSignal): Promise<string[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.models;
  const r = await fetch(`${base}/models`, { signal });
  if (!r.ok) throw new Error('Não foi possível listar os modelos gratuitos do OpenRouter.');
  const data = await r.json() as { data: { id: string; pricing?: { prompt?: string; completion?: string }; context_length?: number; architecture?: { output_modalities?: string[] } }[] };
  const models = data.data.filter(m => m.id.endsWith(':free') && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0 && (m.architecture?.output_modalities ?? ['text']).includes('text'))
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0)).map(m => m.id);
  cache = { at: Date.now(), models }; return models;
}
export async function markLimited(model: string, until: number, scope: string) { const c = await loadCooldowns(scope); c[model] = until; for (const k of Object.keys(c)) if ((c[k] ?? 0) <= Date.now()) delete c[k]; c[model] = until; await saveCooldowns(scope, c); }
