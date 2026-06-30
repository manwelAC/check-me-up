const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getTodayMetrics: () => ipcRenderer.invoke('get-today-metrics'),
  getTodayRhythm: () => ipcRenderer.invoke('get-today-rhythm'),
  getTodayTimeline: () => ipcRenderer.invoke('get-today-timeline'),
  getWeeklyMetrics: () => ipcRenderer.invoke('get-weekly-metrics'),
  getConfigs: () => ipcRenderer.invoke('get-configs'),
  getCategoryDiagnostics: () => ipcRenderer.invoke('get-category-diagnostics'),
  getClassificationOptions: () => ipcRenderer.invoke('get-classification-options'),
  saveConfig: (key, value) => ipcRenderer.invoke('save-config', key, value),
  clearLogs: (beforeDuration) => ipcRenderer.invoke('clear-logs', beforeDuration),
  getDaemonStatus: () => ipcRenderer.invoke('get-daemon-status'),
  toggleDaemon: () => ipcRenderer.invoke('toggle-daemon'),
  onTick: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('tracker-tick', subscription);
    return () => ipcRenderer.removeListener('tracker-tick', subscription);
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getAppIcon: (appPath) => ipcRenderer.invoke('get-app-icon', appPath),
  getHeatmapData: (range) => ipcRenderer.invoke('get-heatmap-data', range)
});
