const { app, BrowserWindow, ipcMain, session, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Window Management
let windows = new Set();
let mainWindow;

const AdBlocker = require('./adblocker');
const adBlocker = new AdBlocker();

function createWindow(isMain = true, isIncognito = false) {
  let win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: isIncognito ? '#121212' : '#0a0a0a',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: false, // Critical for loading local modules/CDNs in file://
      partition: isIncognito ? `incognito-${Date.now()}` : 'persist:main', // Isolate session for window itself if needed
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const { pathToFileURL } = require('url');

  if (isMain) {
    mainWindow = win;
  }

  windows.add(win);

  if (isIncognito) {
    // Robust way to get file URL on Windows
    const fileUrl = pathToFileURL(path.join(__dirname, 'index.html')).toString();
    win.loadURL(`${fileUrl}?incognito=true`);
  } else {
    win.loadFile('index.html');
  }

  // Ad Blocking
  const filter = {
    urls: ['*://*/*']
  };

  win.webContents.session.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (adBlocker.shouldBlock(details.url)) {
      // console.log('Blocked:', details.url);
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });

  win.on('closed', function () {
    windows.delete(win);
    if (isMain) mainWindow = null;
  });

  // Handle new window opening from webviews
  win.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });

  // Download Management
  const activeDownloads = new Map();

  session.defaultSession.on('will-download', (event, item, webContents) => {
    const fileName = item.getFilename();
    const downloadId = Date.now().toString(); // Simple ID
    activeDownloads.set(downloadId, item);

    // Send start event
    win.webContents.send('download-started', {
      id: downloadId,
      filename: fileName,
      totalBytes: item.getTotalBytes()
    });

    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        win.webContents.send('download-failed', { id: downloadId, filename: fileName, state: 'interrupted' });
      } else if (state === 'progressing') {
        if (!item.isPaused()) {
          win.webContents.send('download-progress', {
            id: downloadId,
            filename: fileName,
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes()
          });
        }
      }
    });

    item.once('done', (event, state) => {
      activeDownloads.delete(downloadId); // Cleanup

      if (state === 'completed') {
        win.webContents.send('download-complete', {
          id: downloadId,
          filename: fileName,
          path: item.getSavePath()
        });
      } else {
        win.webContents.send('download-failed', {
          id: downloadId,
          filename: fileName,
          state: state
        });
      }
    });
  });

  // IPC Handlers for Download Control
  ipcMain.on('download-control', (event, { id, action }) => {
    const item = activeDownloads.get(id);
    if (!item && action !== 'clear') return; // 'clear' might be UI only

    if (item) {
      if (action === 'pause' && !item.isPaused()) item.pause();
      if (action === 'resume' && item.isPaused()) item.resume();
      if (action === 'cancel') item.cancel();
    }
  });

  ipcMain.on('download-open', (event, { path: filePath, type }) => {
    if (!filePath) return;
    if (type === 'file') {
      shell.openPath(filePath);
    } else if (type === 'folder') {
      shell.showItemInFolder(filePath);
    }
  });

  windows.add(win);
  return win;
}

// IPC handlers for window controls - target the sender window
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('create-new-window', () => {
  createWindow(false);
});

ipcMain.on('create-incognito-window', () => {
  createWindow(false, true); // isMain=false, isIncognito=true
});

// Proxy Settings
ipcMain.on('set-proxy', (event, config) => {
  if (!config || !config.enabled) {
    session.defaultSession.setProxy({ mode: 'direct' });
  } else {
    session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: config.proxyUrl
    }).then(() => {
      console.log('Proxy set to', config.proxyUrl);
    }).catch(console.error);
  }
});

ipcMain.handle('get-app-metrics', async () => {
  const metrics = app.getAppMetrics();
  // Calculate total working set (RAM usage) in MB
  const totalMemory = metrics.reduce((acc, metric) => acc + (metric.memory.workingSetSize / 1024), 0) / 1024;
  return Math.round(totalMemory);
});

ipcMain.handle('clear-cache', async () => {
  if (mainWindow) {
    await mainWindow.webContents.session.clearCache();
    await mainWindow.webContents.session.clearStorageData();
    console.log('Cache and storage cleared.');
  }
});

ipcMain.on('enable-ad-block', (event, enabled) => {
  adBlocker.enable(enabled);
});


// App lifecycle
app.whenReady().then(() => {
  mainWindow = createWindow(true);

  app.on('activate', function () {
    if (windows.size === 0) createWindow(true);
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
