export type RouterStep = 'reach' | 'login' | 'read-ssid' | 'set-password' | 'set-enabled' | 'logout';

export interface RouterPingResult {
  reachable: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface RouterLoginResult {
  success: boolean;
  variant?: string;
  errorMessage?: string;
}

export interface RouterTestResult {
  ok: boolean;
  steps: Array<{ step: RouterStep; ok: boolean; latencyMs: number; detail?: string }>;
  ssidGuest?: string;
  errorMessage?: string;
}

export interface RouterApplyResult {
  ok: boolean;
  routerResponse: string | null;
  errorMessage?: string;
  failedAt?: RouterStep;
}

export interface RouterCredentials {
  host: string;
  user: string;
  password: string;
  model: string;
}

export interface IRouterAdapter {
  ping(host: string): Promise<RouterPingResult>;
  login(credentials: RouterCredentials): Promise<RouterLoginResult>;
  logout(): Promise<void>;
  getGuestSsid(): Promise<string>;
  setGuestPassword(newPassword: string): Promise<void>;
  setGuestEnabled(enabled: boolean): Promise<void>;
  dispose(): Promise<void>;
}

export class UnsupportedVariantError extends Error {
  constructor(public readonly detectedVariant: string) {
    super(`Router variant no soportada en Fase 4: ${detectedVariant}`);
    this.name = 'UnsupportedVariantError';
  }
}

export class RouterAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouterAuthError';
  }
}

export class RouterTimeoutError extends Error {
  constructor(public readonly step: RouterStep, public readonly timeoutMs: number) {
    super(`Timeout en paso '${step}' tras ${timeoutMs}ms`);
    this.name = 'RouterTimeoutError';
  }
}
