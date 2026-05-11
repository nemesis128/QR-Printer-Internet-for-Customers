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
    credentials: RouterCredentials,
    passwordId: number,
    newPassword: string
  ): Promise<RouterApplyResult> {
    const steps: StepLog[] = [];
    let failedAt: RouterStep | undefined;
    try {
      const login = await this.deps.adapter.login(credentials);
      steps.push({ step: 'login', ok: login.success, latencyMs: 0 });
      if (!login.success) {
        failedAt = 'login';
        throw new Error(login.errorMessage ?? 'login failed');
      }
      await this.deps.adapter.setGuestPassword(newPassword);
      steps.push({ step: 'set-password', ok: true, latencyMs: 0 });
      await this.deps.adapter.logout();
      steps.push({ step: 'logout', ok: true, latencyMs: 0 });

      await this.deps.passwords.markAppliedAutomatically(passwordId, JSON.stringify(steps));
      await this.deps.audit.insert({
        event_type: 'password_rotation',
        payload: { success: true, passwordId, triggered_by: 'router-service' },
      });
      return { ok: true, routerResponse: JSON.stringify(steps) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      if (!failedAt) {
        const lastStep = steps[steps.length - 1];
        failedAt = lastStep && lastStep.ok ? 'set-password' : (lastStep?.step ?? 'set-password');
      }
      await this.deps.passwords.markPendingManualApply(passwordId);
      await this.deps.audit.insert({
        event_type: 'password_rotation',
        payload: { success: false, passwordId, failedAt, error: message, triggered_by: 'router-service' },
      });
      return { ok: false, routerResponse: null, errorMessage: message, failedAt };
    }
  }
}
