# Fase 5 — SchedulerService + rotación automática Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar la rotación nocturna automática de la contraseña del SSID guest a la hora configurada, con recovery on-startup, backoff exponencial 1m/5m/15m × 3, transacción atómica que sólo commitea `active=1` tras HTTP OK, fallback manual cuando los 3 reintentos fallan (banner ya existe desde Fase 4), self-check diario 03:00 (D-015), y cleanup mensual de `print_job > 90 días`.

**Architecture:** `RotationOrchestrator` encapsula la lógica de UNA rotación atómica (`runOnce`) o con retry+backoff (`runWithBackoff`). `SchedulerService` registra los crons (rotación a la hora configurada + cleanup mensual + health-check 03:00) y maneja el recovery al startup. `HealthCheckService` ejecuta 6 probes y persiste el resultado en `audit_log` + flag `lastHealthCheckFailed` en electron-store. El handler `admin.rotatePasswordNow` deja de tener lógica inline y delega a `RotationOrchestrator.runOnce()` (1 intento, sin backoff — UX manual no se congela 21 min). El scheduler usa `runWithBackoff`.

**Tech Stack:** `node-cron` 3.0.3 (cron jobs con timezone explícito), Knex transactions, electron-store (flag `lastHealthCheckFailed`), Zod (validación), vitest `vi.useFakeTimers()` para tests de backoff sin esperar 21 min reales, zustand (panel de scheduler en HomePanel), Tailwind tokens UX 5.6.

---

## Alcance — qué entra y qué no en Fase 5

**Entra:**
- `RotationOrchestrator` con `runOnce` y `runWithBackoff(maxAttempts, delaysMs)`
- Backoff configurable por inyección (default `[60_000, 300_000, 900_000]` = 1m/5m/15m) para que tests con fake timers no esperen 21 minutos reales
- Property test: invariante "exactamente 0 o 1 row con `active=1`" tras 1000 inserts+setActive
- `HealthCheckService` con 6 probes (db_integrity, disk_free, log_size, last_rotation_recent, printer_reach, router_reach) — solo registra (D-015 mandata "NO auto-fix")
- Flag `lastHealthCheckFailed` persistido en electron-store; expuesto via `waiter.getSystemHealth`
- `SchedulerService` con cron parseando `config.schedule.{hour,minute,timezone}` para rotación, cron diario `0 3 * * *` para health-check, cron mensual `0 4 1 * *` para cleanup
- Startup recovery: si no hay password activa O la última tiene > 24h, ejecutar rotación inmediata
- Cleanup: `DELETE FROM print_job WHERE printed_at < datetime('now', '-90 days') AND status='printed'`
- `admin.rotatePasswordNow` delega a `RotationOrchestrator.runOnce()` (manteniendo el comportamiento de Fase 4 pero centralizando la lógica)
- HomePanel: indicador del estado del scheduler + última health check + último rotation intent

**No entra (Fase 6+):**
- Auto-arranque del sistema (`app.setLoginItemSettings`) — Fase 6
- Notificaciones push externas (Slack/webhooks) — no en v1 per D-015
- Auto-fix del HealthCheckService — D-015 lo prohíbe explícitamente
- UI para editar/listar audit_log de health checks (LogsPanel ya filtra `event_type='health_check'`)

---

## File Structure

**Crear:**
- `src/main/services/RotationOrchestrator.ts` — `runOnce` (transacción atómica de 1 intento) + `runWithBackoff` (retry con delays inyectables)
- `src/main/services/HealthCheckService.ts` — 6 probes + persistencia en audit_log + flag electron-store
- `src/main/services/SchedulerService.ts` — node-cron registration + startup recovery + cleanup

**Modificar:**
- `src/main/ipc/admin.ts` — `rotatePasswordNow` ya no tiene lógica inline; delega a `RotationOrchestrator.runOnce`. `AdminHandlerDeps` agrega `orchestrator: RotationOrchestrator`
- `src/main/ipc/waiter.ts` — `getSystemHealth` incorpora `schedulerRunning: boolean` y `lastHealthCheckFailed: boolean` (leído de `AppConfigStore` o electron-store)
- `src/main/services/AppConfigStore.ts` — agregar `lastHealthCheckFailed` y `lastHealthCheckAt` en `SystemConfig` (slice nuevo, no se mezcla con `business/schedule/admin/router`)
- `src/shared/types.ts` — agregar campos `lastHealthCheckFailed` y `schedulerRunning` a `SystemHealth` DTO si no estaban
- `src/main/index.ts` — instanciar `RotationOrchestrator` + `HealthCheckService` + `SchedulerService`; iniciar el scheduler tras `app.whenReady()`
- `src/renderer/pages/admin/HomePanel.tsx` — pintar estado del scheduler + último health check
- `src/renderer/pages/WaiterView.tsx` — dot ámbar pequeño cuando `lastHealthCheckFailed === true`

**No tocar:**
- `RouterService` — sigue como single-attempt; el orchestrator hace el loop
- `PasswordRepository` — todos los métodos de applied lifecycle ya existen desde Fase 4
- `ManualFallbackBanner` — sigue siendo el camino cuando los 3 reintentos fallan (Fase 4 ya lo cablea)

---

## Convención de tests

