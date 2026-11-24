// Safe bridge between the app page and the Electron main process (used only by "Update app…").
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('upd:info'),
  fromFolder: () => ipcRenderer.invoke('upd:folder'),
  fromUrl: url => ipcRenderer.invoke('upd:url', url),
  ghCheck: () => ipcRenderer.invoke('upd:ghcheck'),
  ghInstall: () => ipcRenderer.invoke('upd:ghinstall'),
  canInstaller: () => ipcRenderer.invoke('upd:caninstaller'),
  installerUpdate: () => ipcRenderer.invoke('upd:installer'),
  onProgress: cb => { const f = (e, d) => cb(d); ipcRenderer.on('upd:progress', f); return () => ipcRenderer.removeListener('upd:progress', f); },
  reset: () => ipcRenderer.invoke('upd:reset'),
  restart: () => ipcRenderer.invoke('upd:restart')
});
