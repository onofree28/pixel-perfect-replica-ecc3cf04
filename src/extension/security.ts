import type { Change, Snapshot, TreeFile } from './types';
export const MAX_FILE_BYTES = 160_000;
export const MAX_CONTEXT_BYTES = 600_000;
export function sensitivePath(path: string): boolean {
  return /(^|\/)(\.env($|\.)|\.npmrc|\.pypirc|credentials[^/]*|id_(rsa|ed25519)|secrets?([./]|$))|\.(pem|key|p12|pfx|crt|cer)$/i.test(path);
}
export function sensitiveContent(text: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9_+\/-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[a-zA-Z0-9_-]{20,}/i.test(text);
}
export function safePath(path: string): boolean {
  return path.length > 0 && path.length < 500 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(p => !p || p === '.' || p === '..' || p === '.git') && !/[\x00-\x1f]/.test(path);
}
export function findTreeFile(path: string, files: TreeFile[]): TreeFile | undefined {
  const exact = files.find(file => file.path === path);
  if (exact) return exact;
  const matches = files.filter(file => file.path.toLocaleLowerCase() === path.toLocaleLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}
export function textFile(path: string): boolean {
  return !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz|mp[34]|wav|exe|bin|lock)$/i.test(path);
}
export function redact(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) if (secret.length > 3) result = result.split(secret).join('[credencial removida]');
  return result.replace(/gh[pousr]_[A-Za-z0-9]{20,}|sk-[a-zA-Z0-9_-]{20,}/g, '[credencial removida]');
}
export function validateChanges(raw: unknown, files: TreeFile[], snapshots: Snapshot[]): Change[] {
  if (!Array.isArray(raw) || raw.length > 40) throw new Error('A IA deve retornar no máximo 40 alterações estruturadas.');
  const seen = new Set<string>();
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Alteração inválida.');
    const value = item as Record<string, unknown>;
    const path = value['path']; const operation = value['operation']; const content = value['content'];
    if (typeof path !== 'string' || !safePath(path) || seen.has(path)) throw new Error('Caminho inválido ou duplicado na resposta da IA.');
    seen.add(path);
    if (sensitivePath(path)) throw new Error(`Alteração de arquivo sensível bloqueada: ${path}`);
    if (operation !== 'create' && operation !== 'update' && operation !== 'delete') throw new Error('Operação desconhecida.');
    if (operation !== 'delete' && (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_FILE_BYTES || content.includes('\0'))) throw new Error(`Conteúdo inválido ou muito grande: ${path}`);
    if (typeof content === 'string' && sensitiveContent(content)) throw new Error(`Possível credencial no conteúdo gerado: ${path}`);
    const exists = files.find(f => f.path === path);
    const original = snapshots.find(f => f.path === path) ?? null;
    if (operation === 'create' && exists) throw new Error(`Arquivo já existe: ${path}`);
    if (operation !== 'create' && (!exists || !original)) throw new Error(`A IA precisa ler o arquivo antes de alterá-lo: ${path}`);
    if (exists && !['100644', '100755'].includes(exists.mode)) throw new Error('Links e submódulos não podem ser modificados.');
    return { path, operation, content: operation === 'delete' ? '' : String(content), summary: typeof value['summary'] === 'string' ? value['summary'] : '', original };
  });
}
