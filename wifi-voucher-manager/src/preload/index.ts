import { contextBridge, ipcRenderer } from 'electron';

import type { IpcAPI, PrintVoucherResult, SystemHealth } from '../shared/types.js';

const api: IpcAPI = {
  waiter: {
    getCurrentSSID: (): Promise<string> => ipcRenderer.invoke('waiter:get-current-ssid'),
    getSystemHealth: (): Promise<SystemHealth> => ipcRenderer.invoke('waiter:get-system-health'),
    printVoucher: (): Promise<PrintVoucherResult> => ipcRenderer.invoke('waiter:print-voucher'),
  },
};

contextBridge.exposeInMainWorld('api', api);
