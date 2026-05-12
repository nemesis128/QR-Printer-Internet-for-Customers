import type { Knex } from 'knex';
import cron, { type ScheduledTask } from 'node-cron';

import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';

import type { AppConfigStore } from './AppConfigStore.js';
import type { HealthCheckService } from './HealthCheckService.js';
import type { RotationOrchestrator } from './RotationOrchestrator.js';

export interface SchedulerDeps {
  orchestrator: RotationOrchestrator;
  healthCheck: HealthCheckService;
  passwords: PasswordRepository;
  config: AppConfigStore;
  db: Knex;
  backoffDelaysMs?: number[];
}

const DEFAULT_BACKOFF_MS = [60_000, 300_000, 900_000];
const CLEANUP_THRESHOLD_DAYS = 90;

export class SchedulerService {
  private rotationTask: ScheduledTask | null = null;
  private healthCheckTask: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private readonly backoffDelaysMs: number[];

  constructor(private readonly deps: SchedulerDeps) {
    this.backoffDelaysMs = deps.backoffDelaysMs ?? DEFAULT_BACKOFF_MS;
  }

  scheduleRotation(): void {
    this.rotationTask?.stop();
    const { hour, minute, timezone } = this.deps.config.getAll().schedule;
    const expression = `${minute} ${hour} * * *`;
    this.rotationTask = cron.schedule(
      expression,
      () => {
        void this.deps.orchestrator.runWithBackoff('scheduler', this.backoffDelaysMs);
      },
      { timezone }
    );
    this.rotationTask.start();
  }

  scheduleHealthCheck(): void {
    this.healthCheckTask?.stop();
    const { timezone } = this.deps.config.getAll().schedule;
    this.healthCheckTask = cron.schedule(
      '0 3 * * *',
      () => {
        void this.deps.healthCheck.runAndPersist();
      },
      { timezone }
    );
    this.healthCheckTask.start();
  }

  scheduleCleanup(): void {
    this.cleanupTask?.stop();
    const { timezone } = this.deps.config.getAll().schedule;
    this.cleanupTask = cron.schedule(
      '0 4 1 * *',
      () => {
        void this.cleanupOldPrintJobs();
      },
      { timezone }
    );
    this.cleanupTask.start();
  }

  startAll(): void {
    this.scheduleRotation();
    this.scheduleHealthCheck();
    this.scheduleCleanup();
  }

  async runStartupRecovery(): Promise<{ executed: boolean; reason: 'no-active-password' | 'password-fresh' | 'password-stale' }> {
    const active = await this.deps.passwords.getActive();
    if (!active) {
      await this.deps.orchestrator.runWithBackoff('startup-recovery', this.backoffDelaysMs);
      return { executed: true, reason: 'no-active-password' };
    }
    const ageMs = Date.now() - new Date(active.created_at).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      await this.deps.orchestrator.runWithBackoff('startup-recovery', this.backoffDelaysMs);
      return { executed: true, reason: 'password-stale' };
    }
    return { executed: false, reason: 'password-fresh' };
  }

  private async cleanupOldPrintJobs(): Promise<number> {
    const cutoffDate = new Date(Date.now() - CLEANUP_THRESHOLD_DAYS * 86_400_000).toISOString();
    return this.deps.db('print_job')
      .where('created_at', '<', cutoffDate)
      .andWhere('status', 'printed')
      .delete();
  }

  stop(): void {
    this.rotationTask?.stop();
    this.healthCheckTask?.stop();
    this.cleanupTask?.stop();
    this.rotationTask = null;
    this.healthCheckTask = null;
    this.cleanupTask = null;
  }
}
