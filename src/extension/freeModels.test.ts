import { describe, it, expect } from 'vitest';
import { available, resetTime, isLimitError } from './freeModels';
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
});
