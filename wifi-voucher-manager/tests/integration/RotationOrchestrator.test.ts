import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { RotationOrchestrator } from '../../src/main/services/RotationOrchestrator.js';

const routerCredentials = { host: '192.168.1.1', user: 'admin', password: 'pw', model: 'C24' };
const ssidGuest = 'TestGuest';

async function buildCtx(mode: 'success' | 'always-fail' | 'fail-on-step' = 'success') {
  const db = createConnection({ filename: ':memory:' });
  await runMigrations(db);
  const audit = new AuditLogRepository(db);
  const passwords = new PasswordRepository(db);
  const adapter = new MockRouterAdapter({ mode, ssidGuest, failStep: 'set-password' });
  const routerService = new RouterService({ adapter, audit, passwords });
  const orch = new RotationOrchestrator({
    routerService,
    passwords,
    audit,
    routerCredentials,
    ssidGuest,
  });
  return { db, audit, passwords, orch };
}

describe('RotationOrchestrator.runOnce — success', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx('success'); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('genera nueva password, la inserta, la aplica y la marca active=1', async () => {
    const r = await ctx.orch.runOnce('scheduler');
    expect(r.ok).toBe(true);
    const active = await ctx.passwords.getActive();
    expect(active?.applied).toBe(1);
    expect(active?.applied_method).toBe('auto');
  });

  it('audita éxito con triggered_by', async () => {
    await ctx.orch.runOnce('scheduler');
    const logs = await ctx.audit.list({ eventType: 'password_rotation', limit: 5 });
    expect(logs).toHaveLength(1);
    const payload = JSON.parse(logs[0]!.payload ?? '{}');
    expect(payload.success).toBe(true);
    expect(payload.triggered_by).toBe('scheduler');
  });
});

describe('RotationOrchestrator.runOnce — failure', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx('always-fail'); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('marca la password como manual_pending y NO la activa', async () => {
    const r = await ctx.orch.runOnce('scheduler');
    expect(r.ok).toBe(false);
    const active = await ctx.passwords.getActive();
    expect(active?.applied).toBe(0);
    expect(active?.applied_method).toBe('manual_pending');
  });
});

describe('RotationOrchestrator.runWithBackoff — success en primer intento', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx('success'); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('retorna ok=true con attempts=1 cuando el primer intento funciona', async () => {
    const r = await ctx.orch.runWithBackoff('scheduler', [10, 20, 30]);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });
});

describe('RotationOrchestrator.runWithBackoff — fallan 3 → manual_pending', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx('always-fail'); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('intenta exactamente 3 veces y deja la última password como manual_pending', async () => {
    const r = await ctx.orch.runWithBackoff('scheduler', [1, 1, 1]);
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);

    const all = await ctx.passwords.listRecent(10);
    expect(all).toHaveLength(3); // 3 passwords insertadas, una por intento
    const active = await ctx.passwords.getActive();
    expect(active?.applied).toBe(0);
    expect(active?.applied_method).toBe('manual_pending');

    const logs = await ctx.audit.list({ eventType: 'password_rotation', limit: 10 });
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RotationOrchestrator.runWithBackoff — respeta los delays', () => {
  it('espera el delay configurado entre intentos', async () => {
    vi.useFakeTimers();
    const db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const audit = new AuditLogRepository(db);
    const passwords = new PasswordRepository(db);
    const adapter = new MockRouterAdapter({ mode: 'always-fail', ssidGuest: 'X' });
    const routerService = new RouterService({ adapter, audit, passwords });
    const orch = new RotationOrchestrator({
      routerService, passwords, audit, routerCredentials, ssidGuest: 'X',
    });

    const promise = orch.runWithBackoff('scheduler', [60_000, 300_000, 900_000]);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(300_000);
    await vi.advanceTimersByTimeAsync(900_000);
    const r = await promise;
    expect(r.attempts).toBe(3);

    await db.destroy();
    vi.useRealTimers();
  });
});
