const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    createNewWindow: () => ipcRenderer.send('create-new-window'),
    createIncognitoWindow: () => ipcRenderer.send('create-incognito-window'),
    setProxy: (config) => ipcRenderer.send('set-proxy', config),
    enableAdBlock: (enabled) => ipcRenderer.send('enable-ad-block', enabled),
    onDownloadStarted: (callback) => ipcRenderer.on('download-started', callback),
    onDownloadConnected: (callback) => ipcRenderer.on('download-progress', callback), // Correcting possible typo if existed or just ensure it's correct
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
    onDownloadComplete: (callback) => ipcRenderer.on('download-complete', callback),
    onDownloadFailed: (callback) => ipcRenderer.on('download-failed', callback),

    // Controls
    downloadControl: (id, action) => ipcRenderer.send('download-control', { id, action }), // action: pause, resume, cancel
    downloadOpen: (path, type) => ipcRenderer.send('download-open', { path, type }), // type: file, folder

    getAppMetrics: () => ipcRenderer.invoke('get-app-metrics'),
    clearCache: () => ipcRenderer.invoke('clear-cache')
});
