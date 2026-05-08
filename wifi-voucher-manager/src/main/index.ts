import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

import { createConnection } from './db/connection.js';
import { PasswordRepository } from './db/repositories/PasswordRepository.js';
import { runMigrations } from './db/run-migrations.js';
import { registerWaiterHandlers } from './ipc/waiter.js';
import { DEV_CSP, PROD_CSP } from './security/csp.js';
import { PasswordService } from './services/PasswordService.js';
import { QRService } from './services/QRService.js';

const { app, BrowserWindow, session } = electron;

// MUST be called before any app.getPath('userData') reference. In dev,
// Electron defaults to 'Electron' as the app name and shares userData
// with every other Electron project run from this machine. Setting it
// here gives us our own '~/Library/Application Support/wifi-voucher-manager/'.
app.setName('wifi-voucher-manager');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SSID = 'Restaurante-Clientes';

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FAFAFA',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

async function bootstrap(): Promise<void> {
  const dbPath = path.join(app.getPath('userData'), 'data.db');
  console.warn('[bootstrap] DB path:', dbPath);
  const db = createConnection({ filename: dbPath });
  await runMigrations(db);

  const passwords = new PasswordRepository(db);

  const active = await passwords.getActive();
  if (!active) {
    await passwords.insert({
      password: PasswordService.generate(),
      ssid: DEFAULT_SSID,
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
  }

  const qr = new QRService();

  registerWaiterHandlers({ passwords, qr, defaultSsid: DEFAULT_SSID });

  app.on('before-quit', () => {
    void db.destroy();
  });
}

void app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [app.isPackaged ? PROD_CSP : DEV_CSP],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });

  await bootstrap();
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
