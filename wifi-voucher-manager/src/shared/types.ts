export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
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
  // admin / router / stats land in later phases
}
