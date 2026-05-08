export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
}

export interface PrintVoucherPreviewResult {
  ok: true;
  ssid: string;
  password: string;
  payload: string;
  dataUrl: string;
}

export interface PrintVoucherPreviewError {
  ok: false;
  code: 'NO_ACTIVE_PASSWORD' | 'NO_SSID_CONFIGURED' | 'GENERATE_FAILED';
  message: string;
}

export type PrintVoucherResult = PrintVoucherPreviewResult | PrintVoucherPreviewError;

export interface WaiterAPI {
  getCurrentSSID: () => Promise<string>;
  getSystemHealth: () => Promise<SystemHealth>;
  printVoucher: () => Promise<PrintVoucherResult>;
}

export interface IpcAPI {
  waiter: WaiterAPI;
  // admin / printer / router / stats land in later phases
}
