import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';

const credentials = { host: '192.168.1.1', user: 'admin', password: 'x', model: 'C24' };

describe('RouterService.testReachability', () => {
  it('devuelve reachable=true en modo success', async () => {
    const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X' });
    const svc = new RouterService({ adapter, audit: null as never, passwords: null as never });
    const r = await svc.testReachability(credentials.host);
    expect(r.reachable).toBe(true);
  });
});

describe('RouterService.testConnection', () => {
  let db: ReturnType<typeof createConnection>;
  let svc: RouterService;
  let audit: AuditLogRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    audit = new AuditLogRepository(db);
    const passwords = new PasswordRepository(db);
    const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'TestGuest' });
    svc = new RouterService({ adapter, audit, passwords });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('login + read-ssid exitosos devuelven ok=true con el ssid', async () => {
    const r = await svc.testConnection(credentials);
    expect(r.ok).toBe(true);
    expect(r.ssidGuest).toBe('TestGuest');
    expect(r.steps.map((s) => s.step)).toEqual(['login', 'read-ssid', 'logout']);
  });

  it('login fail devuelve ok=false con failedAt=login', async () => {
    const adapter = new MockRouterAdapter({ mode: 'always-fail', ssidGuest: 'X' });
    const passwords = new PasswordRepository(db);
    const svcFail = new RouterService({ adapter, audit, passwords });
    const r = await svcFail.testConnection(credentials);
    expect(r.ok).toBe(false);
    expect(r.steps.find((s) => s.step === 'login')?.ok).toBe(false);
  });
});

describe('RouterService.applyPasswordNow', () => {
  let db: ReturnType<typeof createConnection>;
  let svc: RouterService;
  let audit: AuditLogRepository;
  let passwords: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    audit = new AuditLogRepository(db);
    passwords = new PasswordRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('success marca applied=1 con applied_method=auto y registra audit_log', async () => {
    const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X' });
    svc = new RouterService({ adapter, audit, passwords });
    const row = await passwords.insert({
      password: 'NEWPWDXYZ', ssid: 'guest', active: 1, rotated_by: 'manual', router_response: null,
    });
    await passwords.markPendingManualApply(row.id);
    const r = await svc.applyPasswordNow(credentials, row.id, 'NEWPWDXYZ');
    expect(r.ok).toBe(true);
    const after = await passwords.getActive();
    expect(after?.applied).toBe(1);
    expect(after?.applied_method).toBe('auto');
    const logs = await audit.list({ eventType: 'password_rotation', limit: 5 });
    expect(logs).toHaveLength(1);
  });

  it('failure deja applied=0 y registra audit_log con success=false', async () => {
    const adapter = new MockRouterAdapter({ mode: 'fail-on-step', failStep: 'set-password', ssidGuest: 'X' });
    svc = new RouterService({ adapter, audit, passwords });
    const row = await passwords.insert({
      password: 'NEWPWDXYZ', ssid: 'guest', active: 1, rotated_by: 'manual', router_response: null,
    });
    const r = await svc.applyPasswordNow(credentials, row.id, 'NEWPWDXYZ');
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('set-password');
    const after = await passwords.getActive();
    expect(after?.applied).toBe(0);
    const logs = await audit.list({ eventType: 'password_rotation', limit: 5 });
    expect(logs).toHaveLength(1);
  });
});

describe('RouterService.markAppliedManually', () => {
  let db: ReturnType<typeof createConnection>;
  let svc: RouterService;
  let passwords: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    passwords = new PasswordRepository(db);
    const audit = new AuditLogRepository(db);
    const adapter = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X' });
    svc = new RouterService({ adapter, audit, passwords });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('markAppliedManually requiere que la password coincida (anti-typo)', async () => {
    const row = await passwords.insert({
      password: 'CORRECTXY', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await passwords.markPendingManualApply(row.id);
    await expect(svc.markAppliedManually(row.id, 'WRONGTYPE')).rejects.toThrow(/no coincide/);
    const stillPending = await passwords.getActive();
    expect(stillPending?.applied).toBe(0);
  });

  it('markAppliedManually con password correcta marca applied=1', async () => {
    const row = await passwords.insert({
      password: 'CORRECTXY', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await passwords.markPendingManualApply(row.id);
    await svc.markAppliedManually(row.id, 'CORRECTXY');
    const after = await passwords.getActive();
    expect(after?.applied).toBe(1);
    expect(after?.applied_method).toBe('manual');
  });

  it('listPendingManualApply delega al repository', async () => {
    const row = await passwords.insert({
      password: 'X', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await passwords.markPendingManualApply(row.id);
    const list = await svc.listPendingManualApply();
    expect(list).toHaveLength(1);
  });
});
