import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { createRouterHandlers } from '../../src/main/ipc/router.js';
import { AdminSession } from '../../src/main/services/AdminSession.js';
import { AppConfigStore } from '../../src/main/services/AppConfigStore.js';
import { MockCredentialStorage } from '../../src/main/security/CredentialStorage.js';
import { RouterService } from '../../src/main/services/RouterService.js';

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
  const session = new AdminSession({ ttlMs: 60_000 });
  const config = new AppConfigStore(new MemBackend());
  config.updateRouter({ host: '192.168.1.1', user: 'admin', model: 'Archer C24', ssidGuest: 'guest' });
  const credentials = new MockCredentialStorage();
  await credentials.set('router.password', 'AdminPwd');
  const adapter = new MockRouterAdapter({ mode: routerMode, ssidGuest: 'guest' });
  const routerSvc = new RouterService({ adapter, audit, passwords });
  const handlers = createRouterHandlers({ routerService: routerSvc, session, config, credentials });
  const token = session.issue();
  return { handlers, token, db, passwords };
}

describe('router IPC handlers', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;

  afterEach(async () => { await ctx?.db.destroy(); });

  it('pingRouter con sesión válida devuelve reachable=true en modo success', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.handlers.pingRouter({ sessionToken: ctx.token, host: '192.168.1.1' });
    expect(r.reachable).toBe(true);
  });

  it('testConnection devuelve ok=true', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.handlers.testConnection({ sessionToken: ctx.token });
    expect(r.ok).toBe(true);
  });

  it('handler sin sesión válida falla', async () => {
    ctx = await buildCtx('success');
    const r = await ctx.handlers.testConnection({ sessionToken: 'fake' });
    expect(r.ok).toBe(false);
  });

  it('markAppliedManually delega a RouterService', async () => {
    ctx = await buildCtx('success');
    const row = await ctx.passwords.insert({
      password: 'CORRECTXY', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await ctx.passwords.markPendingManualApply(row.id);
    const r = await ctx.handlers.markAppliedManually({
      sessionToken: ctx.token, passwordId: row.id, confirmedPassword: 'CORRECTXY',
    });
    expect(r.ok).toBe(true);
  });
});
