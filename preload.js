// Only named operations cross the isolated, sandboxed bridge.
const {contextBridge, ipcRenderer} = require('electron');
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('Expected a callback');
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}
contextBridge.exposeInMainWorld('desktop', {
  onReveal: cb => subscribe('reveal', cb),
  onConceal: cb => subscribe('conceal', cb),
  concealDone: generation => ipcRenderer.send('conceal-done', generation),
  pointerInside: value => ipcRenderer.send('pointer-inside', value),
  editing: value => ipcRenderer.send('editing', value),
  setPinned: value => ipcRenderer.send('set-pinned', value),
  setHold: value => ipcRenderer.send('set-hold', value),
  resize: height => ipcRenderer.send('resize', height),
  hide: () => ipcRenderer.send('hide-window'),
  minimize: () => ipcRenderer.send('minimize-window'),
  quit: () => ipcRenderer.send('quit-app'),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),
  onWorkAreaChanged: cb => subscribe('work-area-changed', cb),
  openStats: () => ipcRenderer.send('open-stats'),
  onToggleStatsDock: cb => subscribe('toggle-stats-dock', cb),
  syncState: state => ipcRenderer.send('sync-state', state),
  getState: () => ipcRenderer.invoke('get-state'),
  loadData: () => ipcRenderer.invoke('load-data'),
  onPrepareQuit: cb => subscribe('prepare-quit', cb),
  quitReady: state => ipcRenderer.send('quit-ready', state),
  onStorageStatus: cb => subscribe('storage-status', cb),
  getStorageStatus: () => ipcRenderer.invoke('storage-status'),
  openDataFolder: () => ipcRenderer.send('open-data-folder'),
});
