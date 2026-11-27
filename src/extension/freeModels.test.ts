import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { accountScope, available, loadCooldowns, markLimited, resetTime, isLimitError } from './freeModels';
describe('rotação de modelos grátis', () => {
  const now = Date.UTC(2026, 10, 26, 11, 0);
  it('pula modelo em espera e o renova quando o prazo passa', () => {
    expect(available(['a', 'b'], { a: now + 1000 }, now)).toEqual(['b']);
    expect(available(['a', 'b'], { a: now + 1000 }, now + 1000)).toEqual(['a', 'b']);
  });
  it('limite diário renova à meia-noite UTC', () => { expect(resetTime(now, 429, 'Rate limit exceeded: free-models-per-day')).toBe(Date.UTC(2026, 10, 27)); });
  it('limite por minuto renova em 60s', () => { expect(resetTime(now, 429, 'Rate limit exceeded')).toBe(now + 60_000); });
  it('usa o cabeçalho de reset quando existe', () => { expect(resetTime(now, 429, '', String(now + 5000))).toBe(now + 5000); });
  it('reconhece erro de limite', () => { expect(isLimitError(429, '')).toBe(true); expect(isLimitError(400, 'bad')).toBe(false); });
  it('mantém cooldowns separados por conta OpenRouter sem armazenar a chave', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', async (_url: string, init: { headers?: { Authorization?: string } }) => {
      const token = init.headers?.Authorization ?? '';
      const account = token.includes('account-one') || token.includes('rotated-key') ? 'user-one' : 'user-two';
      return { ok: true, json: async () => ({ data: { creator_user_id: account, workspace_id: 'workspace' } }) };
    });
    try {
      const first = await accountScope('sk-or-v1-account-one', 'https://openrouter.ai/api/v1', new AbortController().signal);
      const rotated = await accountScope('sk-or-v1-rotated-key', 'https://openrouter.ai/api/v1', new AbortController().signal);
      const second = await accountScope('sk-or-v1-account-two', 'https://openrouter.ai/api/v1', new AbortController().signal);
      expect(first).not.toBe(second);
      expect(first).toBe(rotated);
      await markLimited('model:free', now + 60_000, first);
      expect(available(['model:free'], await loadCooldowns(first), now)).toEqual([]);
      expect(available(['model:free'], await loadCooldowns(second), now)).toEqual(['model:free']);
      expect(first).not.toContain('sk-or');
    } finally { vi.unstubAllGlobals(); }
  });
});
