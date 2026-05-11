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
