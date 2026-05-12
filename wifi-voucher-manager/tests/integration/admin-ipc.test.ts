import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { createAdminHandlers } from '../../src/main/ipc/admin.js';
import type { AdminHandlerDeps } from '../../src/main/ipc/admin.js';
import { MockCredentialStorage } from '../../src/main/security/CredentialStorage.js';
import { AdminSession } from '../../src/main/services/AdminSession.js';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '../../src/main/services/AppConfigStore.js';
import { LockoutTracker } from '../../src/main/services/LockoutTracker.js';
import { PinCrypto } from '../../src/main/services/PinCrypto.js';
import { RotationOrchestrator } from '../../src/main/services/RotationOrchestrator.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { StatsService } from '../../src/main/services/StatsService.js';

class MemBackend {
  data: Record<string, unknown> = {};
  get<T>(k: string, f: T): T { return (this.data[k] as T) ?? f; }
  set(k: string, v: unknown): void { this.data[k] = v; }
}

async function buildHandlers(
  routerMode: 'success' | 'always-fail' = 'success',
  extras: Partial<AdminHandlerDeps> = {}
) {
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
  const credentials = new MockCredentialStorage();
  const passwords = new PasswordRepository(db);
  const adapter = new MockRouterAdapter({ mode: routerMode, ssidGuest: 'guest' });
  const routerService = new RouterService({ adapter, audit, passwords });
  const orchestrator = new RotationOrchestrator({
    routerService,
    passwords,
    audit,
    routerCredentials: { host: '192.168.1.1', user: 'admin', password: 'AdminPwd', model: 'Archer C24' },
    ssidGuest: 'guest',
  });
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'wvm-admin-ipc-'));
  const handlers = createAdminHandlers({
    config, audit, stats, session, lockout, credentials, orchestrator,
    userDataPath,
    ...extras,
  });
  return { handlers, db, config, passwords, userDataPath };
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

  it('setRouterPassword guarda en CredentialStorage', async () => {
    const r = await ctx.handlers.validatePin({ pin: '0000' });
    if (!r.ok) throw new Error('precondition');
    const res = await ctx.handlers.setRouterPassword({ sessionToken: r.sessionToken, password: 'AdminPwd' });
    expect(res.ok).toBe(true);
  });

  it('rotatePasswordNow aplica la nueva contraseña al router en modo success', async () => {
    const r = await ctx.handlers.validatePin({ pin: '0000' });
    if (!r.ok) throw new Error('precondition');
    const out = await ctx.handlers.rotatePasswordNow({ sessionToken: r.sessionToken });
    expect(out.ok).toBe(true);
  });

  it('rotatePasswordNow en modo always-fail marca pending manual', async () => {
    const failCtx = await buildHandlers('always-fail');
    const r = await failCtx.handlers.validatePin({ pin: '0000' });
    if (!r.ok) throw new Error('precondition');
    const out = await failCtx.handlers.rotatePasswordNow({ sessionToken: r.sessionToken });
    expect(out.ok).toBe(false);
    await failCtx.db.destroy();
  });

  it('changePin exitoso dispara onPinChanged callback', async () => {
    const onPinChanged = vi.fn();
    const ctxLocal = await buildHandlers('success', { onPinChanged });
    const session = await ctxLocal.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    await ctxLocal.handlers.changePin({
      sessionToken: session.sessionToken,
      currentPin: '0000',
      newPin: '5829',
    });
    expect(onPinChanged).toHaveBeenCalledOnce();
    await ctxLocal.db.destroy();
  });

  it('uploadLogo copia el archivo y persiste business.logoPath', async () => {
    const ctxLocal = await buildHandlers('success');
    const srcDir = mkdtempSync(path.join(tmpdir(), 'wvm-logo-src-'));
    const srcPath = path.join(srcDir, 'source.png');
    writeFileSync(srcPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic bytes
    const session = await ctxLocal.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    const r = await ctxLocal.handlers.uploadLogo({
      sessionToken: session.sessionToken,
      sourcePath: srcPath,
    });
    expect(r.ok).toBe(true);
    expect(r.logoPath).toBeDefined();
    expect(existsSync(r.logoPath!)).toBe(true);
    expect(ctxLocal.config.getAll().business.logoPath).toBe(r.logoPath);
    await ctxLocal.db.destroy();
  });

  it('uploadLogo rechaza extensiones no soportadas', async () => {
    const ctxLocal = await buildHandlers('success');
    const session = await ctxLocal.handlers.validatePin({ pin: '0000' });
    if (!session.ok) throw new Error('precondition');
    const r = await ctxLocal.handlers.uploadLogo({
      sessionToken: session.sessionToken,
      sourcePath: '/tmp/source.gif',
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Formato no soportado');
    await ctxLocal.db.destroy();
  });
});
