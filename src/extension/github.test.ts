import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHub } from './github';
afterEach(() => vi.unstubAllGlobals());
describe('Commits Git Data', () => {
  it('agrupa criação, atualização e exclusão em um commit sem force', async () => {
    const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
    let applied = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname; const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
      calls.push({ path, method, body });
      if (method === 'PATCH') applied = true;
      return new Response(JSON.stringify(path.includes('/ref/heads/') ? { object: { sha: applied ? 'commit-new' : 'base' } } : path.endsWith('/commits/base') ? { tree: { sha: 'tree-base' } } : path.endsWith('/commits') ? { sha: 'commit-new' } : { sha: 'created-sha' }), { status: 200 });
    }));
    await new GitHub('test-token').commit('owner/repo', 'main', 'base', [
      { path: 'new.ts', operation: 'create', content: 'new', summary: '', original: null },
      { path: 'old.ts', operation: 'update', content: 'updated', summary: '', original: { path: 'old.ts', content: 'old', sha: 'old-sha', mode: '100755' } },
      { path: 'delete.ts', operation: 'delete', content: '', summary: '', original: { path: 'delete.ts', content: 'delete', sha: 'delete-sha', mode: '100644' } },
    ], 'Pedido confirmado');
    expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/commits'))).toHaveLength(1);
    expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({ sha: 'commit-new', force: false });
    expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/trees'))?.body['tree']).toEqual([
      { path: 'new.ts', mode: '100644', type: 'blob', sha: 'created-sha' }, { path: 'old.ts', mode: '100755', type: 'blob', sha: 'created-sha' }, { path: 'delete.ts', mode: '100644', type: 'blob', sha: null },
    ]);
  });
  it('não escreve quando outra pessoa alterou a branch depois da leitura', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ object: { sha: 'external' } })));
    vi.stubGlobal('fetch', fetcher);
    await expect(new GitHub('test-token').commit('owner/repo', 'main', 'base', [{ path: 'a', operation: 'create', content: 'x', summary: '', original: null }], 'x')).rejects.toThrow('branch mudou');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('não trata árvore truncada como listagem completa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ truncated: true, tree: [] }))));
    await expect(new GitHub('test-token').tree('owner/repo', 'base')).rejects.toThrow('truncada');
  });
});