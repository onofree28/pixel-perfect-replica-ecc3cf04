import { describe, expect, it } from 'vitest';
import { sensitivePath, sensitiveContent, safePath, redact, validateChanges } from './security';
describe('Proteções do assistente', () => {
  it('bloqueia arquivos .env e chaves privadas por padrão', () => {
    for (const path of ['.env', '.env.local', 'app/.env.production', 'cert.key', 'id_rsa']) expect(sensitivePath(path)).toBe(true);
    expect(sensitivePath('src/index.ts')).toBe(false);
  });
  it('identifica credenciais no conteúdo', () => { expect(sensitiveContent('-----BEGIN PRIVATE KEY-----')).toBe(true); expect(sensitiveContent('const x = 1')).toBe(false); });
  it('nunca envia tokens configurados no texto', () => { expect(redact('token12345 abc', ['token12345'])).toBe('[credencial removida] abc'); });
  it('rejeita caminhos fora do repositório', () => { expect(safePath('../a')).toBe(false); expect(safePath('/a')).toBe(false); expect(safePath('.git/config')).toBe(false); expect(safePath('src/a.ts')).toBe(true); });
  it('exige leitura do arquivo original antes de atualizar', () => { expect(() => validateChanges([{ path: 'a.ts', operation: 'update', content: 'new' }], [{ path: 'a.ts', sha: 'old', mode: '100644', type: 'blob' }], [])).toThrow('ler'); });
  it('não permite criar sobre um arquivo existente', () => { expect(() => validateChanges([{ path: 'a.ts', operation: 'create', content: 'new' }], [{ path: 'a.ts', sha: 'old', mode: '100644', type: 'blob' }], [])).toThrow('já existe'); });
  it('preserva conteúdo final completo da alteração', () => {
    const content = 'export const x = 1;\nexport const y = 2;';
    expect(validateChanges([{ path: 'a.ts', operation: 'create', content }], [], [])[0]?.content).toBe(content);
  });
});