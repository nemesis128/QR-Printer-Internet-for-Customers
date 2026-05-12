import { copyFile } from 'node:fs/promises';
import path from 'node:path';

import electron from 'electron';
import { z } from 'zod';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { CredentialStorage } from '../security/CredentialStorage.js';
import type { AdminSession } from '../services/AdminSession.js';
import type { AppConfig, AppConfigStore } from '../services/AppConfigStore.js';
import type { LockoutTracker } from '../services/LockoutTracker.js';
import { PinCrypto } from '../services/PinCrypto.js';
import type { RotationOrchestrator } from '../services/RotationOrchestrator.js';
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
const UploadLogoSchema = z.object({
  sessionToken: z.string().min(1),
  sourcePath: z.string().min(1).max(1024),
});
const EventTypeSchema = z.enum([
  'password_rotation',
  'print',
  'config_change',
  'error',
  'health_check',
  'admin_login',
  'admin_pin_change',
]);
const ListLogsSchema = z.object({
  sessionToken: z.string().min(1),
  eventType: EventTypeSchema.optional(),
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
  credentials: CredentialStorage;
  orchestrator: RotationOrchestrator;
  userDataPath: string;
  onPinChanged?: () => void;
}

export interface AdminHandlers {
  validatePin: (input: unknown) => Promise<ValidatePinResult>;
  changePin: (input: unknown) => Promise<ChangePinResult>;
  getConfig: (input: unknown) => Promise<AppConfig | null>;
  updateConfig: (input: unknown) => Promise<UpdateConfigResult>;
  getStats: (input: unknown) => Promise<unknown>;
  listLogs: (input: unknown) => Promise<unknown>;
  rotatePasswordNow: (input: unknown) => Promise<{ ok: boolean; message?: string }>;
  setRouterPassword: (input: unknown) => Promise<{ ok: boolean; message?: string }>;
  uploadLogo: (input: unknown) => Promise<{ ok: boolean; logoPath?: string; message?: string }>;
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
      deps.onPinChanged?.();
      return { ok: true };
    },

    getConfig(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return Promise.resolve(null);
      return Promise.resolve(deps.config.getAll());
    },

    async updateConfig(raw) {
      const input = UpdateConfigSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, code: 'INVALID_SESSION' };
      }
      try {
        if (input.section === 'business') {
          deps.config.updateBusiness(BusinessSchema.parse(input.value));
        } else if (input.section === 'schedule') {
          deps.config.updateSchedule(ScheduleSchema.parse(input.value));
        } else {
          deps.config.updateRouter(RouterSchema.parse(input.value));
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
        ...(input.eventType ? { eventType: input.eventType } : {}),
      });
    },

    async rotatePasswordNow(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      const result = await deps.orchestrator.runOnce('admin');
      if (result.ok) {
        return { ok: true, message: 'Contraseña rotada y aplicada.' };
      }
      return { ok: false, message: result.errorMessage ?? 'Falló — pendiente de aplicación manual' };
    },

    async setRouterPassword(raw) {
      const Schema = z.object({ sessionToken: z.string().min(1), password: z.string().min(1).max(128) });
      const input = Schema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      await deps.credentials.set('router.password', input.password);
      await deps.audit.insert({ event_type: 'config_change', payload: { section: 'router-password' } });
      return { ok: true };
    },

    async uploadLogo(raw) {
      const input = UploadLogoSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      const ext = path.extname(input.sourcePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
        return { ok: false, message: 'Formato no soportado (usa PNG, JPG o JPEG)' };
      }
      const dest = path.join(deps.userDataPath, `logo${ext}`);
      try {
        await copyFile(input.sourcePath, dest);
        const current = deps.config.getAll().business;
        deps.config.updateBusiness({ ...current, logoPath: dest });
        await deps.audit.insert({
          event_type: 'config_change',
          payload: { section: 'business.logo', dest },
        });
        return { ok: true, logoPath: dest };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Error copiando archivo' };
      }
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
  ipcMain.handle('admin:set-router-password', (_e, r) => h.setRouterPassword(r));
  ipcMain.handle('admin:upload-logo', (_e, r) => h.uploadLogo(r));
}

export function unregisterAdminHandlers(): void {
  ipcMain.removeHandler('admin:validate-pin');
  ipcMain.removeHandler('admin:change-pin');
  ipcMain.removeHandler('admin:get-config');
  ipcMain.removeHandler('admin:update-config');
  ipcMain.removeHandler('admin:get-stats');
  ipcMain.removeHandler('admin:list-logs');
  ipcMain.removeHandler('admin:rotate-password-now');
  ipcMain.removeHandler('admin:set-router-password');
  ipcMain.removeHandler('admin:upload-logo');
}
