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

/** GitHub device flow: needs only the public Client ID of an OAuth App with "Enable Device Flow" checked. */
export async function githubLogin(clientId: string, show: (code: string, url: string) => void, signal: AbortSignal): Promise<string> {
  if (!clientId.trim()) throw new Error('Informe o Client ID do OAuth App do GitHub.');
  const post = async (url: string, body: Record<string, string>) => {
    const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    return await res.json() as Record<string, string | number>;
  };
  const start = await post('https://github.com/login/device/code', { client_id: clientId.trim(), scope: 'repo' });
  if (!start['device_code']) throw new Error(`GitHub: ${start['error_description'] ?? 'Device Flow não habilitado neste OAuth App.'}`);
  show(String(start['user_code']), String(start['verification_uri']));
  if (typeof chrome !== 'undefined' && chrome.tabs) void chrome.tabs.create({ url: String(start['verification_uri']) });
  let wait = Number(start['interval'] ?? 5) * 1000;
  const deadline = Date.now() + Number(start['expires_in'] ?? 900) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r, j) => { const t = setTimeout(r, wait); signal.addEventListener('abort', () => { clearTimeout(t); j(new Error('Login cancelado.')); }, { once: true }); });
    const r = await post('https://github.com/login/oauth/access_token', { client_id: clientId.trim(), device_code: String(start['device_code']), grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    if (r['access_token']) return String(r['access_token']);
    if (r['error'] === 'slow_down') wait += 5000;
    else if (r['error'] !== 'authorization_pending') throw new Error(`GitHub: ${r['error_description'] ?? r['error']}`);
  }
  throw new Error('O código expirou. Tente novamente.');
}
