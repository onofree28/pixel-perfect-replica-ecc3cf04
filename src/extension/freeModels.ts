// Rotação automática entre modelos gratuitos do OpenRouter, com renovação quando o limite expira.
export const FREE_AUTO = 'free:auto';
export type Cooldowns = Record<string, number>; // modelo -> horário (ms) em que volta a ficar disponível
const KEY = 'freeModelCooldowns';
let memory: Cooldowns = {};
let cache: { at: number; models: string[] } | null = null;
const store = () => (globalThis as { chrome?: typeof chrome }).chrome?.storage?.local;

export async function loadCooldowns(): Promise<Cooldowns> {
  const s = store(); if (!s) return memory;
  const r = await s.get(KEY); return (r[KEY] as Cooldowns) ?? {};
}
async function saveCooldowns(c: Cooldowns) { memory = c; await store()?.set({ [KEY]: c }); }

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
export async function markLimited(model: string, until: number) { const c = await loadCooldowns(); c[model] = until; for (const k of Object.keys(c)) if ((c[k] ?? 0) <= Date.now()) delete c[k]; c[model] = until; await saveCooldowns(c); }
