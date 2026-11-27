export type Provider = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'lmstudio' | 'openai' | 'chrome';
export const selectableProviders: Provider[] = ['openrouter', 'ollama', 'lmstudio', 'chrome'];
export type ProviderConfig = { key: string; url: string; model: string; vision: boolean };
export type OpenRouterAccount = { id: string; label: string; key: string };
export type Settings = { githubToken: string; provider: Provider; providers: Record<Provider, ProviderConfig>; openRouterAccounts?: OpenRouterAccount[]; activeOpenRouterAccountId?: string; projectRepos?: Record<string, string>; githubClientId?: string };
export type Repo = { full_name: string; name: string; owner: { login: string }; default_branch: string; html_url: string };
export type TreeFile = { path: string; sha: string; size?: number; type: string; mode: string };
export type Snapshot = { path: string; sha: string; content: string; mode: string };
export type Change = { path: string; operation: 'create' | 'update' | 'delete'; content: string; summary: string; original: Snapshot | null; encoding?: 'utf-8' | 'base64' };
export type Message = { id: string; role: 'user' | 'assistant'; content: string; model?: string };
export type Attachment = { name: string; type: string; text?: string; data?: string; destination: string };
export type Pending = { repo: string; branch: string; base: string; plan: string; changes: Change[] };
export type Conversation = { id: string; title: string; repo: string; branch: string; messages: Message[]; summary: string; pending: Pending | null; updated: number; lastCommit?: { repo: string; branch: string; sha: string } };
export const GITHUB_CLIENT_ID = 'Ov23liFoS2c1TYWqEGv9';
export const defaults: Settings = {
  githubToken: '', provider: 'openrouter', providers: {
    gemini: { key: '', url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', vision: true },
    groq: { key: '', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', vision: false },
    openrouter: { key: '', url: 'https://openrouter.ai/api/v1', model: 'free:auto', vision: false },
    ollama: { key: '', url: 'http://localhost:11434/v1', model: '', vision: false },
    lmstudio: { key: '', url: 'http://localhost:1234/v1', model: '', vision: false },
    openai: { key: '', url: 'https://api.openai.com/v1', model: '', vision: false },
    chrome: { key: '', url: '', model: 'Chrome Prompt API', vision: false },
  },
};
