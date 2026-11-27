import { describe, expect, it } from 'vitest';
import { defaults } from './types';
import { addOpenRouterAccount, normalizeOpenRouterAccounts, selectOpenRouterAccount } from './openrouterAccounts';

describe('contas OpenRouter', () => {
  it('preserva a conta antiga ao migrar para a lista de contas', () => {
    const legacy = structuredClone(defaults);
    legacy.providers.openrouter.key = 'chave-antiga';
    const migrated = normalizeOpenRouterAccounts(legacy);
    expect(migrated.openRouterAccounts).toEqual([{ id: 'legacy-openrouter-account', label: 'Conta 1', key: 'chave-antiga' }]);
    expect(migrated.providers.openrouter.key).toBe('chave-antiga');
  });

  it('troca a credencial ativa e mantém outras contas salvas', () => {
    const first = addOpenRouterAccount(structuredClone(defaults), 'chave-1', 'user-1');
    const second = addOpenRouterAccount(first, 'chave-2', 'user-2');
    const restored = selectOpenRouterAccount(second, 'user-1');
    expect(restored.providers.openrouter.key).toBe('chave-1');
    expect(restored.openRouterAccounts).toHaveLength(2);
    expect(restored.activeOpenRouterAccountId).toBe('user-1');
  });

  it('atualiza uma sessão existente em vez de duplicar a mesma conta', () => {
    const first = addOpenRouterAccount(structuredClone(defaults), 'chave-1', 'user-1');
    const refreshed = addOpenRouterAccount(first, 'chave-renovada', 'user-1');
    expect(refreshed.openRouterAccounts).toHaveLength(1);
    expect(refreshed.providers.openrouter.key).toBe('chave-renovada');
  });
});