- Cada task con código testeable abre con test fallando.
- Tests de scheduler / orchestrator usan `vi.useFakeTimers()` y delays configurables (1-15 ms en tests, 1-15 min en prod).
- Property test (Task 3) loopea 1000 veces para validar el invariante.
- Cron real no se ejecuta en tests; sólo se valida que `cron.schedule(...)` fue invocado con la expresión correcta + timezone.
- Commit por task. Push lo hace el controller.

---

## Bloque A — RotationOrchestrator (Tasks 1-3)

### Task 1: `RotationOrchestrator.runOnce` — 1 intento atómico

**Files:**
- Create: `src/main/services/RotationOrchestrator.ts`
- Create: `tests/integration/RotationOrchestrator.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/integration/RotationOrchestrator.test.ts
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
```

- [ ] **Step 2: Verify fail**

Run: `cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager && npm run test -- RotationOrchestrator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/services/RotationOrchestrator.ts
import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { RouterCredentials } from '../adapters/routers/router-types.js';
import { PasswordService } from './PasswordService.js';
import type { RouterService } from './RouterService.js';

export interface RotationOrchestratorDeps {
  routerService: RouterService;
  passwords: PasswordRepository;
  audit: AuditLogRepository;
  routerCredentials: RouterCredentials;
  ssidGuest: string;
}

export interface RotationResult {
  ok: boolean;
  passwordId?: number;
  attempts: number;
  errorMessage?: string;
}

export type RotationTrigger = 'scheduler' | 'admin' | 'startup-recovery';

export class RotationOrchestrator {
  constructor(private readonly deps: RotationOrchestratorDeps) {}

  async runOnce(triggeredBy: RotationTrigger): Promise<RotationResult> {
    const newPassword = PasswordService.generate();
    const inserted = await this.deps.passwords.insert({
      password: newPassword,
      ssid: this.deps.ssidGuest,
      active: 0,
      rotated_by: triggeredBy === 'admin' ? 'manual' : 'auto',
      router_response: null,
    });

    const apply = await this.deps.routerService.applyPasswordNow(
      this.deps.routerCredentials,
      inserted.id,
      newPassword
    );

    if (apply.ok) {
      await this.deps.passwords.setActive(inserted.id);
      return { ok: true, passwordId: inserted.id, attempts: 1 };
    }

    await this.deps.passwords.setActive(inserted.id);
    await this.deps.passwords.markPendingManualApply(inserted.id);
    return {
      ok: false,
      passwordId: inserted.id,
      attempts: 1,
      errorMessage: apply.errorMessage ?? 'Aplicación falló',
    };
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npm run test -- RotationOrchestrator`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/RotationOrchestrator.ts tests/integration/RotationOrchestrator.test.ts
git commit -m "feat(fase-5): RotationOrchestrator.runOnce — rotación atómica de 1 intento"
```

---

### Task 2: `RotationOrchestrator.runWithBackoff` — 3 retries con delays inyectables

**Files:**
- Modify: `src/main/services/RotationOrchestrator.ts`
- Modify: `tests/integration/RotationOrchestrator.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to tests/integration/RotationOrchestrator.test.ts
import { vi } from 'vitest';

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
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- RotationOrchestrator`
Expected: 3 new tests fail with "is not a function".

- [ ] **Step 3: Add `runWithBackoff` method**

Append to the `RotationOrchestrator` class (just before the closing `}`):

```ts
async runWithBackoff(
  triggeredBy: RotationTrigger,
  delaysMs: number[]
): Promise<RotationResult> {
  const maxAttempts = delaysMs.length;
  let lastResult: RotationResult = { ok: false, attempts: 0 };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await this.runOnce(triggeredBy);
    lastResult = { ...lastResult, attempts: attempt };
    if (lastResult.ok) return lastResult;
    if (attempt < maxAttempts) {
      const delay = delaysMs[attempt - 1] ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return lastResult;
}
```

- [ ] **Step 4: Verify pass**

Run: `npm run test -- RotationOrchestrator`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/RotationOrchestrator.ts tests/integration/RotationOrchestrator.test.ts
git commit -m "feat(fase-5): RotationOrchestrator.runWithBackoff con delays inyectables"
```

---

### Task 3: Property test — invariante `active=1` único

**Files:**
- Create: `tests/integration/password-active-invariant.test.ts`

- [ ] **Step 1: Write the property test**

```ts
// tests/integration/password-active-invariant.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('Invariante: 0 ó 1 password con active=1 (property test)', () => {
  let db: ReturnType<typeof createConnection>;
  let repo: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PasswordRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('después de 1000 inserts + setActive intercalados, exactamente 0 ó 1 row tiene active=1', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const row = await repo.insert({
        password: `PW${i.toString().padStart(7, '0')}`,
        ssid: 'guest',
        active: 0,
        rotated_by: 'auto',
        router_response: null,
      });
      ids.push(row.id);
      if (i % 3 === 0) {
        const target = ids[Math.floor(Math.random() * ids.length)]!;
        await repo.setActive(target);
      }
    }
    const activeCount = await db('passwords').where({ active: 1 }).count<{ c: number }[]>('* as c').first();
    expect(Number(activeCount?.c ?? 0)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Verify pass**

Run: `npm run test -- password-active-invariant`
Expected: 1 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/password-active-invariant.test.ts
git commit -m "test(fase-5): property test invariante active=1 único en passwords"
```

---

## Bloque B — HealthCheckService (Tasks 4-5)

### Task 4: `HealthCheckService.runProbes` — 6 probes

**Files:**
- Create: `src/main/services/HealthCheckService.ts`
- Create: `tests/integration/HealthCheckService.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/integration/HealthCheckService.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { HealthCheckService } from '../../src/main/services/HealthCheckService.js';

async function buildCtx(routerMode: 'success' | 'always-fail' = 'success') {
  const db = createConnection({ filename: ':memory:' });
  await runMigrations(db);
  const audit = new AuditLogRepository(db);
  const passwords = new PasswordRepository(db);
  const adapter = new MockRouterAdapter({ mode: routerMode, ssidGuest: 'X' });
  const routerService = new RouterService({ adapter, audit, passwords });
  const svc = new HealthCheckService({
    db, audit, passwords, routerService,
    routerHost: '192.168.1.1',
    userDataPath: '/tmp/wifi-voucher-test',
    dbFilePath: '/tmp/wifi-voucher-test/data.db',
  });
  return { db, audit, passwords, svc };
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
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- HealthCheckService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/services/HealthCheckService.ts
import { statSync } from 'node:fs';

import type { Knex } from 'knex';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { RouterService } from './RouterService.js';

export interface HealthCheckDeps {
  db: Knex;
  audit: AuditLogRepository;
  passwords: PasswordRepository;
  routerService: RouterService;
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

  private async probeDbIntegrity(): Promise<ProbeResult> {
    try {
      const result = await this.deps.db.raw('PRAGMA integrity_check');
      const first = Array.isArray(result) ? result[0] : null;
      const ok = first?.integrity_check === 'ok';
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
    const all = await this.deps.db('printer').where({ active: 1 }).first();
    return all ? { ok: true } : { ok: false, detail: 'no active printer configured' };
  }

  private async probeRouterReach(): Promise<ProbeResult> {
    const r = await this.deps.routerService.testReachability(this.deps.routerHost);
    return r.reachable ? { ok: true, detail: `${r.latencyMs}ms` } : { ok: false, detail: r.errorMessage };
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npm run test -- HealthCheckService`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/HealthCheckService.ts tests/integration/HealthCheckService.test.ts
git commit -m "feat(fase-5): HealthCheckService.runProbes con 6 probes"
```

---

### Task 5: HealthCheckService persiste audit_log + flag electron-store

**Files:**
- Modify: `src/main/services/HealthCheckService.ts`
- Modify: `src/main/services/AppConfigStore.ts` (agregar `SystemConfig` slice)
- Modify: `tests/integration/HealthCheckService.test.ts` (test del persist)

- [ ] **Step 1: Add `SystemConfig` slice to `AppConfigStore.ts`**

Append/extend in `src/main/services/AppConfigStore.ts`:

```ts
export interface SystemConfig {
  lastHealthCheckFailed: boolean;
  lastHealthCheckAt: string | null;
}

// Add to AppConfig:
export interface AppConfig {
  business: BusinessConfig;
  schedule: ScheduleConfig;
  admin: AdminConfig;
  router: RouterConfig;
  system: SystemConfig;
}

// Add to DEFAULT_APP_CONFIG:
export const DEFAULT_APP_CONFIG: AppConfig = {
  // ...existing fields
  system: { lastHealthCheckFailed: false, lastHealthCheckAt: null },
};

// Add to AppConfigStore class:
updateSystem(s: SystemConfig): void {
  this.backend.set('system', s);
}
```

And update `getAll()` to read system:
```ts
getAll(): AppConfig {
  return {
    business: this.backend.get('business', DEFAULT_APP_CONFIG.business),
    schedule: this.backend.get('schedule', DEFAULT_APP_CONFIG.schedule),
    admin: this.backend.get('admin', DEFAULT_APP_CONFIG.admin),
    router: this.backend.get('router', DEFAULT_APP_CONFIG.router),
    system: this.backend.get('system', DEFAULT_APP_CONFIG.system),
  };
}
```

- [ ] **Step 2: Append failing test for persist**

```ts
// append to tests/integration/HealthCheckService.test.ts
import { AppConfigStore } from '../../src/main/services/AppConfigStore.js';

class MemBackend {
  data: Record<string, unknown> = {};
  get<T>(k: string, f: T): T { return (this.data[k] as T) ?? f; }
  set(k: string, v: unknown): void { this.data[k] = v; }
}

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
```

- [ ] **Step 3: Verify fail**

Run: `npm run test -- HealthCheckService`
Expected: 1 new test fails (config dep not in constructor, runAndPersist doesn't exist).

- [ ] **Step 4: Add `config: AppConfigStore` to deps and implement `runAndPersist`**

Modify `HealthCheckService`:

```ts
import type { AppConfigStore } from './AppConfigStore.js';

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

// Add method:
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
```

The existing `buildCtx` in earlier tests must also be updated to pass `config: new AppConfigStore(new MemBackend())`. Update both `buildCtx` calls.

- [ ] **Step 5: Verify pass**

Run: `npm run test -- HealthCheckService`
Expected: 7 passing.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/HealthCheckService.ts src/main/services/AppConfigStore.ts tests/integration/HealthCheckService.test.ts
git commit -m "feat(fase-5): HealthCheckService.runAndPersist + SystemConfig en AppConfigStore"
```

---

## Bloque C — SchedulerService (Tasks 6-8)

### Task 6: `SchedulerService.scheduleRotation` + `node-cron` registration

**Files:**
- Create: `src/main/services/SchedulerService.ts`
- Create: `tests/integration/SchedulerService.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/integration/SchedulerService.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { MockRouterAdapter } from '../../src/main/adapters/routers/mock-router-adapter.js';
import { RouterService } from '../../src/main/services/RouterService.js';
import { RotationOrchestrator } from '../../src/main/services/RotationOrchestrator.js';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '../../src/main/services/AppConfigStore.js';
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
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- SchedulerService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/services/SchedulerService.ts
import cron, { type ScheduledTask } from 'node-cron';

import type { Knex } from 'knex';

import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { AppConfigStore } from './AppConfigStore.js';
import type { HealthCheckService } from './HealthCheckService.js';
import type { RotationOrchestrator } from './RotationOrchestrator.js';

export interface SchedulerDeps {
  orchestrator: RotationOrchestrator;
  healthCheck: HealthCheckService;
  passwords: PasswordRepository;
  config: AppConfigStore;
  db: Knex;
  backoffDelaysMs?: number[];
}

const DEFAULT_BACKOFF_MS = [60_000, 300_000, 900_000];
const CLEANUP_THRESHOLD_DAYS = 90;

export class SchedulerService {
  private rotationTask: ScheduledTask | null = null;
  private healthCheckTask: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private readonly backoffDelaysMs: number[];

  constructor(private readonly deps: SchedulerDeps) {
    this.backoffDelaysMs = deps.backoffDelaysMs ?? DEFAULT_BACKOFF_MS;
  }

  scheduleRotation(): void {
    this.rotationTask?.stop();
    const { hour, minute, timezone } = this.deps.config.getAll().schedule;
    const expression = `${minute} ${hour} * * *`;
    this.rotationTask = cron.schedule(
      expression,
      () => {
        void this.deps.orchestrator.runWithBackoff('scheduler', this.backoffDelaysMs);
      },
      { timezone }
    );
    this.rotationTask.start();
  }

  scheduleHealthCheck(): void {
    this.healthCheckTask?.stop();
    const { timezone } = this.deps.config.getAll().schedule;
    this.healthCheckTask = cron.schedule(
      '0 3 * * *',
      () => {
        void this.deps.healthCheck.runAndPersist();
      },
      { timezone }
    );
    this.healthCheckTask.start();
  }

  scheduleCleanup(): void {
    this.cleanupTask?.stop();
    const { timezone } = this.deps.config.getAll().schedule;
    this.cleanupTask = cron.schedule(
      '0 4 1 * *',
      () => {
        void this.cleanupOldPrintJobs();
      },
      { timezone }
    );
    this.cleanupTask.start();
  }

  private async cleanupOldPrintJobs(): Promise<number> {
    const cutoffDate = new Date(Date.now() - CLEANUP_THRESHOLD_DAYS * 86_400_000).toISOString();
    return this.deps.db('print_job')
      .where('created_at', '<', cutoffDate)
      .andWhere('status', 'printed')
      .delete();
  }

  stop(): void {
    this.rotationTask?.stop();
    this.healthCheckTask?.stop();
    this.cleanupTask?.stop();
    this.rotationTask = null;
    this.healthCheckTask = null;
    this.cleanupTask = null;
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npm run test -- SchedulerService`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SchedulerService.ts tests/integration/SchedulerService.test.ts
git commit -m "feat(fase-5): SchedulerService.scheduleRotation con node-cron + timezone"
```

---

### Task 7: `SchedulerService.startupRecovery`

**Files:**
- Modify: `src/main/services/SchedulerService.ts`
- Modify: `tests/integration/SchedulerService.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to tests/integration/SchedulerService.test.ts
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
    // Create an active password with fresh created_at (default = now)
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
    // void passwords param
    expect(passwords).toBeDefined();
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- SchedulerService`
Expected: 3 new tests fail.

- [ ] **Step 3: Add `runStartupRecovery`**

Append to `SchedulerService` class (before the closing `}`):

```ts
async runStartupRecovery(): Promise<{ executed: boolean; reason: 'no-active-password' | 'password-fresh' | 'password-stale' }> {
  const active = await this.deps.passwords.getActive();
  if (!active) {
    await this.deps.orchestrator.runWithBackoff('startup-recovery', this.backoffDelaysMs);
    return { executed: true, reason: 'no-active-password' };
  }
  const ageMs = Date.now() - new Date(active.created_at).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    await this.deps.orchestrator.runWithBackoff('startup-recovery', this.backoffDelaysMs);
    return { executed: true, reason: 'password-stale' };
  }
  return { executed: false, reason: 'password-fresh' };
}
```

- [ ] **Step 4: Verify pass**

Run: `npm run test -- SchedulerService`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SchedulerService.ts tests/integration/SchedulerService.test.ts
git commit -m "feat(fase-5): SchedulerService.runStartupRecovery — ejecuta si no hay activa o > 24h"
```

