import { MAX_FILE_BYTES, sensitiveContent, sensitivePath, safePath } from './security';
import type { Attachment, Change, TreeFile } from './types';
export async function readAttachments(files: File[], authorize: (name: string) => Promise<boolean>): Promise<Attachment[]> {
  if (files.length > 8 || files.reduce((sum, f) => sum + f.size, 0) > 12_000_000) throw new Error('Limite: 8 anexos e 12 MB no total.');
  const result: Attachment[] = [];
  for (const file of files) {
    if (file.size > 4_000_000) throw new Error(`Anexo acima de 4 MB: ${file.name}`);
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      result.push({ name: file.name, type: file.type, data, destination: '' }); continue;
    }
    let text: string;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('pdf.worker.min.mjs') : '/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      try {
        if (pdf.numPages > 50) throw new Error('PDF acima de 50 páginas.');
        const pages: string[] = [];
        for (let n = 1; n <= pdf.numPages; n++) { const page = await pdf.getPage(n); const content = await page.getTextContent(); pages.push(content.items.map(i => 'str' in i ? i.str : '').join(' ')); }
        text = pages.join('\n'); if (!text.trim()) throw new Error('PDF sem camada de texto. OCR não disponível.');
      } finally { await pdf.cleanup(); }
    } else {
      if (file.size > MAX_FILE_BYTES) throw new Error(`Texto acima de 160 KB: ${file.name}`);
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error(`Formato binário não suportado: ${file.name}`); }
      if (text.includes('\0')) throw new Error(`Arquivo binário: ${file.name}`);
    }
    if (text.length > MAX_FILE_BYTES) throw new Error('Texto extraído acima de 160 KB.');
    if ((sensitivePath(file.name) || sensitiveContent(text)) && !await authorize(file.name)) throw new Error(`Anexo sensível não autorizado: ${file.name}`);
    result.push({ name: file.name, type: file.type || 'text/plain', text, destination: '' });
  }
  return result;
}
export function attachmentChanges(attachments: Attachment[], files: TreeFile[]): Change[] {
  return attachments.filter(a => a.destination).map(a => {
    if (!safePath(a.destination) || sensitivePath(a.destination)) throw new Error(`Destino inválido ou sensível: ${a.destination}`);
    if (files.some(f => f.path === a.destination)) throw new Error(`O destino já existe: ${a.destination}. Peça uma atualização à IA para revisar o original.`);
    if (a.text && sensitiveContent(a.text)) throw new Error('Conteúdo com possível segredo não pode ser adicionado ao GitHub.');
    return { path: a.destination, operation: 'create', content: a.data ? (a.data.split(',')[1] ?? '') : a.text ?? '', encoding: a.data ? 'base64' : 'utf-8', summary: `Anexo: ${a.name}`, original: null };
  });
}