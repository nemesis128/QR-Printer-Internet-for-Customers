import { statSync } from 'node:fs';

import type { Knex } from 'knex';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';

import type { AppConfigStore } from './AppConfigStore.js';
import type { RouterService } from './RouterService.js';

export interface HealthCheckDeps {
  db: Knex;
  audit: AuditLogRepository;
  passwords: PasswordRepository;
  routerService: RouterService;
  config: AppConfigStore;
  routerHost: string;
  userDataPath: string;
  dbFilePath: string;
}

export interface ProbeResult {
  ok: boolean;
  detail?: string;
}

export interface HealthReport {
  allPassed: boolean;
  probes: {
    db_integrity: ProbeResult;
    disk_free: ProbeResult;
    log_size: ProbeResult;
    last_rotation_recent: ProbeResult;
    printer_reach: ProbeResult;
    router_reach: ProbeResult;
  };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class HealthCheckService {
  constructor(private readonly deps: HealthCheckDeps) {}

  async runProbes(): Promise<HealthReport> {
    const db_integrity = await this.probeDbIntegrity();
    const disk_free = this.probeDiskFree();
    const log_size = this.probeLogSize();
    const last_rotation_recent = await this.probeLastRotationRecent();
    const printer_reach = await this.probePrinterReach();
    const router_reach = await this.probeRouterReach();

    const probes = { db_integrity, disk_free, log_size, last_rotation_recent, printer_reach, router_reach };
    const allPassed = Object.values(probes).every((p) => p.ok);
    return { allPassed, probes };
  }

  async runAndPersist(): Promise<HealthReport> {
    const report = await this.runProbes();
    await this.deps.audit.insert({
      event_type: 'health_check',
      payload: report,
    });
    this.deps.config.updateSystem({
      lastHealthCheckFailed: !report.allPassed,
      lastHealthCheckAt: new Date().toISOString(),
    });
    return report;
  }

  private async probeDbIntegrity(): Promise<ProbeResult> {
    try {
      const result: unknown = await this.deps.db.raw('PRAGMA integrity_check');
      const first = Array.isArray(result) ? (result[0] as Record<string, unknown>) : null;
      const ok = first?.['integrity_check'] === 'ok';
      return ok ? { ok: true } : { ok: false, detail: `integrity_check returned ${JSON.stringify(first)}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
    }
  }

  private probeDiskFree(): ProbeResult {
    try {
      statSync(this.deps.userDataPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'userData not accessible' };
    }
  }

  private probeLogSize(): ProbeResult {
    try {
      const s = statSync(this.deps.dbFilePath);
      const mb = s.size / (1024 * 1024);
      return mb > 500
        ? { ok: false, detail: `data.db = ${mb.toFixed(1)} MB (>500 MB)` }
        : { ok: true, detail: `${mb.toFixed(1)} MB` };
    } catch {
      return { ok: false, detail: 'data.db not accessible' };
    }
  }

  private async probeLastRotationRecent(): Promise<ProbeResult> {
    const rows = await this.deps.audit.list({ eventType: 'password_rotation', limit: 1 });
    const last = rows[0];
    if (!last) return { ok: false, detail: 'no rotations recorded yet' };
    const age = Date.now() - new Date(last.created_at).getTime();
    return age <= ONE_DAY_MS
      ? { ok: true, detail: `last rotation ${Math.round(age / 1000)}s ago` }
      : { ok: false, detail: `last rotation ${Math.round(age / ONE_DAY_MS)} days ago` };
  }

  private async probePrinterReach(): Promise<ProbeResult> {
    const all: unknown = await this.deps.db('printer').where({ active: 1 }).first();
    return all ? { ok: true } : { ok: false, detail: 'no active printer configured' };
  }

  private async probeRouterReach(): Promise<ProbeResult> {
    const r = await this.deps.routerService.testReachability(this.deps.routerHost);
    return r.reachable
      ? { ok: true, detail: `${r.latencyMs}ms` }
      : { ok: false, detail: r.errorMessage ?? 'unreachable' };
  }
}