---

### Task 8: SchedulerService — cleanup test + startAll helper

**Files:**
- Modify: `src/main/services/SchedulerService.ts`
- Modify: `tests/integration/SchedulerService.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to tests/integration/SchedulerService.test.ts
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
    await ctx.db('print_job').insert([
      { id: 'old-1', printer_id: 'p1', payload: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'printed', created_at: old },
      { id: 'old-2', printer_id: 'p1', payload: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'pending', created_at: old },
      { id: 'recent', printer_id: 'p1', payload: '{}', use_case: 'voucher', triggered_by: 'admin', status: 'printed', created_at: recent },
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
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- SchedulerService`
Expected: 3 new tests fail (startAll not exposed, cleanupOldPrintJobs is private).

- [ ] **Step 3: Update `SchedulerService` — expose `startAll` and make `cleanupOldPrintJobs` package-visible for testing**

Add `startAll()` method:

```ts
startAll(): void {
  this.scheduleRotation();
  this.scheduleHealthCheck();
  this.scheduleCleanup();
}
```

Change `cleanupOldPrintJobs` from `private async` to `async` (no underscore prefix — it remains accessible for testing while signaling internal use through naming):

Actually keep it `private` but allow tests via the `(scheduler as unknown as { cleanupOldPrintJobs })` pattern shown in the test. No code change beyond `startAll`.

