import { defaults, type Settings, type Conversation } from './types';
export function inExtension(): boolean { return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id); }
export async function loadState(): Promise<{ settings: Settings; conversations: Conversation[] }> {
  if (!inExtension()) return { settings: structuredClone(defaults), conversations: [] };
  const result = await chrome.runtime.sendMessage({ type: 'LOAD' });
  return { settings: result.settings ? { ...structuredClone(defaults), ...result.settings, providers: { ...structuredClone(defaults.providers), ...result.settings.providers } } : structuredClone(defaults), conversations: result.conversations ?? [] };
}
export async function saveState(settings: Settings, conversations: Conversation[]): Promise<void> {
  if (!inExtension()) return;
  const result = await chrome.runtime.sendMessage({ type: 'SAVE', settings, conversations });
  if (result?.error) throw new Error(result.error);
}