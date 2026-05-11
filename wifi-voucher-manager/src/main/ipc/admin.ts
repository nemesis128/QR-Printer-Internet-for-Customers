import electron from 'electron';
import { z } from 'zod';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { AdminSession } from '../services/AdminSession.js';
import type {
  AppConfig,
  AppConfigStore,
  BusinessConfig,
  RouterConfig,
  ScheduleConfig,
} from '../services/AppConfigStore.js';
import type { LockoutTracker } from '../services/LockoutTracker.js';
import { PinCrypto } from '../services/PinCrypto.js';
import type { StatsService } from '../services/StatsService.js';

const { ipcMain } = electron;

const PinSchema = z.object({ pin: z.string().min(1).max(8) });
const ChangePinSchema = z.object({
  sessionToken: z.string().min(1),
  currentPin: z.string().min(1).max(8),
  newPin: z.string().min(1).max(8),
});
const BusinessSchema = z.object({
  name: z.string().min(1).max(80),
  footerMessage: z.string().max(120),
  logoPath: z.string().nullable(),
});
const ScheduleSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  timezone: z.string().min(1),
});
const RouterSchema = z.object({
  host: z.string(),
  user: z.string(),
  model: z.string(),
  ssidGuest: z.string(),
});
const UpdateConfigSchema = z.object({
  sessionToken: z.string().min(1),
  section: z.enum(['business', 'schedule', 'router']),
  value: z.unknown(),
});
const SessionOnlySchema = z.object({ sessionToken: z.string().min(1) });
const ListLogsSchema = z.object({
  sessionToken: z.string().min(1),
  eventType: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export type ValidatePinResult =
  | { ok: true; sessionToken: string; pinIsDefault: boolean }
  | { ok: false; code: 'INVALID_PIN' | 'LOCKED'; remainingMs?: number };

export type ChangePinResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_CURRENT' | 'INVALID_NEW_PIN' | 'INVALID_SESSION'; message?: string };

export type UpdateConfigResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_SESSION' | 'INVALID_VALUE'; message?: string };

export interface AdminHandlerDeps {
  config: AppConfigStore;
  audit: AuditLogRepository;
  stats: StatsService;
  session: AdminSession;
  lockout: LockoutTracker;
}

export interface AdminHandlers {
  validatePin: (input: { pin: string }) => Promise<ValidatePinResult>;
  changePin: (input: {
    sessionToken: string;
    currentPin: string;
    newPin: string;
  }) => Promise<ChangePinResult>;
  getConfig: (input: { sessionToken: string }) => Promise<AppConfig | null>;
  updateConfig: (input: {
    sessionToken: string;
    section: 'business' | 'schedule' | 'router';
    value: unknown;
  }) => Promise<UpdateConfigResult>;
  getStats: (input: { sessionToken: string }) => Promise<unknown>;
  listLogs: (input: { sessionToken: string; eventType?: string; limit?: number }) => Promise<unknown>;
  rotatePasswordNow: (input: { sessionToken: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function createAdminHandlers(deps: AdminHandlerDeps): AdminHandlers {
  return {
    async validatePin(raw) {
      const { pin } = PinSchema.parse(raw);
      if (deps.lockout.isLocked()) {
        return { ok: false, code: 'LOCKED', remainingMs: deps.lockout.remainingMs() };
      }
      const cfg = deps.config.getAll();
      const ok = await PinCrypto.verifyPin(pin, cfg.admin.pinHash);
      if (!ok) {
        deps.lockout.recordFailure();
        await deps.audit.insert({ event_type: 'admin_login', payload: { success: false } });
        return { ok: false, code: 'INVALID_PIN' };
      }
      deps.lockout.reset();
      const token = deps.session.issue();
      await deps.audit.insert({ event_type: 'admin_login', payload: { success: true } });
      return { ok: true, sessionToken: token, pinIsDefault: cfg.admin.pinIsDefault };
    },

    async changePin(raw) {
      const input = ChangePinSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, code: 'INVALID_SESSION' };
      }
      const cfg = deps.config.getAll();
      if (!(await PinCrypto.verifyPin(input.currentPin, cfg.admin.pinHash))) {
        return { ok: false, code: 'INVALID_CURRENT' };
      }
      const validation = PinCrypto.isAcceptablePin(input.newPin);
      if (!validation.ok) {
        const msg = validation.message;
        return msg !== undefined
          ? { ok: false, code: 'INVALID_NEW_PIN', message: msg }
          : { ok: false, code: 'INVALID_NEW_PIN' };
      }
      const newHash = await PinCrypto.hashPin(input.newPin);
      deps.config.updateAdmin({ pinHash: newHash, pinIsDefault: false });
      await deps.audit.insert({ event_type: 'admin_pin_change', payload: { success: true } });
      return { ok: true };
    },

    async getConfig(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return null;
      return deps.config.getAll();
    },

    async updateConfig(raw) {
      const input = UpdateConfigSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, code: 'INVALID_SESSION' };
      }
      try {
        if (input.section === 'business') {
          deps.config.updateBusiness(BusinessSchema.parse(input.value) as BusinessConfig);
        } else if (input.section === 'schedule') {
          deps.config.updateSchedule(ScheduleSchema.parse(input.value) as ScheduleConfig);
        } else {
          deps.config.updateRouter(RouterSchema.parse(input.value) as RouterConfig);
        }
        await deps.audit.insert({
          event_type: 'config_change',
          payload: { section: input.section },
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          code: 'INVALID_VALUE',
          message: err instanceof Error ? err.message : 'Valor inválido',
        };
      }
    },

    async getStats(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return null;
      return {
        summary: await deps.stats.getSummary(),
        daily: await deps.stats.getDailyPrints(14),
      };
    },

    async listLogs(raw) {
      const input = ListLogsSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) return [];
      return deps.audit.list({
        limit: input.limit ?? 200,
        ...(input.eventType ? { eventType: input.eventType as never } : {}),
      });
    },

    async rotatePasswordNow(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      // Stub Fase 3: solo registra el intento; rotación real llega en Fase 5.
      await deps.audit.insert({
        event_type: 'password_rotation',
        payload: { success: false, reason: 'scheduler-not-yet-implemented', triggered_by: 'admin' },
      });
      return { ok: false, message: 'Rotación automática pendiente de Fase 5' };
    },
  };
}

export function registerAdminHandlers(deps: AdminHandlerDeps): void {
  const h = createAdminHandlers(deps);
  ipcMain.handle('admin:validate-pin', (_e, r) => h.validatePin(r));
  ipcMain.handle('admin:change-pin', (_e, r) => h.changePin(r));
  ipcMain.handle('admin:get-config', (_e, r) => h.getConfig(r));
  ipcMain.handle('admin:update-config', (_e, r) => h.updateConfig(r));
  ipcMain.handle('admin:get-stats', (_e, r) => h.getStats(r));
  ipcMain.handle('admin:list-logs', (_e, r) => h.listLogs(r));
  ipcMain.handle('admin:rotate-password-now', (_e, r) => h.rotatePasswordNow(r));
}

export function unregisterAdminHandlers(): void {
  ipcMain.removeHandler('admin:validate-pin');
  ipcMain.removeHandler('admin:change-pin');
  ipcMain.removeHandler('admin:get-config');
  ipcMain.removeHandler('admin:update-config');
  ipcMain.removeHandler('admin:get-stats');
  ipcMain.removeHandler('admin:list-logs');
  ipcMain.removeHandler('admin:rotate-password-now');
}
