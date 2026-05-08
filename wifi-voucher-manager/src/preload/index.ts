import { contextBridge, ipcRenderer } from 'electron';

import type {
  DiscoveredPrinter,
  IpcAPI,
  JobStatusSnapshot,
  PrintVoucherResult,
  PrinterConnection,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
  SystemHealth,
} from '../shared/types.js';

const api: IpcAPI = {
  waiter: {
    getCurrentSSID: (): Promise<string> => ipcRenderer.invoke('waiter:get-current-ssid'),
    getSystemHealth: (): Promise<SystemHealth> => ipcRenderer.invoke('waiter:get-system-health'),
    printVoucher: (): Promise<PrintVoucherResult> => ipcRenderer.invoke('waiter:print-voucher'),
  },
  printer: {
    discover: (): Promise<DiscoveredPrinter[]> => ipcRenderer.invoke('printer:discover'),
    testConnection: (input: {
      connection: PrinterConnection;
      identifier: string;
      width_chars: 32 | 48;
    }): Promise<PrinterTestResult> => ipcRenderer.invoke('printer:test-connection', input),
    list: (): Promise<PrinterRecord[]> => ipcRenderer.invoke('printer:list'),
    setActive: (id: string): Promise<void> => ipcRenderer.invoke('printer:set-active', { id }),
    getJobStatus: (jobId: string): Promise<JobStatusSnapshot | null> =>
      ipcRenderer.invoke('printer:get-job-status', { jobId }),
    retryJob: (jobId: string): Promise<void> => ipcRenderer.invoke('printer:retry-job', { jobId }),
    listRecentJobs: (limit?: number): Promise<RecentJobSummary[]> =>
      ipcRenderer.invoke('printer:list-recent-jobs', { limit }),
  },
};

contextBridge.exposeInMainWorld('api', api);
