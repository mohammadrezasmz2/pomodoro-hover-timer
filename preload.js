// preload.js — safe bridge between the renderer and the main process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onReveal:  (cb) => ipcRenderer.on('reveal', cb),
  onConceal: (cb) => ipcRenderer.on('conceal', cb),
  concealDone: () => ipcRenderer.send('conceal-done'),
  pointerInside: (v) => ipcRenderer.send('pointer-inside', v),
  editing:  (v) => ipcRenderer.send('editing', v),
  setPinned:(v) => ipcRenderer.send('set-pinned', v),
  setHold:  (v) => ipcRenderer.send('set-hold', v),
  resize:   (h) => ipcRenderer.send('resize', h),
  hide:     () => ipcRenderer.send('hide-window'),
  minimize: () => ipcRenderer.send('minimize-window'),
  quit:     () => ipcRenderer.send('quit-app'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),
  setAutostart: (v) => ipcRenderer.send('set-autostart', v),
  openStats: () => ipcRenderer.send('open-stats'),
  onToggleStatsDock: (cb) => ipcRenderer.on('toggle-stats-dock', cb),
  syncState: (s) => ipcRenderer.send('sync-state', s),
  getState: () => ipcRenderer.invoke('get-state'),
  onStateUpdate: (cb) => ipcRenderer.on('state-update', (_e, s) => cb(s)),
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (jsonText) => ipcRenderer.send('save-data', jsonText),
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
});
