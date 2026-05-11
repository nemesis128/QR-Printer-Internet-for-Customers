import { contextBridge, ipcRenderer } from 'electron';

import type {
  AdminAPI,
  AppConfigDTO,
  AuditLogEntryDTO,
  ChangePinResultDTO,
  DiscoveredPrinter,
  IpcAPI,
  JobStatusSnapshot,
  PendingManualApplyDTO,
  PrintVoucherResult,
  PrinterConnection,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
  RouterAPI,
  RouterApplyResultDTO,
  RouterPingResultDTO,
  RouterTestResultDTO,
  StatsBundleDTO,
  SystemHealth,
  UpdateConfigResultDTO,
  ValidatePinResultDTO,
} from '../shared/types.js';

const adminApi: AdminAPI = {
  validatePin: (input): Promise<ValidatePinResultDTO> => ipcRenderer.invoke('admin:validate-pin', input),
  changePin: (input): Promise<ChangePinResultDTO> => ipcRenderer.invoke('admin:change-pin', input),
  getConfig: (input): Promise<AppConfigDTO | null> => ipcRenderer.invoke('admin:get-config', input),
  updateConfig: (input): Promise<UpdateConfigResultDTO> => ipcRenderer.invoke('admin:update-config', input),
  getStats: (input): Promise<StatsBundleDTO | null> => ipcRenderer.invoke('admin:get-stats', input),
  listLogs: (input): Promise<AuditLogEntryDTO[]> => ipcRenderer.invoke('admin:list-logs', input),
  rotatePasswordNow: (input): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('admin:rotate-password-now', input),
};

const routerApi: RouterAPI = {
  pingRouter: (input): Promise<RouterPingResultDTO> => ipcRenderer.invoke('router:ping', input),
  testConnection: (input): Promise<RouterTestResultDTO> => ipcRenderer.invoke('router:test-connection', input),
  applyPasswordNow: (input): Promise<RouterApplyResultDTO> => ipcRenderer.invoke('router:apply-password-now', input),
  markAppliedManually: (input): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('router:mark-applied-manually', input),
  listPendingManualApply: (input): Promise<PendingManualApplyDTO[]> =>
    ipcRenderer.invoke('router:list-pending-manual-apply', input),
};

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
  admin: adminApi,
  router: routerApi,
};

contextBridge.exposeInMainWorld('api', api);
