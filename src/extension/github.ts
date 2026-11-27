import type { Change, Repo, Snapshot, TreeFile } from './types';
import { MAX_FILE_BYTES } from './security';
const encode = (s: string) => s.split('/').map(encodeURIComponent).join('/');
export class GitHub {
  constructor(private token: string) {}
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.token) throw new Error('Configure seu token GitHub.');
    const response = await fetch(`https://api.github.com${path}`, { method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({})) as { message?: string };
      const friendly: Record<number, string> = { 401: 'Token GitHub inválido.', 403: 'GitHub recusou o acesso. Verifique permissões e limite de requisições.', 404: 'Repositório, branch ou arquivo não encontrado.', 409: 'Conflito no repositório.', 422: 'GitHub recusou a alteração. A branch pode ter sido atualizada ou protegida.' };
      throw new Error(`${friendly[response.status] ?? `GitHub: erro ${response.status}.`} ${detail.message ?? ''}`);
    }
    return response.json() as Promise<T>;
  }
  async repos(): Promise<Repo[]> {
    const all: Repo[] = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await this.request<Repo[]>(`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`);
      all.push(...batch); if (batch.length < 100) break;
    }
    // Repositórios de organizações (onde a Lovable costuma criar projetos) que a listagem padrão pode omitir.
    const orgs = await this.request<{ login: string }[]>('/user/orgs?per_page=100').catch(() => []);
    for (const org of orgs) for (let page = 1; page <= 20; page++) {
      const batch = await this.request<Repo[]>(`/orgs/${encodeURIComponent(org.login)}/repos?per_page=100&page=${page}&type=all`).catch(() => [] as Repo[]);
      all.push(...batch); if (batch.length < 100) break;
    }
    const seen = new Set<string>();
    return all.filter(r => !seen.has(r.full_name) && seen.add(r.full_name));
  }
  async repo(fullName: string): Promise<Repo> {
    const name = fullName.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error('Use o formato dono/repositório ou cole o link do GitHub.');
    return this.request<Repo>(`/repos/${name}`);
  }
  async branches(repo: string): Promise<string[]> {
    const all: string[] = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await this.request<{ name: string }[]>(`/repos/${encode(repo)}/branches?per_page=100&page=${page}`);
      all.push(...batch.map(b => b.name)); if (batch.length < 100) return all;
    }
    throw new Error('A lista de branches excede o limite de paginação.');
  }
  async head(repo: string, branch: string): Promise<string> {
    return (await this.request<{ object: { sha: string } }>(`/repos/${encode(repo)}/git/ref/heads/${encode(branch)}`)).object.sha;
  }
  async tree(repo: string, commit: string): Promise<TreeFile[]> {
    const result = await this.request<{ tree: TreeFile[]; truncated: boolean }>(`/repos/${encode(repo)}/git/trees/${commit}?recursive=1`);
    if (result.truncated) throw new Error('Árvore truncada pelo GitHub. Reduza o tamanho do repositório; alterações foram bloqueadas.');
    return result.tree.filter(f => f.type === 'blob');
  }
  async read(repo: string, file: TreeFile): Promise<Snapshot> {
    if ((file.size ?? 0) > MAX_FILE_BYTES) throw new Error(`Arquivo acima de 160 KB: ${file.path}`);
    const blob = await this.request<{ content: string; encoding: string; size: number }>(`/repos/${encode(repo)}/git/blobs/${file.sha}`);
    if (blob.size > MAX_FILE_BYTES || blob.encoding !== 'base64') throw new Error('Arquivo acima do limite ou codificação não suportada.');
    const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('Arquivo binário ou não UTF-8.'); }
    if (content.includes('\0')) throw new Error('Arquivo binário bloqueado.');
    return { path: file.path, sha: file.sha, content, mode: file.mode };
  }
  async commit(repo: string, branch: string, base: string, changes: Change[], message: string): Promise<{ sha: string; html_url: string }> {
    if (!changes.length) throw new Error('Nenhuma alteração selecionada.');
    if (await this.head(repo, branch) !== base) throw new Error('A branch mudou depois da análise. Refaça a solicitação para não sobrescrever alterações externas.');
    const parent = await this.request<{ tree: { sha: string } }>(`/repos/${encode(repo)}/git/commits/${base}`);
    const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
    for (const change of changes) {
      const sha = change.operation === 'delete' ? null : (await this.request<{ sha: string }>(`/repos/${encode(repo)}/git/blobs`, 'POST', { content: change.content, encoding: change.encoding ?? 'utf-8' })).sha;
      entries.push({ path: change.path, mode: change.original?.mode ?? '100644', type: 'blob', sha });
    }
    const tree = await this.request<{ sha: string }>(`/repos/${encode(repo)}/git/trees`, 'POST', { base_tree: parent.tree.sha, tree: entries });
    const commit = await this.request<{ sha: string; html_url: string }>(`/repos/${encode(repo)}/git/commits`, 'POST', { message, tree: tree.sha, parents: [base] });
    if (await this.head(repo, branch) !== base) throw new Error('A branch mudou durante a operação. O commit não foi aplicado à branch.');
    await this.request(`/repos/${encode(repo)}/git/refs/heads/${encode(branch)}`, 'PATCH', { sha: commit.sha, force: false });
    if (await this.head(repo, branch) !== commit.sha) throw new Error(`Não foi possível confirmar o estado final. Verifique o commit ${commit.sha} no GitHub antes de tentar novamente.`);
    return { sha: commit.sha, html_url: `https://github.com/${encode(repo)}/commit/${commit.sha}` };
  }
  async revert(repo: string, branch: string, sha: string): Promise<{ sha: string; html_url: string }> {
    if (await this.head(repo, branch) !== sha) throw new Error('O projeto mudou depois do último envio. Desfaça pelo histórico do Lovable ou do GitHub para não perder essas alterações.');
    const target = await this.request<{ parents: { sha: string }[] }>(`/repos/${encode(repo)}/git/commits/${sha}`);
    const parent = target.parents[0]?.sha; if (!parent || target.parents.length !== 1) throw new Error('Este envio não pode ser desfeito automaticamente.');
    const before = await this.request<{ tree: { sha: string } }>(`/repos/${encode(repo)}/git/commits/${parent}`);
    const commit = await this.request<{ sha: string }>(`/repos/${encode(repo)}/git/commits`, 'POST', { message: `Desfaz ${sha.slice(0, 8)}`, tree: before.tree.sha, parents: [sha] });
    await this.request(`/repos/${encode(repo)}/git/refs/heads/${encode(branch)}`, 'PATCH', { sha: commit.sha, force: false });
    return { sha: commit.sha, html_url: `https://github.com/${encode(repo)}/commit/${commit.sha}` };
  }
}
