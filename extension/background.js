chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (message.type === 'PROJECT' && sender.tab && /^https:\/\/([\w-]+\.)?lovable\.dev\//.test(sender.url ?? '')) {
    const url = new URL(sender.url);
    const id = url.pathname.match(/\/projects\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
    if (id) chrome.storage.local.set({ detectedProject: { id, name: String(message.name ?? '').slice(0, 120), url: url.origin + '/projects/' + id } });
    respond({ ok: true }); return false;
  }
  if (!trusted) { respond({ error: 'Acesso recusado.' }); return false; }
  if (message.type === 'LOAD') { chrome.storage.local.get(['settings', 'conversations', 'detectedProject']).then(respond).catch(() => respond({ error: 'Falha ao ler dados locais.' })); return true; }
  if (message.type === 'SAVE') { chrome.storage.local.set({ settings: message.settings, conversations: message.conversations }).then(() => respond({ ok: true })).catch(() => respond({ error: 'Armazenamento cheio ou indisponível. Exporte e limpe o histórico.' })); return true; }
  return false;
});