/**
 * 项目管理系统 - 桌面客户端
 * Electron 主进程：加载云端 Web 应用
 */
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// 服务器地址（固定）
const APP_URL = 'http://106.53.203.191';
const APP_HOST = '106.53.203.191';
const VERSION_URL = 'http://106.53.203.191/downloads/version.json';

let mainWindow = null;

/* ================= 自动更新 ================= */
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('网络超时')));
  });
}

let updateBusy = false;
async function checkForUpdates(manual) {
  if (updateBusy) return;
  try {
    const info = await fetchJson(VERSION_URL);
    const latest = info.version;
    if (!latest || cmpVersion(latest, app.getVersion()) <= 0) {
      if (manual) dialog.showMessageBox(mainWindow, {
        type: 'info', title: '检查更新', message: '已是最新版本',
        detail: '当前版本 v' + app.getVersion(), buttons: ['确定'], noLink: true
      }).catch(() => {});
      return;
    }
    const url = process.platform === 'win32' ? info.exeUrl
      : (process.arch === 'arm64' ? info.dmgArm64Url : info.dmgX64Url);
    if (!url) return;
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info', title: '发现新版本', message: '发现新版本 v' + latest,
      detail: (info.message || '') + '\n\n当前版本 v' + app.getVersion() + ' → 最新版本 v' + latest,
      buttons: ['立即更新', '以后再说'], defaultId: 0, noLink: true
    });
    if (choice.response === 0) doUpdate(url, latest);
  } catch (e) {
    if (manual) dialog.showMessageBox(mainWindow, {
      type: 'warning', title: '检查更新失败',
      detail: String(e.message || e), buttons: ['确定'], noLink: true
    }).catch(() => {});
  }
}

function doUpdate(url, ver) {
  updateBusy = true;
  // 下载进度小窗
  const pw = new BrowserWindow({
    width: 440, height: 180, frame: false, resizable: false,
    parent: mainWindow, modal: true, backgroundColor: '#064E3B',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const html = '<body style="margin:0;background:#064E3B;color:#fff;font-family:system-ui;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;user-select:none">'
    + '<div style="font-size:15px">正在下载 v' + ver + ' 更新包…</div>'
    + '<div style="width:80%;height:10px;background:#0f766e;border-radius:5px;overflow:hidden"><div id="bar" style="width:0%;height:100%;background:#10b981;transition:width .2s"></div></div>'
    + '<div id="txt" style="font-size:12px;color:#a7f3d0">准备中…</div></body>';
  pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const setP = (p, txt) => {
    try { pw.webContents.executeJavaScript('document.getElementById("bar").style.width="' + p + '%";document.getElementById("txt").textContent="' + txt + '"'); } catch (e) {}
  };

  const file = path.join(os.tmpdir(), 'pms-update-' + ver + (process.platform === 'win32' ? '.exe' : '.dmg'));
  const req = http.get(url, res => {
    if (res.statusCode !== 200) {
      pw.close(); updateBusy = false;
      dialog.showMessageBox(mainWindow, { type: 'error', title: '下载失败', detail: 'HTTP ' + res.statusCode, buttons: ['确定'], noLink: true }).catch(() => {});
      return;
    }
    const total = parseInt(res.headers['content-length'] || '0', 10);
    let done = 0;
    const ws = fs.createWriteStream(file);
    res.on('data', c => {
      done += c.length;
      if (total) setP(Math.round(done * 100 / total), (done / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB');
    });
    res.pipe(ws);
    ws.on('finish', () => {
      setP(100, '下载完成');
      setTimeout(() => {
        pw.close();
        if (process.platform === 'win32') {
          dialog.showMessageBox(mainWindow, {
            type: 'info', title: '更新就绪', message: '更新包已下载完成',
            detail: '点击"立即安装"后，程序将自动完成升级（请稍候片刻）。',
            buttons: ['立即安装', '稍后再说'], defaultId: 0, noLink: true
          }).then(({ response }) => {
            if (response === 0) {
              spawn(file, ['/S'], { detached: true, stdio: 'ignore' }).unref();
              app.quit();
            } else { updateBusy = false; }
          }).catch(() => { updateBusy = false; });
        } else {
          // macOS：自动挂载 dmg，把新图标拖进 Applications 即完成
          shell.openPath(file);
          updateBusy = false;
        }
      }, 400);
    });
    ws.on('error', e => {
      pw.close(); updateBusy = false;
      dialog.showMessageBox(mainWindow, { type: 'error', title: '写入文件失败', detail: String(e.message || e), buttons: ['确定'], noLink: true }).catch(() => {});
    });
  });
  req.on('error', e => {
    pw.close(); updateBusy = false;
    dialog.showMessageBox(mainWindow, { type: 'error', title: '下载失败', detail: String(e.message || e), buttons: ['确定'], noLink: true }).catch(() => {});
  });
}
/* ================= 自动更新 END ================= */

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
          label: '检查更新',
          click: () => { checkForUpdates(true); }
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '项目管理系统',
              detail: `版本 v${app.getVersion()}\n\n桌面客户端（Electron）\n服务器: ${APP_URL}\n\n启动时自动检查更新，也可手动检查`,
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

    // 启动 5 秒后检查更新，之后每 6 小时检查一次
    setTimeout(() => checkForUpdates(false), 5000);
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);

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
