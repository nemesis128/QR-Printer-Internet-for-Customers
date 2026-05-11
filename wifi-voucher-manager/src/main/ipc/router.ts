// src/main/ipc/router.ts
import electron from 'electron';
import { z } from 'zod';

import type {
  PendingManualApplyDTO,
  RouterApplyResultDTO,
  RouterPingResultDTO,
  RouterTestResultDTO,
} from '../../shared/types.js';
import type { CredentialStorage } from '../security/CredentialStorage.js';
import type { AdminSession } from '../services/AdminSession.js';
import type { AppConfigStore } from '../services/AppConfigStore.js';
import type { RouterService } from '../services/RouterService.js';

const { ipcMain } = electron;

const PingSchema = z.object({ sessionToken: z.string().min(1), host: z.string().min(1) });
const SessionOnlySchema = z.object({ sessionToken: z.string().min(1) });
const MarkManualSchema = z.object({
  sessionToken: z.string().min(1),
  passwordId: z.number().int().positive(),
  confirmedPassword: z.string().min(1),
});

export interface RouterHandlerDeps {
  routerService: RouterService;
  session: AdminSession;
  config: AppConfigStore;
  credentials: CredentialStorage;
}

export interface RouterHandlers {
  pingRouter: (input: unknown) => Promise<RouterPingResultDTO>;
  testConnection: (input: unknown) => Promise<RouterTestResultDTO>;
  applyPasswordNow: (input: unknown) => Promise<RouterApplyResultDTO>;
  markAppliedManually: (input: unknown) => Promise<{ ok: boolean; message?: string }>;
  listPendingManualApply: (input: unknown) => Promise<PendingManualApplyDTO[]>;
}

const FAIL_PING: RouterPingResultDTO = { reachable: false, latencyMs: 0, errorMessage: 'Sesión inválida' };
const FAIL_TEST: RouterTestResultDTO = { ok: false, steps: [], errorMessage: 'Sesión inválida' };

export function createRouterHandlers(deps: RouterHandlerDeps): RouterHandlers {
  return {
    async pingRouter(raw) {
      const input = PingSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) return FAIL_PING;
      return deps.routerService.testReachability(input.host);
    },

    async testConnection(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return FAIL_TEST;
      const cfg = deps.config.getAll().router;
      const password = (await deps.credentials.get('router.password')) ?? '';
      const result = await deps.routerService.testConnection({
        host: cfg.host, user: cfg.user, password, model: cfg.model,
      });
      return result;
    },

    async applyPasswordNow(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) {
        return { ok: false, routerResponse: null, errorMessage: 'Sesión inválida' };
      }
      const cfg = deps.config.getAll().router;
      const password = (await deps.credentials.get('router.password')) ?? '';
      const pendings = await deps.routerService.listPendingManualApply();
      const target = pendings[0];
      if (!target) {
        return { ok: false, routerResponse: null, errorMessage: 'No hay password activa para aplicar' };
      }
      return deps.routerService.applyPasswordNow(
        { host: cfg.host, user: cfg.user, password, model: cfg.model },
        target.id,
        target.password
      );
    },

    async markAppliedManually(raw) {
      const input = MarkManualSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      try {
        await deps.routerService.markAppliedManually(input.passwordId, input.confirmedPassword);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Error desconocido' };
      }
    },

    async listPendingManualApply(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return [];
      return deps.routerService.listPendingManualApply();
    },
  };
}

export function registerRouterHandlers(deps: RouterHandlerDeps): void {
  const h = createRouterHandlers(deps);
  ipcMain.handle('router:ping', (_e, r) => h.pingRouter(r));
  ipcMain.handle('router:test-connection', (_e, r) => h.testConnection(r));
  ipcMain.handle('router:apply-password-now', (_e, r) => h.applyPasswordNow(r));
  ipcMain.handle('router:mark-applied-manually', (_e, r) => h.markAppliedManually(r));
  ipcMain.handle('router:list-pending-manual-apply', (_e, r) => h.listPendingManualApply(r));
}

export function unregisterRouterHandlers(): void {
  ipcMain.removeHandler('router:ping');
  ipcMain.removeHandler('router:test-connection');
  ipcMain.removeHandler('router:apply-password-now');
  ipcMain.removeHandler('router:mark-applied-manually');
  ipcMain.removeHandler('router:list-pending-manual-apply');
}
