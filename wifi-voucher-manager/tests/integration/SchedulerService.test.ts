import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { RotationOrchestrator } from '../../src/main/services/RotationOrchestrator.js';
import { AppConfigStore } from '../../src/main/services/AppConfigStore.js';
import { HealthCheckService } from '../../src/main/services/HealthCheckService.js';
import { SchedulerService } from '../../src/main/services/SchedulerService.js';

const scheduleMock = vi.hoisted(() => vi.fn());
const cronTaskStartMock = vi.hoisted(() => vi.fn());
const cronTaskStopMock = vi.hoisted(() => vi.fn());

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock.mockImplementation(() => ({
      start: cronTaskStartMock,
      stop: cronTaskStopMock,
    })),
  },
}));

class MemBackend {
  data: Record<string, unknown> = {};
  get<T>(k: string, f: T): T { return (this.data[k] as T) ?? f; }
  set(k: string, v: unknown): void { this.data[k] = v; }
}

async function buildCtx() {
  const db = createConnection({ filename: ':memory:' });
  await runMigrations(db);
  const audit = new AuditLogRepository(db);
  const passwords = new PasswordRepository(db);
  const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X' });
  const routerService = new RouterService({ adapter, audit, passwords });
  const orchestrator = new RotationOrchestrator({
    routerService, passwords, audit,
    routerCredentials: { host: 'h', user: 'u', password: 'p', model: 'm' },
    ssidGuest: 'X',
  });
  const config = new AppConfigStore(new MemBackend());
  const healthCheck = new HealthCheckService({
    db, audit, passwords, routerService, config,
    routerHost: 'h', userDataPath: '/tmp', dbFilePath: '/tmp/db',
  });
  const scheduler = new SchedulerService({
    orchestrator, healthCheck, passwords, config, db,
    backoffDelaysMs: [1, 1, 1],
  });
  return { db, scheduler, config };
}

describe('SchedulerService.scheduleRotation', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => {
    scheduleMock.mockClear();
    cronTaskStartMock.mockClear();
    ctx = await buildCtx();
  });
  afterEach(async () => { await ctx.db.destroy(); });

  it('registra un cron con la hora/minuto configurados', () => {
    ctx.config.updateSchedule({ hour: 23, minute: 0, timezone: 'America/Mexico_City' });
    ctx.scheduler.scheduleRotation();
    expect(scheduleMock).toHaveBeenCalledWith(
      '0 23 * * *',
      expect.any(Function),
      { timezone: 'America/Mexico_City' }
    );
  });

  it('registra cron diferente cuando se cambia la hora', () => {
    ctx.config.updateSchedule({ hour: 4, minute: 30, timezone: 'America/Mexico_City' });
    ctx.scheduler.scheduleRotation();
    expect(scheduleMock).toHaveBeenCalledWith(
      '30 4 * * *',
      expect.any(Function),
      { timezone: 'America/Mexico_City' }
    );
  });
});

describe('SchedulerService.runStartupRecovery', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx(); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('ejecuta rotación si no hay password activa', async () => {
    const r = await ctx.scheduler.runStartupRecovery();
    expect(r.executed).toBe(true);
    expect(r.reason).toBe('no-active-password');
  });

  it('NO ejecuta si la password activa es reciente (<24h)', async () => {
    const passwords = ctx.scheduler['deps'].passwords;
    await passwords.insert({
      password: 'PWFRESHX1', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    const r = await ctx.scheduler.runStartupRecovery();
    expect(r.executed).toBe(false);
    expect(r.reason).toBe('password-fresh');
  });

  it('ejecuta si la password activa tiene > 24h', async () => {
    const passwords = ctx.scheduler['deps'].passwords;
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const [id] = await ctx.scheduler['deps'].db('passwords').insert({
      password: 'PWOLDXXX1', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
      created_at: oldDate,
    });
    expect(id).toBeGreaterThan(0);
    const r = await ctx.scheduler.runStartupRecovery();
    expect(r.executed).toBe(true);
    expect(r.reason).toBe('password-stale');
    expect(passwords).toBeDefined();
  });
});

describe('SchedulerService — cleanup + startAll', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => {
    scheduleMock.mockClear();
    ctx = await buildCtx();
  });
  afterEach(async () => { await ctx.db.destroy(); });

  it('cleanupOldPrintJobs borra rows status=printed > 90 días', async () => {
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    // Insert a printer first (required by FK)
    await ctx.db('printer').insert({ id: 'p1', name: 'Test', connection: 'usb', identifier: '/dev/usb0', width_chars: 48, active: 1 });
    await ctx.db('print_job').insert([
      { id: 'old-1', printer_id: 'p1', payload_data: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'printed', created_at: old },
      { id: 'old-2', printer_id: 'p1', payload_data: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'pending', created_at: old },
      { id: 'recent', printer_id: 'p1', payload_data: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'printed', created_at: recent },
    ]);
    const deleted = await (ctx.scheduler as unknown as { cleanupOldPrintJobs(): Promise<number> }).cleanupOldPrintJobs();
    expect(deleted).toBe(1);
    const remaining = await ctx.db('print_job').count<{ c: number }[]>('* as c').first();
    expect(Number(remaining?.c ?? 0)).toBe(2);
  });

  it('startAll registra los 3 crons', () => {
    ctx.scheduler.startAll();
    expect(scheduleMock).toHaveBeenCalledTimes(3);
  });

  it('stop() detiene todos los tasks', () => {
    ctx.scheduler.startAll();
    ctx.scheduler.stop();
    expect(cronTaskStopMock).toHaveBeenCalled();
  });
});
