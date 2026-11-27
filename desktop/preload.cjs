const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktopApp', {
  githubStatus: () => ipcRenderer.invoke('github:status'),
  connectGitHub: () => ipcRenderer.invoke('github:login'),
  disconnectGitHub: () => ipcRenderer.invoke('github:logout'),
  listRepositories: () => ipcRenderer.invoke('github:repos'),
  createRepository: details => ipcRenderer.invoke('github:create-repo', details),
  selectRepository: repository => ipcRenderer.invoke('github:select-repo', repository),
  startPreview: () => ipcRenderer.invoke('preview:start'),
  stopPreview: () => ipcRenderer.invoke('preview:stop'),
  openPreview: () => ipcRenderer.invoke('preview:open'),
  onDeviceCode: callback => subscribe('github:device', callback),
  onPreviewStatus: callback => subscribe('preview:status', callback),
  onPreviewOutput: callback => subscribe('preview:output', callback),
  onPreviewUrl: callback => subscribe('preview:url', callback)
});
