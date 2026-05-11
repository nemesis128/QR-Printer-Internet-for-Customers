import electron from 'electron';

import type { PrintVoucherResult, SystemHealth } from '../../shared/types.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { PrinterRepository } from '../db/repositories/PrinterRepository.js';
import type { AppConfigStore } from '../services/AppConfigStore.js';
import type { PrintQueue } from '../services/PrintQueue.js';
import type { QRService } from '../services/QRService.js';
import type { RouterService } from '../services/RouterService.js';

const { ipcMain } = electron;

export interface WaiterHandlerDeps {
  passwords: PasswordRepository;
  printers: PrinterRepository;
  qr: QRService;
  queue: PrintQueue;
  defaultSsid: string;
  config: AppConfigStore;
  routerService: RouterService;
}

export function registerWaiterHandlers(deps: WaiterHandlerDeps): void {
  ipcMain.handle('waiter:get-current-ssid', async (): Promise<string> => {
    const active = await deps.passwords.getActive();
    return active?.ssid ?? deps.defaultSsid;
  });

  ipcMain.handle('waiter:get-system-health', async (): Promise<SystemHealth> => {
    const active = await deps.passwords.getActive();
    const allPrinters = await deps.printers.list();
    const activePrinter = allPrinters.find((p) => p.active === 1);
    return {
      printerOnline: activePrinter !== undefined,
      routerReachable: false,
      passwordValid: active !== null,
      schedulerRunning: false,
      lastRotation: active?.created_at ?? null,
      lastRotationStatus: active ? 'success' : null,
    };
  });

  ipcMain.handle('waiter:print-voucher', async (): Promise<PrintVoucherResult> => {
    const active = await deps.passwords.getActive();
    if (!active) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PASSWORD',
        message: 'No hay contraseña vigente. Configura el sistema en Administración.',
      };
    }
    const allPrinters = await deps.printers.list();
    const activePrinter = allPrinters.find((p) => p.active === 1);
    if (!activePrinter) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PRINTER',
        message: 'No hay impresora activa. Configura una en Administración.',
      };
    }
    try {
      const cfg = deps.config.getAll();
      const generated = await deps.qr.generate({
        ssid: active.ssid,
        password: active.password,
      });
      const jobId = await deps.queue.enqueue({
        printer_id: activePrinter.id,
        use_case: 'voucher',
        payload: {
          business_name: cfg.business.name,
          ssid: active.ssid,
          qrPng: generated.pngBuffer.toString('base64'),
          footer_message: cfg.business.footerMessage,
          triggered_at: new Date().toISOString(),
        },
        triggered_by: 'waiter',
      });
      return { ok: true, jobId };
    } catch (err) {
      return {
        ok: false,
        code: 'ENQUEUE_FAILED',
        message: err instanceof Error ? err.message : 'Error encolando job',
      };
    }
  });

  ipcMain.handle('waiter:list-pending-manual-apply', () => deps.routerService.listPendingManualApply());
}

export function unregisterWaiterHandlers(): void {
  ipcMain.removeHandler('waiter:get-current-ssid');
  ipcMain.removeHandler('waiter:get-system-health');
  ipcMain.removeHandler('waiter:print-voucher');
  ipcMain.removeHandler('waiter:list-pending-manual-apply');
}
