import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { HealthCheckService } from '../../src/main/services/HealthCheckService.js';
import { AppConfigStore } from '../../src/main/services/AppConfigStore.js';

class MemBackend {
  data: Record<string, unknown> = {};
  get<T>(k: string, f: T): T { return (this.data[k] as T) ?? f; }
  set(k: string, v: unknown): void { this.data[k] = v; }
}

async function buildCtx(routerMode: 'success' | 'always-fail' = 'success') {
  const db = createConnection({ filename: ':memory:' });
  await runMigrations(db);
  const audit = new AuditLogRepository(db);
  const passwords = new PasswordRepository(db);
  const adapter = new MockRouterAdapter({ mode: routerMode, ssidGuest: 'X' });
  const routerService = new RouterService({ adapter, audit, passwords });
  const config = new AppConfigStore(new MemBackend());
  const svc = new HealthCheckService({
    db, audit, passwords, routerService, config,
    routerHost: '192.168.1.1',
    userDataPath: '/tmp/wifi-voucher-test',
    dbFilePath: '/tmp/wifi-voucher-test/data.db',
  });
  return { db, audit, passwords, svc, config };
}

describe('HealthCheckService.runProbes', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  afterEach(async () => { await ctx?.db.destroy(); });

  it('ejecuta 6 probes y devuelve estructura completa', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.svc.runProbes();
    expect(Object.keys(r.probes)).toEqual([
      'db_integrity',
      'disk_free',
      'log_size',
      'last_rotation_recent',
      'printer_reach',
      'router_reach',
    ]);
  });

  it('db_integrity pasa cuando la DB está sana', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.svc.runProbes();
    expect(r.probes.db_integrity.ok).toBe(true);
  });

  it('last_rotation_recent es false cuando no hay rotaciones', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.svc.runProbes();
    expect(r.probes.last_rotation_recent.ok).toBe(false);
  });

  it('last_rotation_recent es true cuando hay rotación reciente <24h', async () => {
    ctx = await buildCtx('success');
    await ctx.audit.insert({
      event_type: 'password_rotation',
      payload: { success: true },
    });
    const r = await ctx.svc.runProbes();
    expect(r.probes.last_rotation_recent.ok).toBe(true);
  });

  it('router_reach delega a routerService.testReachability', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.svc.runProbes();
    expect(r.probes.router_reach.ok).toBe(true);
  });

  it('allPassed=false si cualquier probe falla', async () => {
    ctx = await buildCtx('always-fail');
    const r = await ctx.svc.runProbes();
    expect(r.allPassed).toBe(false);
  });
});

describe('HealthCheckService.runAndPersist', () => {
  it('persiste el resultado en audit_log y en AppConfigStore.system', async () => {
    const db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const audit = new AuditLogRepository(db);
    const passwords = new PasswordRepository(db);
    const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X' });
    const routerService = new RouterService({ adapter, audit, passwords });
    const config = new AppConfigStore(new MemBackend());
    const svc = new HealthCheckService({
      db, audit, passwords, routerService, config,
      routerHost: '192.168.1.1',
      userDataPath: '/tmp/wifi-voucher-test',
      dbFilePath: '/tmp/wifi-voucher-test/data.db',
    });

    await svc.runAndPersist();
    const logs = await audit.list({ eventType: 'health_check', limit: 5 });
    expect(logs).toHaveLength(1);
    expect(config.getAll().system.lastHealthCheckAt).not.toBeNull();
    await db.destroy();
  });
});