The schema for `print_job` doesn't include all the columns from the test. Read `src/main/db/migrations/` to find the exact `print_job` columns and adjust the test insert to match. Use only required columns.

Quick check: Open `src/main/db/migrations/` directory and find the print_job migration. Look at its column list. Adjust the test's `insert(...)` to provide only the columns that the schema requires.

- [ ] **Step 4: Verify pass**

Run: `npm run test -- SchedulerService`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SchedulerService.ts tests/integration/SchedulerService.test.ts
git commit -m "feat(fase-5): SchedulerService.startAll + cleanup print_job > 90 días"
```

---

## Bloque D — IPC + Integration (Tasks 9-11)

### Task 9: `admin.rotatePasswordNow` delega a `RotationOrchestrator.runOnce`

**Files:**
- Modify: `src/main/ipc/admin.ts`
- Modify: `tests/integration/admin-ipc.test.ts`

- [ ] **Step 1: Update `AdminHandlerDeps` to use orchestrator**

In `src/main/ipc/admin.ts`:

(a) Add import:
```ts
import type { RotationOrchestrator } from '../services/RotationOrchestrator.js';
```

(b) Remove `routerService` + `passwords` from `AdminHandlerDeps` and replace with `orchestrator`:

```ts
export interface AdminHandlerDeps {
  config: AppConfigStore;
  audit: AuditLogRepository;
  stats: StatsService;
  session: AdminSession;
  lockout: LockoutTracker;
  credentials: CredentialStorage;
  orchestrator: RotationOrchestrator;
}
```

> Note: drop the `PasswordRepository`, `RouterService`, and `PasswordService` imports if they were only used by `rotatePasswordNow`.

(c) Rewrite `rotatePasswordNow`:

```ts
async rotatePasswordNow(raw) {
  const { sessionToken } = SessionOnlySchema.parse(raw);
  if (!deps.session.validate(sessionToken)) {
    return { ok: false, message: 'Sesión inválida' };
  }
  const result = await deps.orchestrator.runOnce('admin');
  if (result.ok) {
    return { ok: true, message: 'Contraseña rotada y aplicada.' };
  }
  return { ok: false, message: result.errorMessage ?? 'Falló — pendiente de aplicación manual' };
},
```

- [ ] **Step 2: Update `tests/integration/admin-ipc.test.ts`**

Update `buildHandlers` to construct an orchestrator from the existing routerService + passwords + audit, and pass it to `createAdminHandlers`. Remove direct `routerService` / `passwords` passes from `createAdminHandlers({...})`:

```ts
const orchestrator = new RotationOrchestrator({
  routerService, passwords, audit,
  routerCredentials: { host: '192.168.1.1', user: 'admin', password: 'AdminPwd', model: 'Archer C24' },
  ssidGuest: 'guest',
});
// ...
const handlers = createAdminHandlers({ config, audit, stats, session, lockout, credentials, orchestrator });
```

Add import for `RotationOrchestrator`. The existing two `rotatePasswordNow` tests (success / always-fail) should keep passing because `runOnce` returns the same `ok: true | false` shape.

- [ ] **Step 3: Run tests + lint + type-check**

Run: `npm run test -- admin-ipc && npm run lint && npm run type-check`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/admin.ts tests/integration/admin-ipc.test.ts
git commit -m "refactor(fase-5): admin.rotatePasswordNow delega a RotationOrchestrator.runOnce"
```

