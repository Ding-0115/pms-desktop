/**
 * 项目管理系统 - 桌面客户端
 * Electron 主进程：加载云端 Web 应用
 */
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');

// 服务器地址（固定）
const APP_URL = 'http://106.53.203.191';
const APP_HOST = '106.53.203.191';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '项目管理系统',
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#064E3B',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // 加载远程应用
  mainWindow.loadURL(APP_URL);

  // 外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 防止跳出应用
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.host !== APP_HOST) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  // 页面加载失败时提示重试
  let failTimer = null;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode !== -3) { // -3 = aborted
      if (failTimer) clearTimeout(failTimer);
      failTimer = setTimeout(() => {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: '无法连接到服务器',
          message: '无法连接到项目管理系统服务器',
          detail: `请检查网络连接后重试。\n\n服务器：${APP_URL}\n\n错误：${errorDescription} (${errorCode})`,
          buttons: ['重试', '退出'],
          noLink: true
        }).then(({ response }) => {
          if (response === 0) {
            mainWindow.loadURL(APP_URL);
          } else {
            app.quit();
          }
        }).catch(() => {});
      }, 500);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 应用菜单
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload', label: '刷新页面' },
        { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '用浏览器打开',
          click: () => { shell.openExternal(APP_URL); }
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '项目管理系统',
              detail: `版本 1.0.0\n\n桌面客户端（Electron）\n服务器: ${APP_URL}`,
              buttons: ['确定']
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
