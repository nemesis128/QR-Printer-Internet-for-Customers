import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type {
  IRouterAdapter,
  RouterApplyResult,
  RouterCredentials,
  RouterPingResult,
  RouterStep,
  RouterTestResult,
} from '../adapters/routers/router-types.js';

export interface RouterServiceDeps {
  adapter: IRouterAdapter;
  audit: AuditLogRepository;
  passwords: PasswordRepository;
}

interface StepLog {
  step: RouterStep;
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

export class RouterService {
  constructor(private readonly deps: RouterServiceDeps) {}

  testReachability(host: string): Promise<RouterPingResult> {
    return this.deps.adapter.ping(host);
  }

  async testConnection(credentials: RouterCredentials): Promise<RouterTestResult> {
    const steps: StepLog[] = [];
    let ssidGuest: string | undefined;
    try {
      const t0 = Date.now();
      const login = await this.deps.adapter.login(credentials);
      steps.push({ step: 'login', ok: login.success, latencyMs: Date.now() - t0, detail: login.errorMessage });
      if (!login.success) {
        return { ok: false, steps, errorMessage: login.errorMessage ?? 'Login falló' };
      }

      const t1 = Date.now();
      ssidGuest = await this.deps.adapter.getGuestSsid();
      steps.push({ step: 'read-ssid', ok: true, latencyMs: Date.now() - t1 });

      const t2 = Date.now();
      await this.deps.adapter.logout();
      steps.push({ step: 'logout', ok: true, latencyMs: Date.now() - t2 });

      return { ok: true, steps, ssidGuest };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return ssidGuest !== undefined
        ? { ok: false, steps, errorMessage: message, ssidGuest }
        : { ok: false, steps, errorMessage: message };
    }
  }

  async applyPasswordNow(
    _credentials: RouterCredentials,
    _passwordId: number,
    _newPassword: string
  ): Promise<RouterApplyResult> {
    return Promise.reject(new Error('not yet implemented'));
  }
}