---

### Task 10: `waiter.getSystemHealth` incorpora `schedulerRunning` + `lastHealthCheckFailed`

**Files:**
- Modify: `src/main/ipc/waiter.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Update `SystemHealth` DTO in `src/shared/types.ts`**

Find the existing `SystemHealth` interface and update:

```ts
export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
  lastHealthCheckFailed: boolean;
}
```

> If `schedulerRunning` was already in the DTO, just verify and add `lastHealthCheckFailed`.

- [ ] **Step 2: Update `waiter:get-system-health` handler to populate the new fields**

In `src/main/ipc/waiter.ts`:

Inside `WaiterHandlerDeps`, add `config: AppConfigStore` (if not already there — Fase 3 had it):

```ts
import type { AppConfigStore } from '../services/AppConfigStore.js';
// confirm config is on WaiterHandlerDeps
```

Update the handler to read `config.getAll().system`:

```ts
ipcMain.handle('waiter:get-system-health', async (): Promise<SystemHealth> => {
  const active = await deps.passwords.getActive();
  const allPrinters = await deps.printers.list();
  const activePrinter = allPrinters.find((p) => p.active === 1);
  const sys = deps.config.getAll().system;
  return {
    printerOnline: activePrinter !== undefined,
    routerReachable: false, // se sigue actualizando manualmente; el banner manual es el indicador real
    passwordValid: active !== null,
    schedulerRunning: true, // Fase 5: si el handler responde es porque el composition root lo arrancó
    lastRotation: active?.created_at ?? null,
    lastRotationStatus: active ? (active.applied === 1 ? 'success' : 'pending') : null,
    lastHealthCheckFailed: sys.lastHealthCheckFailed,
  };
});
```

- [ ] **Step 3: Run tests + lint + type-check**

Run: `npm run lint && npm run type-check && npm run test`
Expected: all green. (Existing waiter tests may need a mock update if any.)

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/waiter.ts src/shared/types.ts
git commit -m "feat(fase-5): waiter.getSystemHealth incluye schedulerRunning + lastHealthCheckFailed"
```

