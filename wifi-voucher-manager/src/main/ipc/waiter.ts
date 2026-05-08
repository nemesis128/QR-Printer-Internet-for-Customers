import electron from 'electron';

import type { PrintVoucherResult, SystemHealth } from '../../shared/types.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { QRService } from '../services/QRService.js';

const { ipcMain } = electron;

export interface WaiterHandlerDeps {
  passwords: PasswordRepository;
  qr: QRService;
  defaultSsid: string;
}

export function registerWaiterHandlers(deps: WaiterHandlerDeps): void {
  ipcMain.handle('waiter:get-current-ssid', async (): Promise<string> => {
    const active = await deps.passwords.getActive();
    return active?.ssid ?? deps.defaultSsid;
  });

  ipcMain.handle('waiter:get-system-health', async (): Promise<SystemHealth> => {
    const active = await deps.passwords.getActive();
    return {
      printerOnline: false,
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
    try {
      const generated = await deps.qr.generate({
        ssid: active.ssid,
        password: active.password,
      });
      return {
        ok: true,
        ssid: active.ssid,
        password: active.password,
        payload: generated.payload,
        dataUrl: generated.dataUrl,
      };
    } catch (err) {
      return {
        ok: false,
        code: 'GENERATE_FAILED',
        message: err instanceof Error ? err.message : 'Error generando QR',
      };
    }
  });
}

export function unregisterWaiterHandlers(): void {
  ipcMain.removeHandler('waiter:get-current-ssid');
  ipcMain.removeHandler('waiter:get-system-health');
  ipcMain.removeHandler('waiter:print-voucher');
}
