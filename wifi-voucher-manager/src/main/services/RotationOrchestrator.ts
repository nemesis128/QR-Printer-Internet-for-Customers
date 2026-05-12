import type { RouterCredentials } from '../adapters/routers/router-types.js';
import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';

import { PasswordService } from './PasswordService.js';
import type { RouterService } from './RouterService.js';

export interface RotationOrchestratorDeps {
  routerService: RouterService;
  passwords: PasswordRepository;
  audit: AuditLogRepository;
  routerCredentials: RouterCredentials;
  ssidGuest: string;
}

export interface RotationResult {
  ok: boolean;
  passwordId?: number;
  attempts: number;
  errorMessage?: string;
}

export type RotationTrigger = 'scheduler' | 'admin' | 'startup-recovery';

export class RotationOrchestrator {
  constructor(private readonly deps: RotationOrchestratorDeps) {}

  async runOnce(triggeredBy: RotationTrigger): Promise<RotationResult> {
    const newPassword = PasswordService.generate();
    const inserted = await this.deps.passwords.insert({
      password: newPassword,
      ssid: this.deps.ssidGuest,
      active: 0,
      rotated_by: triggeredBy === 'admin' ? 'manual' : 'auto',
      router_response: null,
    });

    const apply = await this.deps.routerService.applyPasswordNow(
      this.deps.routerCredentials,
      inserted.id,
      newPassword,
      triggeredBy
    );

    if (apply.ok) {
      await this.deps.passwords.setActive(inserted.id);
      return { ok: true, passwordId: inserted.id, attempts: 1 };
    }

    await this.deps.passwords.setActive(inserted.id);
    await this.deps.passwords.markPendingManualApply(inserted.id);
    return {
      ok: false,
      passwordId: inserted.id,
      attempts: 1,
      errorMessage: apply.errorMessage ?? 'Aplicación falló',
    };
  }

  async runWithBackoff(
    triggeredBy: RotationTrigger,
    delaysMs: number[]
  ): Promise<RotationResult> {
    const maxAttempts = delaysMs.length;
    let lastResult: RotationResult = { ok: false, attempts: 0 };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResult = await this.runOnce(triggeredBy);
      lastResult = { ...lastResult, attempts: attempt };
      if (lastResult.ok) return lastResult;
      if (attempt < maxAttempts) {
        const delay = delaysMs[attempt - 1] ?? 0;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return lastResult;
  }
}