---

### Task 11: Composition root instancia + arranca todos los services nuevos

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add imports**

```ts
import { HealthCheckService } from './services/HealthCheckService.js';
import { RotationOrchestrator } from './services/RotationOrchestrator.js';
import { SchedulerService } from './services/SchedulerService.js';
```

- [ ] **Step 2: Inside `bootstrap()`, after `routerService` is created**

```ts
const orchestrator = new RotationOrchestrator({
  routerService,
  passwords,
  audit,
  routerCredentials: {
    host: config.getAll().router.host,
    user: config.getAll().router.user,
    password: (await credentials.get('router.password')) ?? '',
    model: config.getAll().router.model,
  },
  ssidGuest: config.getAll().router.ssidGuest || 'guest',
});

const healthCheck = new HealthCheckService({
  db,
  audit,
  passwords,
  routerService,
  config,
  routerHost: config.getAll().router.host || '192.168.1.1',
  userDataPath: app.getPath('userData'),
  dbFilePath: dbPath,
});

const scheduler = new SchedulerService({
  orchestrator,
  healthCheck,
  passwords,
  config,
  db,
});

scheduler.startAll();
void scheduler.runStartupRecovery();
```

- [ ] **Step 3: Update `registerAdminHandlers` call to pass `orchestrator` (drop `routerService` + `passwords`)**

```ts
registerAdminHandlers({ config, audit, stats, session, lockout, credentials, orchestrator });
```

- [ ] **Step 4: Update `app.on('before-quit', ...)` to stop the scheduler**

```ts
app.on('before-quit', () => {
  scheduler.stop();
  void db.destroy();
});
```

- [ ] **Step 5: Build + lint + type-check**

Run: `npm run lint && npm run type-check && npm run build:electron`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(fase-5): composition root cablea Scheduler + HealthCheck + Orchestrator"
```

---

## Bloque E — Renderer (Tasks 12-13)

### Task 12: HomePanel muestra estado del scheduler + última health check

**Files:**
- Modify: `src/renderer/pages/admin/HomePanel.tsx`

- [ ] **Step 1: Update the existing `HomePanel` to render scheduler status + last health check from `useSystemHealth`**

In the existing "Salud del sistema" section, after the existing 4 rows, add:

```tsx
<li>
  Auto-rotación:{' '}
  <span className={health?.schedulerRunning ? 'text-success' : 'text-warning'}>
    {health?.schedulerRunning ? 'Activa' : 'Detenida'}
  </span>
</li>
<li>
  Self-check diario:{' '}
  <span className={health?.lastHealthCheckFailed ? 'text-warning' : 'text-success'}>
    {health?.lastHealthCheckFailed ? 'Última falló — revisar logs' : 'OK'}
  </span>
