export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
  lastHealthCheckFailed: boolean;
}

export interface PrintVoucherJobResult {
  ok: true;
  jobId: string;
}

export interface PrintVoucherError {
  ok: false;
  code: 'NO_ACTIVE_PASSWORD' | 'NO_ACTIVE_PRINTER' | 'ENQUEUE_FAILED';
  message: string;
}

export type PrintVoucherResult = PrintVoucherJobResult | PrintVoucherError;

export type PrinterConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

export interface DiscoveredPrinter {
  identifier: string;
  label: string;
  connection: PrinterConnection;
  likelyEscPosCompatible: boolean;
  suggestedType?: 'epson' | 'star' | 'aomus' | 'tanca' | 'daruma' | 'brother';
}

export interface PrinterTestResult {
  success: boolean;
  online: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface PrinterRecord {
  id: string;
  name: string;
  connection: PrinterConnection;
  identifier: string;
  width_chars: 32 | 48;
  active: boolean;
  notes: string | null;
}

export type JobStatus = 'pending' | 'printed' | 'failed';

export interface JobStatusSnapshot {
  status: JobStatus;
  lastError: string | null;
}

export interface RecentJobSummary {
  id: string;
  status: JobStatus;
  createdAt: string;
  lastError: string | null;
}

export interface WaiterAPI {
  getCurrentSSID: () => Promise<string>;
  getSystemHealth: () => Promise<SystemHealth>;
  printVoucher: () => Promise<PrintVoucherResult>;
  listPendingManualApply: () => Promise<PendingManualApplyDTO[]>;
}

export interface PrinterAPI {
  discover: () => Promise<DiscoveredPrinter[]>;
  testConnection: (input: {
    connection: PrinterConnection;
    identifier: string;
    width_chars: 32 | 48;
  }) => Promise<PrinterTestResult>;
  list: () => Promise<PrinterRecord[]>;
  setActive: (id: string) => Promise<void>;
  getJobStatus: (jobId: string) => Promise<JobStatusSnapshot | null>;
  retryJob: (jobId: string) => Promise<void>;
  listRecentJobs: (limit?: number) => Promise<RecentJobSummary[]>;
}

export interface IpcAPI {
  waiter: WaiterAPI;
  printer: PrinterAPI;
  admin: AdminAPI;
  router: RouterAPI;
}

// ─── Admin (Fase 3) ─────────────────────────────────────────────────────────

export interface BusinessConfigDTO {
  name: string;
  footerMessage: string;
  logoPath: string | null;
}

export interface ScheduleConfigDTO {
  hour: number;
  minute: number;
  timezone: string;
}

export interface RouterConfigDTO {
  host: string;
  user: string;
  model: string;
  ssidGuest: string;
}

export interface AdminConfigDTO {
  pinIsDefault: boolean;
}

export interface AppConfigDTO {
  business: BusinessConfigDTO;
  schedule: ScheduleConfigDTO;
  router: RouterConfigDTO;
  admin: AdminConfigDTO;
}

export type ValidatePinResultDTO =
  | { ok: true; sessionToken: string; pinIsDefault: boolean }
  | { ok: false; code: 'INVALID_PIN' | 'LOCKED'; remainingMs?: number };

export type ChangePinResultDTO =
  | { ok: true }
  | { ok: false; code: 'INVALID_CURRENT' | 'INVALID_NEW_PIN' | 'INVALID_SESSION'; message?: string };

export type UpdateConfigResultDTO =
  | { ok: true }
  | { ok: false; code: 'INVALID_SESSION' | 'INVALID_VALUE'; message?: string };

export interface StatsSummaryDTO {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  totalRotations: number;
  successfulRotations: number;
}

export interface DailyPrintPointDTO {
  date: string;
  count: number;
}

export interface StatsBundleDTO {
  summary: StatsSummaryDTO;
  daily: DailyPrintPointDTO[];
}

export interface AuditLogEntryDTO {
  id: number;
  event_type: string;
  payload: string | null;
  created_at: string;
}

export interface AdminAPI {
  validatePin: (input: { pin: string }) => Promise<ValidatePinResultDTO>;
  changePin: (input: {
    sessionToken: string;
    currentPin: string;
    newPin: string;
  }) => Promise<ChangePinResultDTO>;
  getConfig: (input: { sessionToken: string }) => Promise<AppConfigDTO | null>;
  updateConfig: (input: {
    sessionToken: string;
    section: 'business' | 'schedule' | 'router';
    value: BusinessConfigDTO | ScheduleConfigDTO | RouterConfigDTO;
  }) => Promise<UpdateConfigResultDTO>;
  getStats: (input: { sessionToken: string }) => Promise<StatsBundleDTO | null>;
  listLogs: (input: {
    sessionToken: string;
    eventType?: string;
    limit?: number;
  }) => Promise<AuditLogEntryDTO[]>;
  rotatePasswordNow: (input: { sessionToken: string }) => Promise<{ ok: boolean; message?: string }>;
  setRouterPassword: (input: { sessionToken: string; password: string }) => Promise<{ ok: boolean; message?: string }>;
  uploadLogo: (input: {
    sessionToken: string;
    sourcePath: string;
  }) => Promise<{ ok: boolean; logoPath?: string; message?: string }>;
}

// ─── Router (Fase 4) ────────────────────────────────────────────────────────

export type RouterStepDTO = 'reach' | 'login' | 'read-ssid' | 'set-password' | 'set-enabled' | 'logout';

export interface RouterPingResultDTO {
  reachable: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface RouterStepResultDTO {
  step: RouterStepDTO;
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export interface RouterTestResultDTO {
  ok: boolean;
  steps: RouterStepResultDTO[];
  ssidGuest?: string;
  errorMessage?: string;
}

export interface RouterApplyResultDTO {
  ok: boolean;
  routerResponse: string | null;
  errorMessage?: string;
  failedAt?: RouterStepDTO;
}

export interface PendingManualApplyDTO {
  id: number;
  password: string;
  ssid: string;
  created_at: string;
}

export interface RouterAPI {
  pingRouter: (input: { sessionToken: string; host: string }) => Promise<RouterPingResultDTO>;
  testConnection: (input: { sessionToken: string }) => Promise<RouterTestResultDTO>;
  applyPasswordNow: (input: { sessionToken: string }) => Promise<RouterApplyResultDTO>;
  markAppliedManually: (input: {
    sessionToken: string;
    passwordId: number;
    confirmedPassword: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  listPendingManualApply: (input: { sessionToken: string }) => Promise<PendingManualApplyDTO[]>;
}
