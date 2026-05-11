import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { createAdminHandlers } from '../../src/main/ipc/admin.js';
import { AdminSession } from '../../src/main/services/AdminSession.js';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '../../src/main/services/AppConfigStore.js';
import { LockoutTracker } from '../../src/main/services/LockoutTracker.js';
import { PinCrypto } from '../../src/main/services/PinCrypto.js';
import { StatsService } from '../../src/main/services/StatsService.js';

class MemBackend {
  data: Record<string, unknown> = {};
  get<T>(k: string, f: T): T { return (this.data[k] as T) ?? f; }
  set(k: string, v: unknown): void { this.data[k] = v; }
}

async function buildHandlers() {
  const db = createConnection({ filename: ':memory:' });
  await runMigrations(db);
  const config = new AppConfigStore(new MemBackend());
  const audit = new AuditLogRepository(db);
  const stats = new StatsService(db, audit);
  const session = new AdminSession({ ttlMs: 60_000 });
  const lockout = new LockoutTracker({ maxAttempts: 3, windowMs: 60_000 });
  // sembrar pin default
  const pinHash = await PinCrypto.hashPin('0000');
  config.updateAdmin({ pinHash, pinIsDefault: true });
  const handlers = createAdminHandlers({ config, audit, stats, session, lockout });
  return { handlers, db, config };
}

describe('admin IPC handlers', () => {
  let ctx: Awaited<ReturnType<typeof buildHandlers>>;

  beforeEach(async () => { ctx = await buildHandlers(); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('validatePin con PIN correcto devuelve sessionToken', async () => {
    const r = await ctx.handlers.validatePin({ pin: '0000' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sessionToken.length).toBeGreaterThanOrEqual(64);
  });

  it('validatePin con PIN incorrecto reporta fallo y registra intento', async () => {
    const r = await ctx.handlers.validatePin({ pin: '9999' });
    expect(r.ok).toBe(false);
  });

  it('lockout activa tras 3 fallos consecutivos', async () => {
    await ctx.handlers.validatePin({ pin: '9999' });
    await ctx.handlers.validatePin({ pin: '9999' });
    await ctx.handlers.validatePin({ pin: '9999' });
    const r = await ctx.handlers.validatePin({ pin: '0000' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
  });

  it('changePin rechaza PIN nuevo inválido (D-018)', async () => {
    const session = await ctx.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    const r = await ctx.handlers.changePin({
      sessionToken: session.sessionToken,
      currentPin: '0000',
      newPin: '0000',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('INVALID_NEW_PIN');
  });

  it('changePin acepta PIN válido y limpia pinIsDefault', async () => {
    const session = await ctx.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    const r = await ctx.handlers.changePin({
      sessionToken: session.sessionToken,
      currentPin: '0000',
      newPin: '5829',
    });
    expect(r.ok).toBe(true);
    expect(ctx.config.getAll().admin.pinIsDefault).toBe(false);
  });

  it('updateConfig.business persiste el cambio', async () => {
    const session = await ctx.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    await ctx.handlers.updateConfig({
      sessionToken: session.sessionToken,
      section: 'business',
      value: { name: 'X', footerMessage: 'Y', logoPath: null },
    });
    expect(ctx.config.getAll().business.name).toBe('X');
  });

  it('updateConfig sin sessionToken vigente falla', async () => {
    const r = await ctx.handlers.updateConfig({
      sessionToken: 'fake',
      section: 'business',
      value: DEFAULT_APP_CONFIG.business,
    });
    expect(r.ok).toBe(false);
  });
});