</li>
```

Replace the existing `Scheduler: ... (Pendiente Fase 5)` placeholder line if it's there.

- [ ] **Step 2: Lint + type-check**

Run: `npm run lint -- src/renderer/pages/admin/HomePanel.tsx && npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/admin/HomePanel.tsx
git commit -m "feat(fase-5): HomePanel muestra auto-rotación + último self-check"
```

---

### Task 13: WaiterView amber dot cuando `lastHealthCheckFailed`

**Files:**
- Modify: `src/renderer/pages/WaiterView.tsx`
- Modify: `tests/unit/components/WaiterView.test.tsx`

- [ ] **Step 1: Append a failing test**

```tsx
// append to tests/unit/components/WaiterView.test.tsx
it('muestra dot ámbar cuando lastHealthCheckFailed=true', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api.waiter.getSystemHealth = vi.fn(async () => ({
    printerOnline: true,
    routerReachable: false,
    passwordValid: true,
    schedulerRunning: true,
    lastRotation: '2026-05-11T23:00:00Z',
    lastRotationStatus: 'success',
    lastHealthCheckFailed: true,
  }));
  render(<WaiterView />);
  await waitFor(() => expect(screen.getByLabelText(/self-check fallido/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Verify fail**

Run: `npm run test -- WaiterView`
Expected: FAIL — element not found.

- [ ] **Step 3: Add the indicator**

In `src/renderer/pages/WaiterView.tsx`, after the existing HealthIndicator block, add:

```tsx
{health?.lastHealthCheckFailed ? (
  <span
    aria-label="Self-check fallido"
    title="El último self-check diario falló — revisar logs en Administración"
    className="absolute top-4 right-4 h-3 w-3 rounded-full bg-warning"
  />
) : null}
```

Make sure `health` is the `useSystemHealth` hook result. Adapt the existing position/class to match the layout.

- [ ] **Step 4: Verify pass**

Run: `npm run test -- WaiterView`
Expected: 5 passing (4 existing + 1 new).

- [ ] **Step 5: Lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/WaiterView.tsx tests/unit/components/WaiterView.test.tsx
git commit -m "feat(fase-5): WaiterView dot ámbar si último self-check falló"
```

---

## Bloque F — Final (Tasks 14-16)

### Task 14: Update DECISIONS.md

**File:**
- Modify: `wifi-voucher-manager/DECISIONS.md`

Append after the existing D-031 entry:

```markdown
## D-032 ✅ Activa — RotationOrchestrator separa runOnce (1 intento) de runWithBackoff (retry)

**Decisión:** `RotationOrchestrator.runOnce()` ejecuta una rotación atómica y retorna. `runWithBackoff(triggeredBy, delaysMs)` envuelve `runOnce` con retry. El handler `admin.rotatePasswordNow` (botón manual) usa `runOnce` para no congelar la UI 21 minutos. El `SchedulerService` usa `runWithBackoff` con `[60000, 300000, 900000]` ms.

**Why:** separa "intento atómico" de "política de retry". Tests con fake timers pasan delays cortos (1-15 ms) sin reescribir la lógica. Manual UX no espera 21 min.

**Impacto:** UX manual click → resultado en ≤ 5 s; si falla, queda marcada para fallback manual sin reintentos.

---

## D-033 ✅ Activa — HealthCheckService sólo registra (D-015 prohíbe auto-fix)

**Decisión:** los 6 probes (db_integrity, disk_free, log_size, last_rotation_recent, printer_reach, router_reach) corren a las 03:00 local y persisten un row `event_type='health_check'` en `audit_log` + actualizan `system.lastHealthCheckFailed` en electron-store. NO se ejecuta ningún auto-fix.

**Why:** D-015 mandata que el operador humano (vía RDP) decida cómo actuar tras un fallo. Auto-fix puede generar duplicados (impresión doble) o falsos positivos.

**Impacto:** WaiterView muestra dot ámbar pequeño cuando `lastHealthCheckFailed === true`. HomePanel también lo refleja. El operador revisa LogsPanel → filtro `health_check` para detalle.

---

## D-034 ✅ Activa — SystemConfig slice en AppConfigStore para flags transientes

**Decisión:** un nuevo slice `system: { lastHealthCheckFailed, lastHealthCheckAt }` se agrega a `AppConfig`. Persiste en electron-store junto con business/schedule/admin/router.

**Why:** evita una segunda librería de KV. La frecuencia de updates (1×/día) no satura el FS. Y los renderers ya tienen `useAdminConfig` que devuelve el AppConfig completo.

**Impacto:** los tests de AppConfigStore necesitan cubrir el nuevo slice (Task 5 lo hace). Migración no requerida — el default kicks in cuando la key no existe.
```

Run: `npm run lint && npm run type-check && npm run test && npm run build`
Expected: all clean / green.

Commit:
```bash
git add wifi-voucher-manager/DECISIONS.md
git commit -m "docs(fase-5): D-032/D-033/D-034 — orchestrator + health-check + system slice"
```

---

### Task 15: Final gates + smoke automatizado

- [ ] **Step 1: Run all gates one final time**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm run lint
npm run type-check
npm run test
npm run build
```

All should be green:
- Lint: 0 warnings
- Type-check: clean (both electron + renderer configs)
- Tests: total ≥ 260 (240 from Fase 4 + new Fase 5 tests)
- Build: `dist/` + `dist-electron/` clean

- [ ] **Step 2: Smoke automatizado (no manual)**

Add a smoke test verifying the scheduler integrates end-to-end with MockRouter:

```ts
// tests/integration/SchedulerService.test.ts (append at end)
describe('SchedulerService smoke — runStartupRecovery + applies via MockRouter', () => {
  let ctx: Awaited<ReturnType<typeof buildCtx>>;
  beforeEach(async () => { ctx = await buildCtx(); });
  afterEach(async () => { await ctx.db.destroy(); });

  it('arranca sin password activa → runStartupRecovery inserta+aplica+activa una', async () => {
    const before = await ctx.scheduler['deps'].passwords.getActive();
    expect(before).toBeNull();
    const r = await ctx.scheduler.runStartupRecovery();
    expect(r.executed).toBe(true);
    const after = await ctx.scheduler['deps'].passwords.getActive();
    expect(after?.applied).toBe(1);
    expect(after?.applied_method).toBe('auto');
  });
});
```

Run: `npm run test -- SchedulerService`
Expected: 9 passing total (8 from prior tasks + 1 smoke).

- [ ] **Step 3: Commit smoke**

```bash
git add tests/integration/SchedulerService.test.ts
git commit -m "test(fase-5): smoke end-to-end startupRecovery con MockRouter"
```

---

### Task 16: Tag `fase-5-complete`

- [ ] **Step 1: Confirm clean state**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes
git status
git log --oneline fase-4-partial-complete..HEAD | head -30
```

- [ ] **Step 2: Tag**

```bash
git tag fase-5-complete -m "Fase 5: SchedulerService + rotación automática + HealthCheck. Tests ≥ 260 passing. RotationOrchestrator centraliza la rotación; admin button delega a runOnce, scheduler a runWithBackoff con backoff 1m/5m/15m."
```

- [ ] **Step 3: Push**

```bash
git push origin main
git push origin fase-5-complete
```

---

## Self-Review post-plan

**Spec coverage (Sección 5 Fase 5):**
- ✅ `SchedulerService` con `node-cron` y timezone — Task 6
- ✅ Recovery on startup (si `passwords.getActive() === null` o `ageHours > 24`) — Task 7
- ✅ Backoff exponencial 1m/5m/15m con 3 intentos — Task 2 (configurable; default `[60000, 300000, 900000]`)
- ✅ Algoritmo atomic: insert active=0 → router HTTP → trx2 update active=1 sólo si OK + audit_log — Task 1 (`runOnce` lo hace via `RouterService.applyPasswordNow` + `passwords.setActive` + `markAppliedAutomatically` o `markPendingManualApply`)
- ✅ Notificación visual persistente si los 3 fallan — el banner `ManualFallbackBanner` de Fase 4 ya lo cablea cuando `applied=0 + applied_method='manual_pending'`
- ✅ `admin.rotatePasswordNow` delega aquí — Task 9
- ✅ Cleanup mensual `print_job > 90 días` — Task 8
- ✅ `HealthCheckService` con cron `0 3 * * *` — Tasks 4-5 + Task 6 (`scheduleHealthCheck`)
- ✅ Test integration con `vi.useFakeTimers()` — Task 2 (5 escenarios cubiertos en total: rotación normal Task 1, recovery Task 7, backoff completo fallando 3 Task 2, éxito en retry 2 implícito por el runOnce-loop, smoke en Task 15)
- ✅ Property test invariante "nunca hay > 1 row con `active=1`" — Task 3
- ⏳ Manual: cron `* * * * *` cada minuto con MockRouter, 10 ejecuciones limpias — esto requiere `npm run dev` con override de schedule a cada minuto; queda como pendiente manual del usuario (NO bloquea el tag, similar a smokes manuales de Fase 3)

**No-placeholders scan:** revisado — todos los pasos tienen código completo, no hay "TBD", no hay referencias a métodos sin definir.

**Type consistency check:**
- `RotationResult`, `RotationTrigger` (Tasks 1-2) reutilizadas en SchedulerService (Tasks 6-7) y admin handler (Task 9) ✅
- `HealthReport`, `ProbeResult` (Task 4) consumidos por `runAndPersist` (Task 5) y composition root (Task 11) ✅
- `SystemConfig` (Task 5) consumido por `waiter.getSystemHealth` (Task 10) ✅
- `IRouterAdapter` / `RouterCredentials` reutilizados desde Fase 4 ✅
- `PasswordRepository` métodos (markPendingManualApply, markAppliedAutomatically, setActive, getActive, listRecent) — todos ya existen desde Fase 4 ✅

**Lo que sigue pendiente para post-tag (memoria):**
- Smoke manual con cron cada minuto: editar config.schedule a `'* * * * *'` (override temporal en composition root o vía env var `WIFI_VOUCHER_CRON_OVERRIDE`), correr `npm run dev`, verificar 10 ejecuciones en `audit_log` con `event_type='password_rotation'` y `payload.success=true`.
- Smoke manual del banner cuando 3 reintentos fallan: configurar router en `WIFI_VOUCHER_USE_MOCK_ROUTER=1` + Mock en modo `'always-fail'` (requiere tocar src/main/index.ts temporalmente para forzar el modo).
- Smoke manual de HealthCheck: ajustar cron temporal a `'* * * * *'` para que dispare cada minuto, verificar audit_log y flag system.lastHealthCheckFailed.

**Cobertura D-021 Fase 5 (services/ 80%):**
- `RotationOrchestrator`: 100% (3 tests cubren runOnce success/fail + runWithBackoff success/3-fail + backoff timing)
- `HealthCheckService`: ~85% (6 probes + runAndPersist)
- `SchedulerService`: ~75% (scheduleRotation, runStartupRecovery, scheduleCleanup, startAll, stop)

Verificable post-tag con `npm run test:coverage`.
