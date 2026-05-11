import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';
import Store from 'electron-store';

import { BleDriver } from './adapters/printers/ble-driver.js';
import { BluetoothDriver } from './adapters/printers/bluetooth-driver.js';
import type { PrinterDriver } from './adapters/printers/driver-types.js';
import { UsbDriver } from './adapters/printers/usb-driver.js';
import { createConnection } from './db/connection.js';
import { AuditLogRepository } from './db/repositories/AuditLogRepository.js';
import { PasswordRepository } from './db/repositories/PasswordRepository.js';
import { PrintJobRepository } from './db/repositories/PrintJobRepository.js';
import { PrinterRepository } from './db/repositories/PrinterRepository.js';
import { runMigrations } from './db/run-migrations.js';
import { registerAdminHandlers } from './ipc/admin.js';
import { registerPrinterHandlers } from './ipc/printer.js';
import { registerWaiterHandlers } from './ipc/waiter.js';
import { createCredentialStorage } from './security/CredentialStorage.js';
import { DEV_CSP, PROD_CSP } from './security/csp.js';
import { AdminSession } from './services/AdminSession.js';
import { AppConfigStore } from './services/AppConfigStore.js';
import { LockoutTracker } from './services/LockoutTracker.js';
import { PasswordService } from './services/PasswordService.js';
import { PinCrypto } from './services/PinCrypto.js';
import { PrintQueue } from './services/PrintQueue.js';
import { QRService } from './services/QRService.js';
import { StatsService } from './services/StatsService.js';
import { renderPrintBytes } from './services/render.js';

const { app, BrowserWindow, session } = electron;

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

  const store = new Store<Record<string, unknown>>({ name: 'app-config' });
  const config = new AppConfigStore({
    get: (k, fallback) => (store.get(k) ?? fallback) as never,
    set: (k, v) => store.set(k, v),
  });

  // Sembrar PIN '0000' si nunca se ha configurado
  const cfgNow = config.getAll();
  if (!cfgNow.admin.pinHash) {
    const hash = await PinCrypto.hashPin('0000');
    config.updateAdmin({ pinHash: hash, pinIsDefault: true });
  }

  const audit = new AuditLogRepository(db);
  const stats = new StatsService(db, audit);
  const session = new AdminSession({ ttlMs: 30 * 60_000 });
  const lockout = new LockoutTracker({ maxAttempts: 3, windowMs: 5 * 60_000 });
  const credentials = createCredentialStorage();
  void credentials; // se usará en Fase 4 (router.password)

  const passwords = new PasswordRepository(db);
  const printers = new PrinterRepository(db);
  const jobs = new PrintJobRepository(db);

  // Seed password si no hay activa
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

  // Seed printer si no hay ninguna
  const allPrinters = await printers.list();
  if (allPrinters.length === 0) {
    await printers.create({
      id: randomUUID(),
      name: 'Aomus My A1 (placeholder)',
      connection: 'bluetooth-ble',
      identifier: 'placeholder|svc|char',
      width_chars: 32,
      active: 1,
      notes: 'Configura el identifier real desde AdminView (Fase 3)',
    });
    console.warn('[bootstrap] Sembrada impresora placeholder. Reemplazar el identifier desde AdminView en Fase 3.');
  }

  const drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver> = {
    usb: new UsbDriver(),
    bluetooth: new BluetoothDriver(),
    'bluetooth-ble': new BleDriver(),
  };

  const qr = new QRService();
  const queue = new PrintQueue({
    db,
    jobs,
    printers,
    drivers,
    renderBytes: renderPrintBytes,
  });

  queue.bootstrap();

  registerWaiterHandlers({
    passwords,
    printers,
    qr,
    queue,
    defaultSsid: DEFAULT_SSID,
    config,
  });

  registerPrinterHandlers({ printers, jobs, queue, drivers });

  registerAdminHandlers({ config, audit, stats, session, lockout });

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
