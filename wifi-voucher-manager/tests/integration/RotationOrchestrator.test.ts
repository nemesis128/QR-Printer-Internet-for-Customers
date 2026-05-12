import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
