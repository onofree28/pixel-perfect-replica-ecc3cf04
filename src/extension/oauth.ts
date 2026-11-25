function b64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** OpenRouter PKCE login: the user signs in on openrouter.ai and the extension receives a key, without copying it. */
export async function openRouterLogin(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.identity) throw new Error('Login disponível apenas na extensão instalada.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const callback = chrome.identity.getRedirectURL('openrouter');
  const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`;
  const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const code = result ? new URL(result).searchParams.get('code') : null;
  if (!code) throw new Error('Login cancelado ou não autorizado.');
  const res = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
  const data = await res.json().catch(() => ({})) as { key?: string; error?: { message?: string } };
  if (!res.ok || !data.key) throw new Error(`OpenRouter (${res.status}): ${data.error?.message ?? 'falha ao concluir o login.'}`);
  return data.key;
}
