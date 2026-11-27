import { defaults, selectableProviders, type Settings, type Conversation } from './types';
import { normalizeOpenRouterAccounts } from './openrouterAccounts';
export function inExtension(): boolean { return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id); }
export async function loadState(): Promise<{ settings: Settings; conversations: Conversation[] }> {
  if (!inExtension()) return { settings: structuredClone(defaults), conversations: [] };
  const result = await chrome.runtime.sendMessage({ type: 'LOAD' });
  if (!result.settings) return { settings: structuredClone(defaults), conversations: result.conversations ?? [] };
  let settings = normalizeOpenRouterAccounts({ ...structuredClone(defaults), ...result.settings, providers: { ...structuredClone(defaults.providers), ...result.settings.providers } } as Settings);
  if (!selectableProviders.includes(settings.provider)) settings.provider = 'openrouter';
  return { settings, conversations: result.conversations ?? [] };
}
export async function saveState(settings: Settings, conversations: Conversation[]): Promise<void> {
  if (!inExtension()) return;
  const result = await chrome.runtime.sendMessage({ type: 'SAVE', settings, conversations });
  if (result?.error) throw new Error(result.error);
}
