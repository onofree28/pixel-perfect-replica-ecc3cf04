import type { OpenRouterAccount, Settings } from './types';

export function normalizeOpenRouterAccounts(settings: Settings): Settings {
  let accounts = settings.openRouterAccounts ?? [];
  if (!accounts.length && settings.providers.openrouter.key) {
    accounts = [{ id: 'legacy-openrouter-account', label: 'Conta 1', key: settings.providers.openrouter.key }];
  }
  const active = accounts.find(account => account.id === settings.activeOpenRouterAccountId)
    ?? accounts.find(account => account.key === settings.providers.openrouter.key)
    ?? accounts[0];
  const { activeOpenRouterAccountId: _previousActive, ...rest } = settings;
  return {
    ...rest,
    openRouterAccounts: accounts,
    ...(active ? { activeOpenRouterAccountId: active.id } : {}),
    providers: { ...settings.providers, openrouter: { ...settings.providers.openrouter, key: active?.key ?? settings.providers.openrouter.key } },
  };
}

export function addOpenRouterAccount(settings: Settings, key: string, userId?: string | null): Settings {
  const current = normalizeOpenRouterAccounts(settings);
  const accounts = [...(current.openRouterAccounts ?? [])];
  const id = userId || crypto.randomUUID();
  const previous = accounts.find(account => account.id === id);
  const account: OpenRouterAccount = { id, label: previous?.label ?? `Conta ${accounts.length + 1}`, key };
  const nextAccounts = previous ? accounts.map(item => item.id === id ? account : item) : [...accounts, account];
  return normalizeOpenRouterAccounts({ ...current, openRouterAccounts: nextAccounts, activeOpenRouterAccountId: id, providers: { ...current.providers, openrouter: { ...current.providers.openrouter, key } } });
}

export function selectOpenRouterAccount(settings: Settings, id: string): Settings {
  const current = normalizeOpenRouterAccounts(settings);
  const account = current.openRouterAccounts?.find(item => item.id === id);
  if (!account) return current;
  return { ...current, activeOpenRouterAccountId: id, providers: { ...current.providers, openrouter: { ...current.providers.openrouter, key: account.key } } };
}
