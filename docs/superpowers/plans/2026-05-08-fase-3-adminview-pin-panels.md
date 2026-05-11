# Fase 3 — AdminView + PIN + 7 paneles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar la vista de Administración protegida por PIN, con cambio forzado en primer login, persistencia de configuración y los 7 paneles del spec (Inicio, Impresora, Router placeholder, Programación, Negocio, Estadísticas, Logs).

**Architecture:** Backend agrega `PinCrypto` (argon2id), `LockoutTracker`, `AdminSession`, `CredentialStorage`, `AppConfigStore` (electron-store), `AuditLogRepository` y `StatsService`, expuestos por handlers `admin.*` con session token. Renderer agrega `AdminView` con shell 2-cols, `PinModal` + `ChangePinWizard` que aplican las 7 reglas D-018, y 7 paneles que consumen `window.api.admin.*` para configuración persistente. La impresora real se selecciona desde `DiscoveryModal` (D-019), reemplazando el identifier placeholder sembrado en Fase 2.

**Tech Stack:** argon2 0.44 (D-001), electron-store 10 (D-017), Electron `safeStorage` (DPAPI Win / Keychain Mac), zod 3.23, zustand 5, lucide-react 0.460, Recharts 2.13, Tailwind 3.4 con tokens UX 5.6, vitest 2 + @testing-library/react 16.

---

## File Structure

**Crear:**
- `src/main/services/PinCrypto.ts` — `hashPin`, `verifyPin`, `isAcceptablePin` (7 reglas D-018)
- `src/main/services/LockoutTracker.ts` — 3 fallos × 5 min, in-memory
- `src/main/services/AdminSession.ts` — token 32 bytes + TTL 30 min con refresh
- `src/main/services/AppConfigStore.ts` — wrapper sobre electron-store con tipos fuertes y defaults
- `src/main/services/StatsService.ts` — agregaciones sobre `print_log` + `audit_log` + `passwords`
- `src/main/security/CredentialStorage.ts` — interfaz + Safe + Mock + factory
- `src/main/db/repositories/AuditLogRepository.ts` — insert/list/listByType/count
- `src/main/ipc/admin.ts` — handlers `admin.*` con validación zod + sesión
- `src/renderer/pages/AdminView.tsx` — shell 2-cols con gate de auth
- `src/renderer/pages/admin/HomePanel.tsx`
- `src/renderer/pages/admin/PrinterPanel.tsx`
- `src/renderer/pages/admin/RouterPanel.tsx` (placeholder Fase 3)
- `src/renderer/pages/admin/SchedulePanel.tsx`
- `src/renderer/pages/admin/BusinessPanel.tsx`
- `src/renderer/pages/admin/StatsPanel.tsx`
- `src/renderer/pages/admin/LogsPanel.tsx`
- `src/renderer/components/PinModal.tsx`
- `src/renderer/components/ChangePinWizard.tsx`
- `src/renderer/components/DiscoveryModal.tsx`
- `src/renderer/components/AdminNavRail.tsx`
- `src/renderer/components/PinInput.tsx`
- `src/renderer/store/adminStore.ts` — zustand: authState, sessionToken, currentPanel
- `src/renderer/hooks/useAdminConfig.ts` — load + save AppConfig

**Modificar:**
- `src/shared/types.ts` — agregar `AdminAPI`, `AppConfig`, `PinValidationError`, `LogEntry`, `StatsSummary`
- `src/preload/index.ts` — exponer `window.api.admin`
- `src/renderer/App.tsx` — ruteo `waiter ↔ admin`
- `src/main/index.ts` — instanciar nuevos servicios y registrar handlers
- `src/main/ipc/waiter.ts` — leer `business_name` y `footer_message` desde `AppConfigStore` en lugar de constantes

**No tocar (Fase 4):**
- `src/main/services/RouterService.ts`, `TPLinkArcherAdapter.ts` — RouterPanel queda placeholder.
- Rotación automática real desde `admin.rotatePasswordNow` — handler stub que solo registra `audit_log` event hasta Fase 5.

---

## Convención de tests

- Cada task que toca código testeable abre con un test fallando (TDD).
- Tests unit/integration: `npm run test -- <pattern>`.
- Component tests: `npm run test -- tests/unit/components/<name>.test.tsx`.
- Lint + types al cierre de cada bloque grande (no cada task) para ahorrar tiempo.
- Commit por task con mensaje `feat(fase-3): <task summary>` o `test(fase-3): <task>` cuando aplique.

---

## Bloque A — Backend Auth & Storage (Tasks 1-6)

### Task 1: PinCrypto.hashPin + verifyPin (argon2id)

**Files:**
- Create: `src/main/services/PinCrypto.ts`
- Create: `tests/unit/services/PinCrypto.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/services/PinCrypto.test.ts
import { describe, expect, it } from 'vitest';

import { PinCrypto } from '../../../src/main/services/PinCrypto.js';

describe('PinCrypto.hashPin/verifyPin', () => {
  it('hashPin produce un string argon2id verificable', async () => {
    const hash = await PinCrypto.hashPin('1234');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await PinCrypto.verifyPin('1234', hash)).toBe(true);
  });

  it('verifyPin rechaza PIN incorrecto', async () => {
    const hash = await PinCrypto.hashPin('1234');
    expect(await PinCrypto.verifyPin('9999', hash)).toBe(false);
  });

  it('hashPin produce hashes distintos para el mismo input (salt aleatorio)', async () => {
    const a = await PinCrypto.hashPin('0000');
    const b = await PinCrypto.hashPin('0000');
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd wifi-voucher-manager && npm run test -- PinCrypto`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PinCrypto.hashPin/verifyPin**

```ts
// src/main/services/PinCrypto.ts
import argon2 from 'argon2';

const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 2 ** 16,
  parallelism: 1,
};

export class PinCrypto {
  static async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, HASH_OPTIONS);
  }

  static async verifyPin(pin: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, pin);
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd wifi-voucher-manager && npm run test -- PinCrypto`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/PinCrypto.ts tests/unit/services/PinCrypto.test.ts
git commit -m "feat(fase-3): PinCrypto.hashPin/verifyPin con argon2id"
```

---

### Task 2: PinCrypto.isAcceptablePin (7 reglas D-018)

**Files:**
- Modify: `src/main/services/PinCrypto.ts`
- Modify: `tests/unit/services/PinCrypto.test.ts`

- [ ] **Step 1: Add failing tests for isAcceptablePin**

Append to `tests/unit/services/PinCrypto.test.ts`:

```ts
describe('PinCrypto.isAcceptablePin (D-018)', () => {
  const cases: Array<[string, boolean, string?]> = [
    ['1234', false, 'asc'],
    ['4321', false, 'desc'],
    ['1111', false, 'repeated'],
    ['0000', false, 'default'],
    ['12a4', false, 'non-digit'],
    ['123', false, 'short'],
    ['12345', false, 'long'],
    ['', false, 'empty'],
    ['1357', true],
    ['8642', true],
    ['1928', true],
    ['9518', true],
  ];

  it.each(cases)('isAcceptablePin(%s) === %s (%s)', (pin, expected) => {
    expect(PinCrypto.isAcceptablePin(pin).ok).toBe(expected);
  });

  it('reporta el código de regla violada', () => {
    expect(PinCrypto.isAcceptablePin('0000').code).toBe('default');
    expect(PinCrypto.isAcceptablePin('1111').code).toBe('repeated');
    expect(PinCrypto.isAcceptablePin('1234').code).toBe('ascending');
    expect(PinCrypto.isAcceptablePin('4321').code).toBe('descending');
    expect(PinCrypto.isAcceptablePin('12a4').code).toBe('non-digit');
    expect(PinCrypto.isAcceptablePin('123').code).toBe('length');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd wifi-voucher-manager && npm run test -- PinCrypto`
Expected: FAIL — `isAcceptablePin is not a function`.

- [ ] **Step 3: Add isAcceptablePin to PinCrypto**

Append to `src/main/services/PinCrypto.ts`:

```ts
export type PinRuleCode =
  | 'length'
  | 'non-digit'
  | 'default'
  | 'repeated'
  | 'ascending'
  | 'descending';

export interface PinValidation {
  ok: boolean;
  code?: PinRuleCode;
  message?: string;
}

const RULE_MESSAGES: Record<PinRuleCode, string> = {
  length: 'El PIN debe tener exactamente 4 dígitos.',
  'non-digit': 'El PIN solo puede contener números.',
  default: 'No puedes usar 0000 como PIN.',
  repeated: 'El PIN no puede tener todos los dígitos iguales.',
  ascending: 'El PIN no puede ser una secuencia ascendente.',
  descending: 'El PIN no puede ser una secuencia descendente.',
};

function isAscending(pin: string): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) + 1) return false;
  }
  return true;
}

function isDescending(pin: string): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) - 1) return false;
  }
  return true;
}

function isAllRepeated(pin: string): boolean {
  return pin.split('').every((c) => c === pin[0]);
}

export class PinCryptoExtensions {} // no-op marker; extend the existing class instead
```

Then extend `PinCrypto` directly (replace the stub above by adding the static method into the class):

```ts
// inside class PinCrypto
static isAcceptablePin(pin: string): PinValidation {
  if (pin.length !== 4) return fail('length');
  if (!/^[0-9]{4}$/.test(pin)) return fail('non-digit');
  if (pin === '0000') return fail('default');
  if (isAllRepeated(pin)) return fail('repeated');
  if (isAscending(pin)) return fail('ascending');
  if (isDescending(pin)) return fail('descending');
  return { ok: true };
}
```

Where `fail` is a top-level helper:

```ts
function fail(code: PinRuleCode): PinValidation {
  return { ok: false, code, message: RULE_MESSAGES[code] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd wifi-voucher-manager && npm run test -- PinCrypto`
Expected: all PinCrypto tests passing (15+).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/PinCrypto.ts tests/unit/services/PinCrypto.test.ts
git commit -m "feat(fase-3): PinCrypto.isAcceptablePin con las 7 reglas D-018"
```

---

### Task 3: LockoutTracker (3 fallos × 5 min)

**Files:**
- Create: `src/main/services/LockoutTracker.ts`
- Create: `tests/unit/services/LockoutTracker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/services/LockoutTracker.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LockoutTracker } from '../../../src/main/services/LockoutTracker.js';

describe('LockoutTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('permite intentos hasta el límite y luego bloquea', () => {
    const t = new LockoutTracker({ maxAttempts: 3, windowMs: 5 * 60_000 });
    expect(t.isLocked()).toBe(false);
    t.recordFailure();
    t.recordFailure();
    expect(t.isLocked()).toBe(false);
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
  });

  it('expone remainingMs durante el bloqueo', () => {
    const t = new LockoutTracker({ maxAttempts: 1, windowMs: 5 * 60_000 });
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
    expect(t.remainingMs()).toBeLessThanOrEqual(5 * 60_000);
    expect(t.remainingMs()).toBeGreaterThan(0);
  });

  it('libera el bloqueo tras windowMs', () => {
    const t = new LockoutTracker({ maxAttempts: 1, windowMs: 60_000 });
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(t.isLocked()).toBe(false);
  });

  it('reset() limpia los intentos', () => {
    const t = new LockoutTracker({ maxAttempts: 2, windowMs: 60_000 });
    t.recordFailure();
    t.reset();
    t.recordFailure();
    expect(t.isLocked()).toBe(false);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- LockoutTracker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LockoutTracker**

```ts
// src/main/services/LockoutTracker.ts
export interface LockoutOptions {
  maxAttempts: number;
  windowMs: number;
}

export class LockoutTracker {
  private failures: number[] = [];

  constructor(private readonly opts: LockoutOptions) {}

  recordFailure(): void {
    this.purgeExpired();
    this.failures.push(Date.now());
  }

  reset(): void {
    this.failures = [];
  }

  isLocked(): boolean {
    this.purgeExpired();
    return this.failures.length >= this.opts.maxAttempts;
  }

  remainingMs(): number {
    this.purgeExpired();
    if (this.failures.length < this.opts.maxAttempts) return 0;
    const oldest = this.failures[0]!;
    return Math.max(0, oldest + this.opts.windowMs - Date.now());
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - this.opts.windowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- LockoutTracker`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/LockoutTracker.ts tests/unit/services/LockoutTracker.test.ts
git commit -m "feat(fase-3): LockoutTracker con 3 fallos por 5 min"
```

---

### Task 4: AdminSession (token 32 bytes + TTL 30 min con refresh)

**Files:**
- Create: `src/main/services/AdminSession.ts`
- Create: `tests/unit/services/AdminSession.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/services/AdminSession.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSession } from '../../../src/main/services/AdminSession.js';

describe('AdminSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('issue() devuelve un token nuevo cada vez', () => {
    const s = new AdminSession({ ttlMs: 30 * 60_000 });
    const a = s.issue();
    const b = s.issue();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(64); // 32 bytes hex
  });

  it('validate() acepta token vigente y refresca el TTL', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    vi.advanceTimersByTime(30_000);
    expect(s.validate(token)).toBe(true);
    vi.advanceTimersByTime(50_000);
    expect(s.validate(token)).toBe(true); // se refrescó
  });

  it('validate() rechaza token vencido', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    vi.advanceTimersByTime(60_001);
    expect(s.validate(token)).toBe(false);
  });

  it('revoke() invalida el token', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    s.revoke(token);
    expect(s.validate(token)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- AdminSession`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AdminSession**

```ts
// src/main/services/AdminSession.ts
import { randomBytes } from 'node:crypto';

export interface AdminSessionOptions {
  ttlMs: number;
}

export class AdminSession {
  private readonly tokens = new Map<string, number>();

  constructor(private readonly opts: AdminSessionOptions) {}

  issue(): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, Date.now() + this.opts.ttlMs);
    return token;
  }

  validate(token: string): boolean {
    const expiry = this.tokens.get(token);
    if (expiry === undefined) return false;
    if (Date.now() > expiry) {
      this.tokens.delete(token);
      return false;
    }
    this.tokens.set(token, Date.now() + this.opts.ttlMs); // refresh
    return true;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- AdminSession`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/AdminSession.ts tests/unit/services/AdminSession.test.ts
git commit -m "feat(fase-3): AdminSession con token 32 bytes y refresh TTL"
```

---

### Task 5: CredentialStorage (interface + Safe + Mock + factory)

**Files:**
- Create: `src/main/security/CredentialStorage.ts`
- Create: `tests/unit/security/CredentialStorage.test.ts`

- [ ] **Step 1: Write failing tests (Mock implementation)**

```ts
// tests/unit/security/CredentialStorage.test.ts
import { describe, expect, it } from 'vitest';

import {
  MockCredentialStorage,
  createCredentialStorage,
} from '../../../src/main/security/CredentialStorage.js';

describe('MockCredentialStorage', () => {
  it('set + get devuelve el valor almacenado', async () => {
    const s = new MockCredentialStorage();
    await s.set('router.password', 's3cret');
    expect(await s.get('router.password')).toBe('s3cret');
  });

  it('get() de clave inexistente devuelve null', async () => {
    const s = new MockCredentialStorage();
    expect(await s.get('missing')).toBeNull();
  });

  it('delete() elimina la clave', async () => {
    const s = new MockCredentialStorage();
    await s.set('a', 'b');
    await s.delete('a');
    expect(await s.get('a')).toBeNull();
  });
});

describe('createCredentialStorage', () => {
  it('respeta WIFI_VOUCHER_USE_MOCK_STORAGE=1', () => {
    const original = process.env.WIFI_VOUCHER_USE_MOCK_STORAGE;
    process.env.WIFI_VOUCHER_USE_MOCK_STORAGE = '1';
    const s = createCredentialStorage();
    expect(s).toBeInstanceOf(MockCredentialStorage);
    if (original === undefined) delete process.env.WIFI_VOUCHER_USE_MOCK_STORAGE;
    else process.env.WIFI_VOUCHER_USE_MOCK_STORAGE = original;
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- CredentialStorage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CredentialStorage**

```ts
// src/main/security/CredentialStorage.ts
import electron from 'electron';

export interface CredentialStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MockCredentialStorage implements CredentialStorage {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class SafeStorageCredentialStorage implements CredentialStorage {
  private readonly cache = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const { safeStorage } = electron;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage no disponible en este sistema');
    }
    const encrypted = safeStorage.encryptString(value);
    this.cache.set(key, encrypted.toString('base64'));
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

export function createCredentialStorage(): CredentialStorage {
  if (
    process.env.WIFI_VOUCHER_USE_MOCK_STORAGE === '1' ||
    process.env.NODE_ENV === 'test'
  ) {
    return new MockCredentialStorage();
  }
  return new SafeStorageCredentialStorage();
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- CredentialStorage`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/security/CredentialStorage.ts tests/unit/security/CredentialStorage.test.ts
git commit -m "feat(fase-3): CredentialStorage con Mock+Safe y factory por env"
```

---

### Task 6: AppConfigStore (electron-store wrapper)

**Files:**
- Create: `src/main/services/AppConfigStore.ts`
- Create: `tests/unit/services/AppConfigStore.test.ts`

- [ ] **Step 1: Write failing tests (con backend in-memory)**

```ts
// tests/unit/services/AppConfigStore.test.ts
import { describe, expect, it } from 'vitest';

import {
  AppConfigStore,
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from '../../../src/main/services/AppConfigStore.js';

class InMemoryBackend {
  private data: Record<string, unknown> = {};
  get<T>(key: string, fallback: T): T {
    return (this.data[key] as T) ?? fallback;
  }
  set(key: string, value: unknown): void {
    this.data[key] = value;
  }
}

describe('AppConfigStore', () => {
  it('getAll devuelve defaults si nunca se persistió', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    expect(store.getAll()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('updateBusiness persiste y getAll lo refleja', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateBusiness({
      name: 'Restaurante Demo',
      footerMessage: '¡Vuelve pronto!',
      logoPath: null,
    });
    expect(store.getAll().business.name).toBe('Restaurante Demo');
  });

  it('updateAdmin persiste el hash y el flag pinIsDefault', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateAdmin({ pinHash: '$argon2id$xxx', pinIsDefault: false });
    expect(store.getAll().admin.pinIsDefault).toBe(false);
  });

  it('updateSchedule persiste hora y minuto', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateSchedule({ hour: 23, minute: 30, timezone: 'America/Mexico_City' });
    const cfg: AppConfig = store.getAll();
    expect(cfg.schedule).toEqual({ hour: 23, minute: 30, timezone: 'America/Mexico_City' });
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- AppConfigStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AppConfigStore**

```ts
// src/main/services/AppConfigStore.ts
export interface AppConfigBackend {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface BusinessConfig {
  name: string;
  footerMessage: string;
  logoPath: string | null;
}

export interface ScheduleConfig {
  hour: number;
  minute: number;
  timezone: string;
}

export interface AdminConfig {
  pinHash: string;
  pinIsDefault: boolean;
}

export interface RouterConfig {
  host: string;
  user: string;
  model: string;
  ssidGuest: string;
}

export interface AppConfig {
  business: BusinessConfig;
  schedule: ScheduleConfig;
  admin: AdminConfig;
  router: RouterConfig;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  business: {
    name: 'Mi Restaurante',
    footerMessage: '¡Gracias por tu visita!',
    logoPath: null,
  },
  schedule: { hour: 23, minute: 0, timezone: 'America/Mexico_City' },
  admin: { pinHash: '', pinIsDefault: true },
  router: { host: '', user: 'admin', model: 'TP-Link Archer C24', ssidGuest: '' },
};

export class AppConfigStore {
  constructor(private readonly backend: AppConfigBackend) {}

  getAll(): AppConfig {
    return {
      business: this.backend.get('business', DEFAULT_APP_CONFIG.business),
      schedule: this.backend.get('schedule', DEFAULT_APP_CONFIG.schedule),
      admin: this.backend.get('admin', DEFAULT_APP_CONFIG.admin),
      router: this.backend.get('router', DEFAULT_APP_CONFIG.router),
    };
  }

  updateBusiness(b: BusinessConfig): void {
    this.backend.set('business', b);
  }

  updateSchedule(s: ScheduleConfig): void {
    this.backend.set('schedule', s);
  }

  updateAdmin(a: AdminConfig): void {
    this.backend.set('admin', a);
  }

  updateRouter(r: RouterConfig): void {
    this.backend.set('router', r);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- AppConfigStore`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/AppConfigStore.ts tests/unit/services/AppConfigStore.test.ts
git commit -m "feat(fase-3): AppConfigStore con tipado fuerte y defaults"
```

---

## Bloque B — Backend Stats & IPC (Tasks 7-9)

### Task 7: AuditLogRepository

**Files:**
- Create: `src/main/db/repositories/AuditLogRepository.ts`
- Create: `tests/integration/AuditLogRepository.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/integration/AuditLogRepository.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('AuditLogRepository', () => {
  let db: ReturnType<typeof createConnection>;
  let repo: AuditLogRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new AuditLogRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('insert + list devuelve eventos en orden descendente', async () => {
    await repo.insert({ event_type: 'print', payload: { jobId: 'a' } });
    await repo.insert({ event_type: 'config_change', payload: { field: 'business.name' } });
    const rows = await repo.list({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.event_type).toBe('config_change');
  });

  it('listByType filtra correctamente', async () => {
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'password_rotation', payload: { success: true } });
    const prints = await repo.list({ eventType: 'print', limit: 10 });
    expect(prints).toHaveLength(1);
  });

  it('countByType agrega correctamente', async () => {
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'error', payload: null });
    expect(await repo.countByType('print')).toBe(2);
    expect(await repo.countByType('error')).toBe(1);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- AuditLogRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AuditLogRepository**

```ts
// src/main/db/repositories/AuditLogRepository.ts
import type { Knex } from 'knex';

export type AuditEventType =
  | 'password_rotation'
  | 'print'
  | 'config_change'
  | 'error'
  | 'health_check'
  | 'admin_login'
  | 'admin_pin_change';

export interface AuditLogRow {
  id: number;
  event_type: AuditEventType;
  payload: string | null;
  created_at: string;
}

export interface AuditEntryInput {
  event_type: AuditEventType;
  payload: unknown;
}

export interface ListOptions {
  limit?: number;
  eventType?: AuditEventType;
}

export class AuditLogRepository {
  constructor(private readonly db: Knex) {}

  async insert(entry: AuditEntryInput): Promise<void> {
    await this.db('audit_log').insert({
      event_type: entry.event_type,
      payload: entry.payload === null ? null : JSON.stringify(entry.payload),
    });
  }

  async list(opts: ListOptions = {}): Promise<AuditLogRow[]> {
    const limit = opts.limit ?? 100;
    let q = this.db<AuditLogRow>('audit_log').orderBy('id', 'desc').limit(limit);
    if (opts.eventType) q = q.where('event_type', opts.eventType);
    return q;
  }

  async countByType(eventType: AuditEventType): Promise<number> {
    const row = await this.db('audit_log').where('event_type', eventType).count<{ c: number }[]>('* as c').first();
    return Number(row?.c ?? 0);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- AuditLogRepository`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/repositories/AuditLogRepository.ts tests/integration/AuditLogRepository.test.ts
git commit -m "feat(fase-3): AuditLogRepository con insert/list/count"
```

---

### Task 8: StatsService

**Files:**
- Create: `src/main/services/StatsService.ts`
- Create: `tests/integration/StatsService.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/integration/StatsService.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { StatsService } from '../../src/main/services/StatsService.js';

describe('StatsService', () => {
  let db: ReturnType<typeof createConnection>;
  let stats: StatsService;
  let audit: AuditLogRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    audit = new AuditLogRepository(db);
    stats = new StatsService(db, audit);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('getSummary devuelve totales en cero cuando no hay datos', async () => {
    const s = await stats.getSummary();
    expect(s.totalPrints).toBe(0);
    expect(s.successfulPrints).toBe(0);
    expect(s.totalRotations).toBe(0);
  });

  it('getSummary cuenta prints de print_log', async () => {
    await db('print_log').insert([
      { password_id: null, success: 1, error: null },
      { password_id: null, success: 1, error: null },
      { password_id: null, success: 0, error: 'fail' },
    ]);
    const s = await stats.getSummary();
    expect(s.totalPrints).toBe(3);
    expect(s.successfulPrints).toBe(2);
  });

  it('getDailyPrints devuelve serie de últimos N días', async () => {
    await db('print_log').insert({ password_id: null, success: 1, error: null });
    const series = await stats.getDailyPrints(7);
    expect(series).toHaveLength(7);
    expect(series.reduce((acc, p) => acc + p.count, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- StatsService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement StatsService**

```ts
// src/main/services/StatsService.ts
import type { Knex } from 'knex';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';

export interface StatsSummary {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  totalRotations: number;
  successfulRotations: number;
}

export interface DailyPrintPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export class StatsService {
  constructor(
    private readonly db: Knex,
    private readonly audit: AuditLogRepository
  ) {}

  async getSummary(): Promise<StatsSummary> {
    const total = await this.db('print_log').count<{ c: number }[]>('* as c').first();
    const success = await this.db('print_log').where('success', 1).count<{ c: number }[]>('* as c').first();
    const totalRotations = await this.audit.countByType('password_rotation');
    const successRotations = await this.db('audit_log')
      .where('event_type', 'password_rotation')
      .whereRaw("json_extract(payload, '$.success') = 1")
      .count<{ c: number }[]>('* as c')
      .first();
    return {
      totalPrints: Number(total?.c ?? 0),
      successfulPrints: Number(success?.c ?? 0),
      failedPrints: Number(total?.c ?? 0) - Number(success?.c ?? 0),
      totalRotations,
      successfulRotations: Number(successRotations?.c ?? 0),
    };
  }

  async getDailyPrints(days: number): Promise<DailyPrintPoint[]> {
    const rows = await this.db('print_log')
      .select(this.db.raw("substr(created_at, 1, 10) as day"))
      .count<{ day: string; c: number }[]>('* as c')
      .groupBy('day');
    const counts = new Map<string, number>(rows.map((r) => [r.day, Number(r.c)]));
    const today = new Date();
    const out: DailyPrintPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: counts.get(iso) ?? 0 });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- StatsService`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/StatsService.ts tests/integration/StatsService.test.ts
git commit -m "feat(fase-3): StatsService.getSummary + getDailyPrints"
```

---

### Task 9: admin.* IPC handlers

**Files:**
- Create: `src/main/ipc/admin.ts`
- Create: `tests/integration/admin-ipc.test.ts` (smoke validation against real handlers via direct call, no electron required)

Esta tarea expone los handlers a través de funciones puras inyectadas, para poder testearlas sin Electron. La integración con `ipcMain.handle` es trivial al final.

- [ ] **Step 1: Write failing tests for the handlers (as plain functions)**

```ts
// tests/integration/admin-ipc.test.ts
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
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- admin-ipc`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement createAdminHandlers**

```ts
// src/main/ipc/admin.ts
import electron from 'electron';
import { z } from 'zod';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';
import type { AdminSession } from '../services/AdminSession.js';
import type {
  AppConfig,
  AppConfigStore,
  BusinessConfig,
  RouterConfig,
  ScheduleConfig,
} from '../services/AppConfigStore.js';
import type { LockoutTracker } from '../services/LockoutTracker.js';
import { PinCrypto } from '../services/PinCrypto.js';
import type { StatsService } from '../services/StatsService.js';

const { ipcMain } = electron;

const PinSchema = z.object({ pin: z.string().min(1).max(8) });
const ChangePinSchema = z.object({
  sessionToken: z.string().min(1),
  currentPin: z.string().min(1).max(8),
  newPin: z.string().min(1).max(8),
});
const BusinessSchema = z.object({
  name: z.string().min(1).max(80),
  footerMessage: z.string().max(120),
  logoPath: z.string().nullable(),
});
const ScheduleSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  timezone: z.string().min(1),
});
const RouterSchema = z.object({
  host: z.string(),
  user: z.string(),
  model: z.string(),
  ssidGuest: z.string(),
});
const UpdateConfigSchema = z.object({
  sessionToken: z.string().min(1),
  section: z.enum(['business', 'schedule', 'router']),
  value: z.unknown(),
});
const SessionOnlySchema = z.object({ sessionToken: z.string().min(1) });
const ListLogsSchema = z.object({
  sessionToken: z.string().min(1),
  eventType: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export type ValidatePinResult =
  | { ok: true; sessionToken: string; pinIsDefault: boolean }
  | { ok: false; code: 'INVALID_PIN' | 'LOCKED'; remainingMs?: number };

export type ChangePinResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_CURRENT' | 'INVALID_NEW_PIN' | 'INVALID_SESSION'; message?: string };

export type UpdateConfigResult = { ok: true } | { ok: false; code: 'INVALID_SESSION' | 'INVALID_VALUE'; message?: string };

export interface AdminHandlerDeps {
  config: AppConfigStore;
  audit: AuditLogRepository;
  stats: StatsService;
  session: AdminSession;
  lockout: LockoutTracker;
}

export interface AdminHandlers {
  validatePin: (input: { pin: string }) => Promise<ValidatePinResult>;
  changePin: (input: {
    sessionToken: string;
    currentPin: string;
    newPin: string;
  }) => Promise<ChangePinResult>;
  getConfig: (input: { sessionToken: string }) => Promise<AppConfig | null>;
  updateConfig: (input: {
    sessionToken: string;
    section: 'business' | 'schedule' | 'router';
    value: unknown;
  }) => Promise<UpdateConfigResult>;
  getStats: (input: { sessionToken: string }) => Promise<unknown>;
  listLogs: (input: { sessionToken: string; eventType?: string; limit?: number }) => Promise<unknown>;
  rotatePasswordNow: (input: { sessionToken: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function createAdminHandlers(deps: AdminHandlerDeps): AdminHandlers {
  return {
    async validatePin(raw) {
      const { pin } = PinSchema.parse(raw);
      if (deps.lockout.isLocked()) {
        return { ok: false, code: 'LOCKED', remainingMs: deps.lockout.remainingMs() };
      }
      const cfg = deps.config.getAll();
      const ok = await PinCrypto.verifyPin(pin, cfg.admin.pinHash);
      if (!ok) {
        deps.lockout.recordFailure();
        await deps.audit.insert({ event_type: 'admin_login', payload: { success: false } });
        return { ok: false, code: 'INVALID_PIN' };
      }
      deps.lockout.reset();
      const token = deps.session.issue();
      await deps.audit.insert({ event_type: 'admin_login', payload: { success: true } });
      return { ok: true, sessionToken: token, pinIsDefault: cfg.admin.pinIsDefault };
    },

    async changePin(raw) {
      const input = ChangePinSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, code: 'INVALID_SESSION' };
      }
      const cfg = deps.config.getAll();
      if (!(await PinCrypto.verifyPin(input.currentPin, cfg.admin.pinHash))) {
        return { ok: false, code: 'INVALID_CURRENT' };
      }
      const validation = PinCrypto.isAcceptablePin(input.newPin);
      if (!validation.ok) {
        return { ok: false, code: 'INVALID_NEW_PIN', message: validation.message };
      }
      const newHash = await PinCrypto.hashPin(input.newPin);
      deps.config.updateAdmin({ pinHash: newHash, pinIsDefault: false });
      await deps.audit.insert({ event_type: 'admin_pin_change', payload: { success: true } });
      return { ok: true };
    },

    async getConfig(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return null;
      return deps.config.getAll();
    },

    async updateConfig(raw) {
      const input = UpdateConfigSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) {
        return { ok: false, code: 'INVALID_SESSION' };
      }
      try {
        if (input.section === 'business') {
          deps.config.updateBusiness(BusinessSchema.parse(input.value) as BusinessConfig);
        } else if (input.section === 'schedule') {
          deps.config.updateSchedule(ScheduleSchema.parse(input.value) as ScheduleConfig);
        } else {
          deps.config.updateRouter(RouterSchema.parse(input.value) as RouterConfig);
        }
        await deps.audit.insert({
          event_type: 'config_change',
          payload: { section: input.section },
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          code: 'INVALID_VALUE',
          message: err instanceof Error ? err.message : 'Valor inválido',
        };
      }
    },

    async getStats(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) return null;
      return {
        summary: await deps.stats.getSummary(),
        daily: await deps.stats.getDailyPrints(14),
      };
    },

    async listLogs(raw) {
      const input = ListLogsSchema.parse(raw);
      if (!deps.session.validate(input.sessionToken)) return [];
      return deps.audit.list({
        limit: input.limit ?? 200,
        ...(input.eventType ? { eventType: input.eventType as never } : {}),
      });
    },

    async rotatePasswordNow(raw) {
      const { sessionToken } = SessionOnlySchema.parse(raw);
      if (!deps.session.validate(sessionToken)) {
        return { ok: false, message: 'Sesión inválida' };
      }
      // Stub Fase 3: solo registra el intento; rotación real llega en Fase 5.
      await deps.audit.insert({
        event_type: 'password_rotation',
        payload: { success: false, reason: 'scheduler-not-yet-implemented', triggered_by: 'admin' },
      });
      return { ok: false, message: 'Rotación automática pendiente de Fase 5' };
    },
  };
}

export function registerAdminHandlers(deps: AdminHandlerDeps): void {
  const h = createAdminHandlers(deps);
  ipcMain.handle('admin:validate-pin', (_e, r) => h.validatePin(r));
  ipcMain.handle('admin:change-pin', (_e, r) => h.changePin(r));
  ipcMain.handle('admin:get-config', (_e, r) => h.getConfig(r));
  ipcMain.handle('admin:update-config', (_e, r) => h.updateConfig(r));
  ipcMain.handle('admin:get-stats', (_e, r) => h.getStats(r));
  ipcMain.handle('admin:list-logs', (_e, r) => h.listLogs(r));
  ipcMain.handle('admin:rotate-password-now', (_e, r) => h.rotatePasswordNow(r));
}

export function unregisterAdminHandlers(): void {
  ipcMain.removeHandler('admin:validate-pin');
  ipcMain.removeHandler('admin:change-pin');
  ipcMain.removeHandler('admin:get-config');
  ipcMain.removeHandler('admin:update-config');
  ipcMain.removeHandler('admin:get-stats');
  ipcMain.removeHandler('admin:list-logs');
  ipcMain.removeHandler('admin:rotate-password-now');
}
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- admin-ipc`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/admin.ts tests/integration/admin-ipc.test.ts
git commit -m "feat(fase-3): handlers admin.* con sesión + zod + audit log"
```

---

## Bloque C — Tipos compartidos + Preload + Store (Tasks 10-12)

### Task 10: Tipos compartidos AdminAPI + AppConfig

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Append types to `src/shared/types.ts`**

Agregar al final del archivo (sin tocar lo existente):

```ts
// ─── Admin (Fase 3) ─────────────────────────────────────────────────────────

export interface BusinessConfigDTO {
  name: string;
  footerMessage: string;
  logoPath: string | null;
}

export interface ScheduleConfigDTO {
  hour: number;
  minute: number;
  timezone: string;
}

export interface RouterConfigDTO {
  host: string;
  user: string;
  model: string;
  ssidGuest: string;
}

export interface AdminConfigDTO {
  pinIsDefault: boolean;
}

export interface AppConfigDTO {
  business: BusinessConfigDTO;
  schedule: ScheduleConfigDTO;
  router: RouterConfigDTO;
  admin: AdminConfigDTO;
}

export type ValidatePinResultDTO =
  | { ok: true; sessionToken: string; pinIsDefault: boolean }
  | { ok: false; code: 'INVALID_PIN' | 'LOCKED'; remainingMs?: number };

export type ChangePinResultDTO =
  | { ok: true }
  | { ok: false; code: 'INVALID_CURRENT' | 'INVALID_NEW_PIN' | 'INVALID_SESSION'; message?: string };

export type UpdateConfigResultDTO =
  | { ok: true }
  | { ok: false; code: 'INVALID_SESSION' | 'INVALID_VALUE'; message?: string };

export interface StatsSummaryDTO {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  totalRotations: number;
  successfulRotations: number;
}

export interface DailyPrintPointDTO {
  date: string;
  count: number;
}

export interface StatsBundleDTO {
  summary: StatsSummaryDTO;
  daily: DailyPrintPointDTO[];
}

export interface AuditLogEntryDTO {
  id: number;
  event_type: string;
  payload: string | null;
  created_at: string;
}

export interface AdminAPI {
  validatePin: (input: { pin: string }) => Promise<ValidatePinResultDTO>;
  changePin: (input: {
    sessionToken: string;
    currentPin: string;
    newPin: string;
  }) => Promise<ChangePinResultDTO>;
  getConfig: (input: { sessionToken: string }) => Promise<AppConfigDTO | null>;
  updateConfig: (input: {
    sessionToken: string;
    section: 'business' | 'schedule' | 'router';
    value: BusinessConfigDTO | ScheduleConfigDTO | RouterConfigDTO;
  }) => Promise<UpdateConfigResultDTO>;
  getStats: (input: { sessionToken: string }) => Promise<StatsBundleDTO | null>;
  listLogs: (input: {
    sessionToken: string;
    eventType?: string;
    limit?: number;
  }) => Promise<AuditLogEntryDTO[]>;
  rotatePasswordNow: (input: { sessionToken: string }) => Promise<{ ok: boolean; message?: string }>;
}
```

Y modificar `IpcAPI`:

```ts
export interface IpcAPI {
  waiter: WaiterAPI;
  printer: PrinterAPI;
  admin: AdminAPI;
}
```

- [ ] **Step 2: Run type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS (algunos errores transitorios en `preload/index.ts` por `IpcAPI.admin` faltante en runtime — siguiente task lo cubre).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(fase-3): tipos compartidos AdminAPI + AppConfigDTO"
```

---

### Task 11: Preload — exponer window.api.admin

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add admin section to preload**

Reemplazar el archivo completo agregando la sección `admin`:

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

import type {
  AdminAPI,
  AppConfigDTO,
  AuditLogEntryDTO,
  ChangePinResultDTO,
  DiscoveredPrinter,
  IpcAPI,
  JobStatusSnapshot,
  PrintVoucherResult,
  PrinterConnection,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
  StatsBundleDTO,
  SystemHealth,
  UpdateConfigResultDTO,
  ValidatePinResultDTO,
} from '../shared/types.js';

const adminApi: AdminAPI = {
  validatePin: (input): Promise<ValidatePinResultDTO> =>
    ipcRenderer.invoke('admin:validate-pin', input),
  changePin: (input): Promise<ChangePinResultDTO> =>
    ipcRenderer.invoke('admin:change-pin', input),
  getConfig: (input): Promise<AppConfigDTO | null> =>
    ipcRenderer.invoke('admin:get-config', input),
  updateConfig: (input): Promise<UpdateConfigResultDTO> =>
    ipcRenderer.invoke('admin:update-config', input),
  getStats: (input): Promise<StatsBundleDTO | null> =>
    ipcRenderer.invoke('admin:get-stats', input),
  listLogs: (input): Promise<AuditLogEntryDTO[]> =>
    ipcRenderer.invoke('admin:list-logs', input),
  rotatePasswordNow: (input): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke('admin:rotate-password-now', input),
};

const api: IpcAPI = {
  waiter: {
    getCurrentSSID: (): Promise<string> => ipcRenderer.invoke('waiter:get-current-ssid'),
    getSystemHealth: (): Promise<SystemHealth> => ipcRenderer.invoke('waiter:get-system-health'),
    printVoucher: (): Promise<PrintVoucherResult> => ipcRenderer.invoke('waiter:print-voucher'),
  },
  printer: {
    discover: (): Promise<DiscoveredPrinter[]> => ipcRenderer.invoke('printer:discover'),
    testConnection: (input: {
      connection: PrinterConnection;
      identifier: string;
      width_chars: 32 | 48;
    }): Promise<PrinterTestResult> => ipcRenderer.invoke('printer:test-connection', input),
    list: (): Promise<PrinterRecord[]> => ipcRenderer.invoke('printer:list'),
    setActive: (id: string): Promise<void> => ipcRenderer.invoke('printer:set-active', { id }),
    getJobStatus: (jobId: string): Promise<JobStatusSnapshot | null> =>
      ipcRenderer.invoke('printer:get-job-status', { jobId }),
    retryJob: (jobId: string): Promise<void> => ipcRenderer.invoke('printer:retry-job', { jobId }),
    listRecentJobs: (limit?: number): Promise<RecentJobSummary[]> =>
      ipcRenderer.invoke('printer:list-recent-jobs', { limit }),
  },
  admin: adminApi,
};

contextBridge.exposeInMainWorld('api', api);
```

- [ ] **Step 2: Build preload**

Run: `cd wifi-voucher-manager && npm run build:preload`
Expected: salida limpia, `dist-electron/preload/index.js` actualizado.

- [ ] **Step 3: Type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(fase-3): preload expone window.api.admin"
```

---

### Task 12: adminStore (zustand) + useAdminConfig hook

**Files:**
- Create: `src/renderer/store/adminStore.ts`
- Create: `src/renderer/hooks/useAdminConfig.ts`
- Create: `tests/unit/store/adminStore.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/store/adminStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdminStore } from '../../../src/renderer/store/adminStore.js';

const validatePinMock = vi.fn();

beforeEach(() => {
  validatePinMock.mockReset();
  // @ts-expect-error -- inject mock window.api
  globalThis.window = {
    api: {
      admin: { validatePin: validatePinMock },
    },
  };
  useAdminStore.setState({
    sessionToken: null,
    pinIsDefault: false,
    locked: false,
    remainingMs: 0,
    error: null,
    currentPanel: 'home',
  });
});

describe('adminStore.attemptLogin', () => {
  it('guarda sessionToken al éxito', async () => {
    validatePinMock.mockResolvedValue({ ok: true, sessionToken: 'tok', pinIsDefault: false });
    await useAdminStore.getState().attemptLogin('1234');
    expect(useAdminStore.getState().sessionToken).toBe('tok');
  });

  it('reporta locked cuando el handler responde LOCKED', async () => {
    validatePinMock.mockResolvedValue({ ok: false, code: 'LOCKED', remainingMs: 60_000 });
    await useAdminStore.getState().attemptLogin('1234');
    expect(useAdminStore.getState().locked).toBe(true);
  });

  it('reporta error cuando PIN incorrecto', async () => {
    validatePinMock.mockResolvedValue({ ok: false, code: 'INVALID_PIN' });
    await useAdminStore.getState().attemptLogin('9999');
    expect(useAdminStore.getState().error).toBeTruthy();
    expect(useAdminStore.getState().sessionToken).toBeNull();
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- adminStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement adminStore**

```ts
// src/renderer/store/adminStore.ts
import { create } from 'zustand';

export type AdminPanelKey =
  | 'home'
  | 'printer'
  | 'router'
  | 'schedule'
  | 'business'
  | 'stats'
  | 'logs';

export interface AdminState {
  sessionToken: string | null;
  pinIsDefault: boolean;
  locked: boolean;
  remainingMs: number;
  error: string | null;
  currentPanel: AdminPanelKey;
  attemptLogin: (pin: string) => Promise<void>;
  logout: () => void;
  setPanel: (p: AdminPanelKey) => void;
  setPinIsDefault: (v: boolean) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  sessionToken: null,
  pinIsDefault: false,
  locked: false,
  remainingMs: 0,
  error: null,
  currentPanel: 'home',
  attemptLogin: async (pin: string) => {
    set({ error: null });
    const r = await window.api.admin.validatePin({ pin });
    if (r.ok) {
      set({
        sessionToken: r.sessionToken,
        pinIsDefault: r.pinIsDefault,
        locked: false,
        remainingMs: 0,
        error: null,
      });
      return;
    }
    if (r.code === 'LOCKED') {
      set({
        locked: true,
        remainingMs: r.remainingMs ?? 0,
        error: 'Cuenta bloqueada por intentos fallidos.',
      });
      return;
    }
    set({ error: 'PIN incorrecto.' });
  },
  logout: () => set({ sessionToken: null, currentPanel: 'home', error: null }),
  setPanel: (currentPanel) => set({ currentPanel }),
  setPinIsDefault: (v) => set({ pinIsDefault: v }),
}));
```

- [ ] **Step 4: Implement useAdminConfig hook**

```ts
// src/renderer/hooks/useAdminConfig.ts
import { useCallback, useEffect, useState } from 'react';

import type { AppConfigDTO } from '../../shared/types.js';
import { useAdminStore } from '../store/adminStore.js';

export function useAdminConfig(): {
  config: AppConfigDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [config, setConfig] = useState<AppConfigDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionToken) {
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const cfg = await window.api.admin.getConfig({ sessionToken });
      setConfig(cfg);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando configuración');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { config, loading, error, reload };
}
```

- [ ] **Step 5: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- adminStore`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store/adminStore.ts src/renderer/hooks/useAdminConfig.ts tests/unit/store/adminStore.test.ts
git commit -m "feat(fase-3): adminStore zustand + useAdminConfig hook"
```

---

## Bloque D — Auth UX (Tasks 13-15)

### Task 13: PinInput primitivo

**Files:**
- Create: `src/renderer/components/PinInput.tsx`
- Create: `tests/unit/components/PinInput.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// tests/unit/components/PinInput.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PinInput } from '../../../src/renderer/components/PinInput.js';

describe('PinInput', () => {
  it('renderiza 4 inputs', () => {
    render(<PinInput value="" onChange={() => {}} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('llama onChange al teclear un dígito', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('ignora caracteres no numéricos', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'a' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aplica clase shake cuando shake=true', () => {
    const { container } = render(<PinInput value="" onChange={() => {}} shake />);
    expect(container.firstChild).toHaveClass('animate-shake');
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- PinInput`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PinInput**

```tsx
// src/renderer/components/PinInput.tsx
import { useEffect, useRef, type FC } from 'react';

interface PinInputProps {
  value: string;
  onChange: (next: string) => void;
  shake?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const PinInput: FC<PinInputProps> = ({ value, onChange, shake, disabled, autoFocus }) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const handleChange = (idx: number, raw: string): void => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (!cleaned) return;
    const digit = cleaned.slice(-1);
    const next = value.padEnd(4, ' ').split('');
    next[idx] = digit;
    const joined = next.join('').replace(/ /g, '').slice(0, 4);
    onChange(joined);
    if (idx < 3) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  return (
    <div className={`flex gap-2 ${shake ? 'animate-shake' : ''}`}>
      {[0, 1, 2, 3].map((idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[idx] ?? ''}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          aria-label={`PIN dígito ${idx + 1}`}
          className="h-14 w-12 rounded-md border border-border bg-surface text-center font-mono text-2xl text-textPrimary outline-none focus:border-accent focus:shadow-[0_0_0_2px_#18181B]"
        />
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Add shake keyframe to Tailwind config**

Modify `tailwind.config.ts` extending `theme.extend`:

```ts
// dentro de theme.extend
keyframes: {
  shake: {
    '0%, 100%': { transform: 'translateX(0)' },
    '20%, 60%': { transform: 'translateX(-4px)' },
    '40%, 80%': { transform: 'translateX(4px)' },
  },
},
animation: {
  shake: 'shake 200ms ease-out',
},
```

- [ ] **Step 5: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- PinInput`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PinInput.tsx tests/unit/components/PinInput.test.tsx tailwind.config.ts
git commit -m "feat(fase-3): PinInput con autoadvance y shake keyframe"
```

---

### Task 14: PinModal con lockout countdown

**Files:**
- Create: `src/renderer/components/PinModal.tsx`
- Create: `tests/unit/components/PinModal.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// tests/unit/components/PinModal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PinModal } from '../../../src/renderer/components/PinModal.js';

describe('PinModal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('llama onSubmit cuando el PIN tiene 4 dígitos', () => {
    const onSubmit = vi.fn();
    render(<PinModal open onClose={() => {}} onSubmit={onSubmit} error={null} locked={false} remainingMs={0} />);
    const inputs = screen.getAllByRole('textbox');
    ['1', '2', '3', '4'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('muestra el contador de lockout cuando locked=true', () => {
    render(
      <PinModal open onClose={() => {}} onSubmit={() => {}} error={null} locked remainingMs={120_000} />
    );
    expect(screen.getByText(/02:00/)).toBeInTheDocument();
  });

  it('muestra mensaje de error cuando se proporciona', () => {
    render(
      <PinModal open onClose={() => {}} onSubmit={() => {}} error="PIN incorrecto." locked={false} remainingMs={0} />
    );
    expect(screen.getByText('PIN incorrecto.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- PinModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PinModal**

```tsx
// src/renderer/components/PinModal.tsx
import { useEffect, useState, type FC } from 'react';

import { PinInput } from './PinInput.js';

interface PinModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  error: string | null;
  locked: boolean;
  remainingMs: number;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const PinModal: FC<PinModalProps> = ({ open, onClose, onSubmit, error, locked, remainingMs }) => {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [tickMs, setTickMs] = useState(remainingMs);

  useEffect(() => {
    setTickMs(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => {
      setTickMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const id = setTimeout(() => setShake(false), 250);
    return () => clearTimeout(id);
  }, [error]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
      onClick={onClose}
    >
      <div
        className="rounded-lg bg-surface p-8 shadow-card w-[360px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-textPrimary">PIN de Administración</h2>

        <PinInput value={pin} onChange={setPin} shake={shake} disabled={locked} autoFocus />

        {error ? (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}

        {locked ? (
          <p className="text-sm text-textSecondary">
            Bloqueado por intentos fallidos. Reintenta en{' '}
            <span className="font-mono text-textPrimary">{formatRemaining(tickMs)}</span>
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pin.length !== 4 || locked}
            onClick={() => onSubmit(pin)}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- PinModal`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PinModal.tsx tests/unit/components/PinModal.test.tsx
git commit -m "feat(fase-3): PinModal con lockout countdown y shake"
```

---

### Task 15: ChangePinWizard (3 pasos + validación D-018)

**Files:**
- Create: `src/renderer/components/ChangePinWizard.tsx`
- Create: `tests/unit/components/ChangePinWizard.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// tests/unit/components/ChangePinWizard.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChangePinWizard } from '../../../src/renderer/components/ChangePinWizard.js';

describe('ChangePinWizard', () => {
  it('paso 1 muestra mensaje de bienvenida y avanza al click', () => {
    render(<ChangePinWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/cambiar tu PIN/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    expect(screen.getByText(/elige tu nuevo PIN/i)).toBeInTheDocument();
  });

  it('rechaza PIN 0000 con mensaje', () => {
    render(<ChangePinWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    const inputs = screen.getAllByRole('textbox');
    ['0', '0', '0', '0'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    expect(screen.getByText(/no puedes usar 0000/i)).toBeInTheDocument();
  });

  it('llama onComplete con el PIN cuando confirmación coincide', () => {
    const onComplete = vi.fn();
    render(<ChangePinWizard onComplete={onComplete} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    let inputs = screen.getAllByRole('textbox');
    ['1', '3', '5', '7'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    inputs = screen.getAllByRole('textbox');
    ['1', '3', '5', '7'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onComplete).toHaveBeenCalledWith('1357');
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- ChangePinWizard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChangePinWizard**

```tsx
// src/renderer/components/ChangePinWizard.tsx
import { useState, type FC } from 'react';

import { PinInput } from './PinInput.js';

type Step = 'welcome' | 'new-pin' | 'confirm-pin';

interface ChangePinWizardProps {
  onComplete: (pin: string) => void;
  onCancel: () => void;
}

const RULE_HINTS: Array<{ test: (pin: string) => boolean; label: string }> = [
  { test: (p) => p.length === 4, label: 'Tiene exactamente 4 dígitos' },
  { test: (p) => /^[0-9]{4}$/.test(p), label: 'Solo dígitos' },
  { test: (p) => p !== '0000', label: 'No es 0000' },
  { test: (p) => p.length === 4 && new Set(p.split('')).size > 1, label: 'No todos iguales' },
  {
    test: (p) =>
      !(
        p.length === 4 &&
        Number(p[1]) === Number(p[0]) + 1 &&
        Number(p[2]) === Number(p[1]) + 1 &&
        Number(p[3]) === Number(p[2]) + 1
      ),
    label: 'No es secuencia ascendente',
  },
  {
    test: (p) =>
      !(
        p.length === 4 &&
        Number(p[1]) === Number(p[0]) - 1 &&
        Number(p[2]) === Number(p[1]) - 1 &&
        Number(p[3]) === Number(p[2]) - 1
      ),
    label: 'No es secuencia descendente',
  },
];

function firstError(pin: string): string | null {
  if (!pin) return null;
  if (pin.length !== 4) return null;
  if (!/^[0-9]{4}$/.test(pin)) return 'El PIN solo puede contener números.';
  if (pin === '0000') return 'No puedes usar 0000 como PIN.';
  if (new Set(pin.split('')).size === 1) return 'El PIN no puede tener todos los dígitos iguales.';
  if (
    Number(pin[1]) === Number(pin[0]) + 1 &&
    Number(pin[2]) === Number(pin[1]) + 1 &&
    Number(pin[3]) === Number(pin[2]) + 1
  )
    return 'El PIN no puede ser una secuencia ascendente.';
  if (
    Number(pin[1]) === Number(pin[0]) - 1 &&
    Number(pin[2]) === Number(pin[1]) - 1 &&
    Number(pin[3]) === Number(pin[2]) - 1
  )
    return 'El PIN no puede ser una secuencia descendente.';
  return null;
}

export const ChangePinWizard: FC<ChangePinWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const newPinError = firstError(newPin);
  const newPinValid = newPin.length === 4 && newPinError === null;
  const confirmError =
    confirmPin.length === 4 && confirmPin !== newPin ? 'La confirmación no coincide.' : null;

  return (
    <div className="rounded-lg bg-surface p-8 shadow-card w-[420px] flex flex-col gap-5">
      {step === 'welcome' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Tienes que cambiar tu PIN</h2>
          <p className="text-sm text-textSecondary">
            Por seguridad debes reemplazar el PIN de fábrica (0000) antes de continuar.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Más tarde
            </button>
            <button
              type="button"
              onClick={() => setStep('new-pin')}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
            >
              Comenzar
            </button>
          </div>
        </>
      )}

      {step === 'new-pin' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Elige tu nuevo PIN</h2>
          <PinInput value={newPin} onChange={setNewPin} autoFocus />

          {newPinError ? (
            <p className="text-sm text-error" role="alert">
              {newPinError}
            </p>
          ) : null}

          <ul className="space-y-1 text-sm text-textSecondary">
            {RULE_HINTS.map((r) => (
              <li
                key={r.label}
                className={r.test(newPin) ? 'text-success' : 'text-textSecondary'}
              >
                {r.test(newPin) ? '✓' : '·'} {r.label}
              </li>
            ))}
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('welcome')}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={!newPinValid}
              onClick={() => setStep('confirm-pin')}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </>
      )}

      {step === 'confirm-pin' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Confirma tu PIN</h2>
          <PinInput value={confirmPin} onChange={setConfirmPin} autoFocus />
          {confirmError ? (
            <p className="text-sm text-error" role="alert">
              {confirmError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('new-pin')}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={confirmPin !== newPin}
              onClick={() => onComplete(newPin)}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- ChangePinWizard`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ChangePinWizard.tsx tests/unit/components/ChangePinWizard.test.tsx
git commit -m "feat(fase-3): ChangePinWizard 3 pasos con D-018 hints"
```

---

## Bloque E — AdminView shell + Paneles (Tasks 16-22)

### Task 16: AdminNavRail + AdminView shell con AdminGate

**Files:**
- Create: `src/renderer/components/AdminNavRail.tsx`
- Create: `src/renderer/pages/AdminView.tsx`
- Create: `tests/unit/components/AdminView.test.tsx`

- [ ] **Step 1: Implement AdminNavRail**

```tsx
// src/renderer/components/AdminNavRail.tsx
import { type FC } from 'react';

import { useAdminStore, type AdminPanelKey } from '../store/adminStore.js';

const ITEMS: Array<{ key: AdminPanelKey; label: string }> = [
  { key: 'home', label: 'Inicio' },
  { key: 'printer', label: 'Impresora' },
  { key: 'router', label: 'Router' },
  { key: 'schedule', label: 'Programación' },
  { key: 'business', label: 'Negocio' },
  { key: 'stats', label: 'Estadísticas' },
  { key: 'logs', label: 'Logs' },
];

interface AdminNavRailProps {
  onLogout: () => void;
}

export const AdminNavRail: FC<AdminNavRailProps> = ({ onLogout }) => {
  const current = useAdminStore((s) => s.currentPanel);
  const setPanel = useAdminStore((s) => s.setPanel);

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-border bg-surface p-4">
      <h1 className="mb-6 px-2 text-base font-semibold text-textPrimary">Administración</h1>
      <nav className="flex-1 space-y-1">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPanel(item.key)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
              current === item.key
                ? 'bg-surfaceMuted text-textPrimary'
                : 'text-textSecondary hover:bg-surfaceMuted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-textSecondary hover:bg-surfaceMuted"
      >
        Cerrar sesión
      </button>
    </aside>
  );
};
```

- [ ] **Step 2: Write failing test for AdminView gate**

```tsx
// tests/unit/components/AdminView.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminView } from '../../../src/renderer/pages/AdminView.js';
import { useAdminStore } from '../../../src/renderer/store/adminStore.js';

beforeEach(() => {
  // @ts-expect-error - mock api
  globalThis.window = {
    api: {
      admin: {
        validatePin: vi.fn(async () => ({ ok: true, sessionToken: 't', pinIsDefault: false })),
        getConfig: vi.fn(async () => ({
          business: { name: 'X', footerMessage: 'Y', logoPath: null },
          schedule: { hour: 23, minute: 0, timezone: 'America/Mexico_City' },
          router: { host: '', user: '', model: '', ssidGuest: '' },
          admin: { pinIsDefault: false },
        })),
        getStats: vi.fn(async () => ({ summary: {} as never, daily: [] })),
        listLogs: vi.fn(async () => []),
        changePin: vi.fn(),
        updateConfig: vi.fn(),
        rotatePasswordNow: vi.fn(),
      },
    },
  };
  useAdminStore.setState({
    sessionToken: null,
    pinIsDefault: false,
    locked: false,
    remainingMs: 0,
    error: null,
    currentPanel: 'home',
  });
});

describe('AdminView gate', () => {
  it('muestra PinModal cuando no hay sessionToken', () => {
    render(<AdminView onExit={vi.fn()} />);
    expect(screen.getByText(/PIN de Administración/i)).toBeInTheDocument();
  });

  it('muestra el shell tras login exitoso (pinIsDefault=false)', async () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: false });
    render(<AdminView onExit={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Inicio')).toBeInTheDocument());
  });

  it('muestra ChangePinWizard cuando pinIsDefault=true', () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: true });
    render(<AdminView onExit={vi.fn()} />);
    expect(screen.getByText(/Tienes que cambiar tu PIN/i)).toBeInTheDocument();
  });

  it('cerrar sesión llama onExit', async () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: false });
    const onExit = vi.fn();
    render(<AdminView onExit={onExit} />);
    await waitFor(() => screen.getByText('Inicio'));
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(onExit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement AdminView**

```tsx
// src/renderer/pages/AdminView.tsx
import { type FC } from 'react';

import { AdminNavRail } from '../components/AdminNavRail.js';
import { ChangePinWizard } from '../components/ChangePinWizard.js';
import { PinModal } from '../components/PinModal.js';
import { useAdminStore } from '../store/adminStore.js';
import { BusinessPanel } from './admin/BusinessPanel.js';
import { HomePanel } from './admin/HomePanel.js';
import { LogsPanel } from './admin/LogsPanel.js';
import { PrinterPanel } from './admin/PrinterPanel.js';
import { RouterPanel } from './admin/RouterPanel.js';
import { SchedulePanel } from './admin/SchedulePanel.js';
import { StatsPanel } from './admin/StatsPanel.js';

interface AdminViewProps {
  onExit: () => void;
}

export const AdminView: FC<AdminViewProps> = ({ onExit }) => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const pinIsDefault = useAdminStore((s) => s.pinIsDefault);
  const error = useAdminStore((s) => s.error);
  const locked = useAdminStore((s) => s.locked);
  const remainingMs = useAdminStore((s) => s.remainingMs);
  const currentPanel = useAdminStore((s) => s.currentPanel);
  const attemptLogin = useAdminStore((s) => s.attemptLogin);
  const logout = useAdminStore((s) => s.logout);
  const setPinIsDefault = useAdminStore((s) => s.setPinIsDefault);

  if (!sessionToken) {
    return (
      <PinModal
        open
        onClose={onExit}
        onSubmit={(pin) => void attemptLogin(pin)}
        error={error}
        locked={locked}
        remainingMs={remainingMs}
      />
    );
  }

  if (pinIsDefault) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55">
        <ChangePinWizard
          onComplete={async (newPin) => {
            const r = await window.api.admin.changePin({
              sessionToken,
              currentPin: '0000',
              newPin,
            });
            if (r.ok) setPinIsDefault(false);
          }}
          onCancel={onExit}
        />
      </div>
    );
  }

  const panel =
    currentPanel === 'home' ? (
      <HomePanel />
    ) : currentPanel === 'printer' ? (
      <PrinterPanel />
    ) : currentPanel === 'router' ? (
      <RouterPanel />
    ) : currentPanel === 'schedule' ? (
      <SchedulePanel />
    ) : currentPanel === 'business' ? (
      <BusinessPanel />
    ) : currentPanel === 'stats' ? (
      <StatsPanel />
    ) : (
      <LogsPanel />
    );

  return (
    <div className="flex h-screen bg-background">
      <AdminNavRail onLogout={() => { logout(); onExit(); }} />
      <main className="flex-1 overflow-auto p-8">{panel}</main>
    </div>
  );
};
```

> **Stub note:** los siete panel imports (`HomePanel`, `PrinterPanel`, `RouterPanel`, `SchedulePanel`, `BusinessPanel`, `StatsPanel`, `LogsPanel`) son archivos que se crean en las tasks 17-21. Para que esta task compile, crear stubs vacíos al final del archivo así:

```tsx
// crear cada panel con un stub minimalista que se reemplaza después:
// src/renderer/pages/admin/HomePanel.tsx
import { type FC } from 'react';
export const HomePanel: FC = () => <p>Inicio (stub)</p>;
```

Y replicar el mismo patrón con `PrinterPanel`, `RouterPanel`, `SchedulePanel`, `BusinessPanel`, `StatsPanel`, `LogsPanel`. Cada task posterior reemplaza un stub.

- [ ] **Step 4: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- AdminView`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/AdminNavRail.tsx src/renderer/pages/AdminView.tsx src/renderer/pages/admin/*.tsx tests/unit/components/AdminView.test.tsx
git commit -m "feat(fase-3): AdminView shell con gate PIN+wizard y panel stubs"
```

---

### Task 17: HomePanel (dashboard salud + acciones rápidas)

**Files:**
- Modify: `src/renderer/pages/admin/HomePanel.tsx`

- [ ] **Step 1: Replace stub with real implementation**

```tsx
// src/renderer/pages/admin/HomePanel.tsx
import { useEffect, useState, type FC } from 'react';

import { useSystemHealth } from '../../hooks/useSystemHealth.js';
import { useAdminStore } from '../../store/adminStore.js';

export const HomePanel: FC = () => {
  const { health, isLoading, refetch } = useSystemHealth();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [rotating, setRotating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const triggerRotation = async (): Promise<void> => {
    if (!sessionToken) return;
    setRotating(true);
    setFeedback(null);
    try {
      const r = await window.api.admin.rotatePasswordNow({ sessionToken });
      setFeedback(r.message ?? (r.ok ? 'Rotación ejecutada.' : 'No fue posible rotar.'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Inicio</h1>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Salud del sistema</h2>
        {isLoading ? (
          <p className="text-sm text-textSecondary">Cargando…</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 text-sm">
            <li>
              Impresora:{' '}
              <span className={health?.printerOnline ? 'text-success' : 'text-error'}>
                {health?.printerOnline ? 'Activa' : 'Sin configurar'}
              </span>
            </li>
            <li>
              Contraseña:{' '}
              <span className={health?.passwordValid ? 'text-success' : 'text-error'}>
                {health?.passwordValid ? 'Vigente' : 'Sin definir'}
              </span>
            </li>
            <li>
              Router:{' '}
              <span className={health?.routerReachable ? 'text-success' : 'text-warning'}>
                {health?.routerReachable ? 'Alcanzable' : 'No verificado (Fase 4)'}
              </span>
            </li>
            <li>
              Scheduler:{' '}
              <span className={health?.schedulerRunning ? 'text-success' : 'text-warning'}>
                {health?.schedulerRunning ? 'Activo' : 'Pendiente (Fase 5)'}
              </span>
            </li>
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Acciones rápidas</h2>
        <button
          type="button"
          onClick={() => void triggerRotation()}
          disabled={rotating}
          className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:opacity-50"
        >
          {rotating ? 'Procesando…' : 'Rotar contraseña ahora'}
        </button>
        {feedback ? <p className="mt-3 text-sm text-textSecondary">{feedback}</p> : null}
      </section>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/admin/HomePanel.tsx
git commit -m "feat(fase-3): HomePanel dashboard salud + acción rotar"
```

---

### Task 18: PrinterPanel + DiscoveryModal

**Files:**
- Create: `src/renderer/components/DiscoveryModal.tsx`
- Modify: `src/renderer/pages/admin/PrinterPanel.tsx`
- Create: `tests/unit/components/DiscoveryModal.test.tsx`

- [ ] **Step 1: Write failing tests for DiscoveryModal**

```tsx
// tests/unit/components/DiscoveryModal.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscoveryModal } from '../../../src/renderer/components/DiscoveryModal.js';

const discoverMock = vi.fn();
const testConnectionMock = vi.fn();

beforeEach(() => {
  discoverMock.mockReset();
  testConnectionMock.mockReset();
  // @ts-expect-error
  globalThis.window = {
    api: {
      printer: { discover: discoverMock, testConnection: testConnectionMock },
    },
  };
});

describe('DiscoveryModal', () => {
  it('lista impresoras descubiertas con badge de tipo', async () => {
    discoverMock.mockResolvedValue([
      { identifier: 'p1', label: 'Aomus My A1', connection: 'bluetooth-ble', likelyEscPosCompatible: true },
      { identifier: 'p2', label: 'EPSON', connection: 'usb', likelyEscPosCompatible: true },
    ]);
    render(<DiscoveryModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Aomus My A1')).toBeInTheDocument());
    expect(screen.getByText('BLE')).toBeInTheDocument();
    expect(screen.getByText('USB')).toBeInTheDocument();
  });

  it('botón "Usar esta impresora" deshabilitado hasta test exitoso', async () => {
    discoverMock.mockResolvedValue([
      { identifier: 'p1', label: 'Aomus', connection: 'bluetooth-ble', likelyEscPosCompatible: true },
    ]);
    testConnectionMock.mockResolvedValue({ success: true, online: true, latencyMs: 100 });
    render(<DiscoveryModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByText('Aomus'));
    fireEvent.click(screen.getByText('Aomus'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /usar esta impresora/i })).not.toBeDisabled()
    );
  });
});
```

- [ ] **Step 2: Verify tests fail**

Run: `cd wifi-voucher-manager && npm run test -- DiscoveryModal`
Expected: FAIL.

- [ ] **Step 3: Implement DiscoveryModal**

```tsx
// src/renderer/components/DiscoveryModal.tsx
import { useEffect, useState, type FC } from 'react';

import type { DiscoveredPrinter, PrinterTestResult } from '../../shared/types.js';

interface DiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (p: DiscoveredPrinter) => void;
}

const BADGE_LABEL: Record<DiscoveredPrinter['connection'], string> = {
  usb: 'USB',
  bluetooth: 'BT',
  'bluetooth-ble': 'BLE',
};

export const DiscoveryModal: FC<DiscoveryModalProps> = ({ open, onClose, onSelect }) => {
  const [items, setItems] = useState<DiscoveredPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DiscoveredPrinter | null>(null);
  const [test, setTest] = useState<PrinterTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setItems([]);
    setSelected(null);
    setTest(null);
    void window.api.printer
      .discover()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!selected) return;
    setTesting(true);
    setTest(null);
    void window.api.printer
      .testConnection({
        connection: selected.connection,
        identifier: selected.identifier,
        width_chars: 32,
      })
      .then(setTest)
      .finally(() => setTesting(false));
  }, [selected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
      onClick={onClose}
    >
      <div
        className="flex h-[520px] w-[640px] flex-col gap-4 rounded-lg bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-textPrimary">Detectar impresoras</h2>
        {loading ? (
          <p className="text-sm text-textSecondary">Buscando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-textSecondary">No se encontraron impresoras.</p>
        ) : (
          <ul className="flex-1 space-y-2 overflow-auto">
            {items.map((p) => (
              <li key={p.identifier}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left text-sm ${
                    selected?.identifier === p.identifier
                      ? 'border-accent bg-surfaceMuted'
                      : 'border-border bg-surface hover:bg-surfaceMuted'
                  }`}
                >
                  <span className="rounded-sm bg-textPrimary px-2 py-0.5 font-mono text-xs text-accentForeground">
                    {BADGE_LABEL[p.connection]}
                  </span>
                  <span className="flex-1 text-textPrimary">{p.label}</span>
                  <span className="font-mono text-xs text-textSecondary">{p.identifier}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <div className="rounded-md border border-border bg-surfaceMuted p-3 text-sm text-textSecondary">
            {testing
              ? 'Probando conexión…'
              : test?.success
                ? `Conectado en ${test.latencyMs} ms.`
                : test
                  ? `Falló: ${test.errorMessage ?? 'sin detalle'}`
                  : 'Selecciona una impresora.'}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected || !test?.success}
            onClick={() => selected && onSelect(selected)}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Usar esta impresora
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Implement PrinterPanel**

```tsx
// src/renderer/pages/admin/PrinterPanel.tsx
import { useEffect, useState, type FC } from 'react';

import { DiscoveryModal } from '../../components/DiscoveryModal.js';
import type { DiscoveredPrinter, PrinterRecord } from '../../../shared/types.js';

export const PrinterPanel: FC = () => {
  const [records, setRecords] = useState<PrinterRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    setRecords(await window.api.printer.list());
  };

  useEffect(() => {
    void reload();
  }, []);

  const active = records.find((r) => r.active) ?? null;

  const handleSelected = async (p: DiscoveredPrinter): Promise<void> => {
    setOpen(false);
    setFeedback('Aún no se persiste el create — completar tras integrar printer:create en Fase 6.');
    // En esta fase solo activamos uno existente si coincide identifier; create CRUD viene después.
    const match = records.find((r) => r.identifier === p.identifier);
    if (match) {
      await window.api.printer.setActive(match.id);
      await reload();
      setFeedback(`Activada ${match.name}.`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Impresora</h1>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-3 text-lg font-medium text-textPrimary">Impresora activa</h2>
        {active ? (
          <div className="space-y-1 text-sm text-textSecondary">
            <p>
              <span className="text-textPrimary">{active.name}</span>{' '}
              <span className="ml-2 rounded-sm bg-surfaceMuted px-2 py-0.5 font-mono text-xs">
                {active.connection}
              </span>
            </p>
            <p className="font-mono text-xs">{active.identifier}</p>
          </div>
        ) : (
          <p className="text-sm text-textSecondary">No hay impresora activa.</p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
      >
        Detectar impresoras
      </button>

      {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}

      <DiscoveryModal open={open} onClose={() => setOpen(false)} onSelect={handleSelected} />
    </div>
  );
};
```

- [ ] **Step 5: Run tests**

Run: `cd wifi-voucher-manager && npm run test -- DiscoveryModal`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/DiscoveryModal.tsx src/renderer/pages/admin/PrinterPanel.tsx tests/unit/components/DiscoveryModal.test.tsx
git commit -m "feat(fase-3): PrinterPanel + DiscoveryModal con badges (D-019)"
```

---

### Task 19: SchedulePanel + BusinessPanel + RouterPanel placeholder

**Files:**
- Modify: `src/renderer/pages/admin/SchedulePanel.tsx`
- Modify: `src/renderer/pages/admin/BusinessPanel.tsx`
- Modify: `src/renderer/pages/admin/RouterPanel.tsx`

- [ ] **Step 1: Implement SchedulePanel**

```tsx
// src/renderer/pages/admin/SchedulePanel.tsx
import { useState, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const SchedulePanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const effectiveHour = hour ?? config?.schedule.hour ?? 23;
  const effectiveMinute = minute ?? config?.schedule.minute ?? 0;

  const save = async (): Promise<void> => {
    if (!sessionToken || !config) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'schedule',
      value: {
        hour: effectiveHour,
        minute: effectiveMinute,
        timezone: config.schedule.timezone,
      },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Programación</h1>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <p className="text-sm text-textSecondary">
          Hora diaria de rotación de la contraseña (zona horaria {config.schedule.timezone}).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={23}
            value={effectiveHour}
            onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
            className="h-10 w-20 rounded-md border border-border bg-surface text-center font-mono text-textPrimary"
          />
          <span className="font-mono text-textPrimary">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={effectiveMinute}
            onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
            className="h-10 w-20 rounded-md border border-border bg-surface text-center font-mono text-textPrimary"
          />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
        >
          Guardar
        </button>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>
    </div>
  );
};
```

- [ ] **Step 2: Implement BusinessPanel**

```tsx
// src/renderer/pages/admin/BusinessPanel.tsx
import { useEffect, useState, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const BusinessPanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [name, setName] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setName(config.business.name);
      setFooterMessage(config.business.footerMessage);
    }
  }, [config]);

  const save = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'business',
      value: { name, footerMessage, logoPath: config?.business.logoPath ?? null },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Negocio</h1>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Nombre del negocio
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Mensaje al pie del voucher
          <input
            type="text"
            value={footerMessage}
            onChange={(e) => setFooterMessage(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <p className="text-xs text-textMuted">Logo: drag-and-drop disponible en Fase 6.</p>
        <button
          type="button"
          onClick={() => void save()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
        >
          Guardar
        </button>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>
    </div>
  );
};
```

- [ ] **Step 3: Implement RouterPanel placeholder**

```tsx
// src/renderer/pages/admin/RouterPanel.tsx
import { type FC } from 'react';

export const RouterPanel: FC = () => {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Router</h1>
      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <p className="text-sm text-textSecondary">
          La integración con TP-Link Archer se completa en Fase 4 (bloqueada por compra del hardware).
          Por ahora la rotación se registra en el log pero no se aplica al router real.
        </p>
      </section>
    </div>
  );
};
```

- [ ] **Step 4: Type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/admin/SchedulePanel.tsx src/renderer/pages/admin/BusinessPanel.tsx src/renderer/pages/admin/RouterPanel.tsx
git commit -m "feat(fase-3): Schedule + Business + Router placeholder panels"
```

---

### Task 20: StatsPanel (Recharts BarChart)

**Files:**
- Modify: `src/renderer/pages/admin/StatsPanel.tsx`

- [ ] **Step 1: Implement StatsPanel**

```tsx
// src/renderer/pages/admin/StatsPanel.tsx
import { useEffect, useState, type FC } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StatsBundleDTO } from '../../../shared/types.js';
import { useAdminStore } from '../../store/adminStore.js';

export const StatsPanel: FC = () => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [bundle, setBundle] = useState<StatsBundleDTO | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    void window.api.admin.getStats({ sessionToken }).then(setBundle);
  }, [sessionToken]);

  if (!bundle) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Estadísticas</h1>

      <section className="grid grid-cols-3 gap-4">
        <Card label="Impresiones totales" value={bundle.summary.totalPrints} />
        <Card label="Exitosas" value={bundle.summary.successfulPrints} accent="success" />
        <Card label="Fallidas" value={bundle.summary.failedPrints} accent="error" />
        <Card label="Rotaciones totales" value={bundle.summary.totalRotations} />
        <Card label="Rotaciones OK" value={bundle.summary.successfulRotations} accent="success" />
      </section>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Impresiones diarias (14 días)</h2>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={bundle.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#18181B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

const Card: FC<{ label: string; value: number; accent?: 'success' | 'error' }> = ({
  label,
  value,
  accent,
}) => (
  <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
    <p className="text-xs uppercase tracking-wide text-textSecondary">{label}</p>
    <p
      className={`mt-1 font-mono text-2xl ${
        accent === 'success' ? 'text-success' : accent === 'error' ? 'text-error' : 'text-textPrimary'
      }`}
    >
      {value}
    </p>
  </div>
);
```

- [ ] **Step 2: Type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/admin/StatsPanel.tsx
git commit -m "feat(fase-3): StatsPanel con cards + Recharts BarChart 14 días"
```

---

### Task 21: LogsPanel (tabla + CSV export)

**Files:**
- Modify: `src/renderer/pages/admin/LogsPanel.tsx`

- [ ] **Step 1: Implement LogsPanel**

```tsx
// src/renderer/pages/admin/LogsPanel.tsx
import { useEffect, useState, type FC } from 'react';

import type { AuditLogEntryDTO } from '../../../shared/types.js';
import { useAdminStore } from '../../store/adminStore.js';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'print', label: 'Impresiones' },
  { value: 'password_rotation', label: 'Rotación' },
  { value: 'config_change', label: 'Configuración' },
  { value: 'admin_login', label: 'Login admin' },
  { value: 'error', label: 'Errores' },
];

function toCsv(rows: AuditLogEntryDTO[]): string {
  const header = 'id,event_type,created_at,payload\n';
  const escape = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  return (
    header +
    rows
      .map((r) => [r.id, r.event_type, r.created_at, escape(r.payload ?? '')].join(','))
      .join('\n')
  );
}

export const LogsPanel: FC = () => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [rows, setRows] = useState<AuditLogEntryDTO[]>([]);
  const [filter, setFilter] = useState('');

  const reload = async (): Promise<void> => {
    if (!sessionToken) return;
    const list = await window.api.admin.listLogs({
      sessionToken,
      limit: 500,
      ...(filter ? { eventType: filter } : {}),
    });
    setRows(list);
  };

  useEffect(() => {
    void reload();
  }, [filter, sessionToken]);

  const exportCsv = (): void => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Logs</h1>

      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
        >
          Exportar CSV
        </button>
      </div>

      <section className="rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-textSecondary">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Payload</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-textSecondary">
                  Sin eventos.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.id}</td>
                  <td className="px-4 py-2">{r.event_type}</td>
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.created_at}</td>
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.payload}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd wifi-voucher-manager && npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/admin/LogsPanel.tsx
git commit -m "feat(fase-3): LogsPanel tabla + filtro + export CSV"
```

---

## Bloque F — Integración (Tasks 22-24)

### Task 22: App.tsx — ruteo waiter ↔ admin

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/WaiterView.tsx`

- [ ] **Step 1: Update App.tsx**

```tsx
// src/renderer/App.tsx
import { useState, type FC } from 'react';

import { AdminView } from './pages/AdminView.js';
import { WaiterView } from './pages/WaiterView.js';

export const App: FC = () => {
  const [view, setView] = useState<'waiter' | 'admin'>('waiter');

  if (view === 'admin') {
    return <AdminView onExit={() => setView('waiter')} />;
  }
  return <WaiterView onOpenAdmin={() => setView('admin')} />;
};
```

- [ ] **Step 2: Update WaiterView to accept onOpenAdmin**

Modificar el `FC` y reemplazar el modal placeholder por la prop. En `src/renderer/pages/WaiterView.tsx`:

- Cambiar la firma a `interface WaiterViewProps { onOpenAdmin?: () => void; }` y `export const WaiterView: FC<WaiterViewProps> = ({ onOpenAdmin })`.
- Eliminar `const [pinModalOpen, setPinModalOpen] = useState(false);` y todo el bloque `{pinModalOpen ? (...)}`.
- Reemplazar `<SettingsGearButton onClick={() => setPinModalOpen(true)} />` por `<SettingsGearButton onClick={() => onOpenAdmin?.()} />`.

- [ ] **Step 3: Run existing WaiterView component test**

Run: `cd wifi-voucher-manager && npm run test -- WaiterView`
Expected: PASS (puede requerir ajuste menor del test si referenciaba el modal placeholder — actualizar entonces para no asumir el modal).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/pages/WaiterView.tsx tests/unit/components/WaiterView.test.tsx
git commit -m "feat(fase-3): App rutea waiter ↔ admin via SettingsGearButton"
```

---

### Task 23: Composition root — instanciar servicios y handlers admin

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/waiter.ts`

- [ ] **Step 1: Add electron-store integration in src/main/index.ts**

Importar y crear instancias de los nuevos servicios. El backend de electron-store recibe métodos `get/set` ya compatibles con `AppConfigBackend`. Reemplazar la sección entre `await runMigrations(db);` y `registerWaiterHandlers(...)`:

```ts
import Store from 'electron-store';

import { AuditLogRepository } from './db/repositories/AuditLogRepository.js';
import { registerAdminHandlers } from './ipc/admin.js';
import { createCredentialStorage } from './security/CredentialStorage.js';
import { AdminSession } from './services/AdminSession.js';
import { AppConfigStore } from './services/AppConfigStore.js';
import { LockoutTracker } from './services/LockoutTracker.js';
import { PinCrypto } from './services/PinCrypto.js';
import { StatsService } from './services/StatsService.js';

// ...
const store = new Store<Record<string, unknown>>({ name: 'app-config' });
const config = new AppConfigStore({
  get: (k, fallback) => (store.get(k) ?? fallback) as never,
  set: (k, v) => store.set(k, v),
});

// Sembrar PIN '0000' si nunca se ha configurado
const cfgNow = config.getAll();
if (!cfgNow.admin.pinHash) {
  const hash = await PinCrypto.hashPin('0000');
  config.updateAdmin({ pinHash: hash, pinIsDefault: true });
}

const audit = new AuditLogRepository(db);
const stats = new StatsService(db, audit);
const session = new AdminSession({ ttlMs: 30 * 60_000 });
const lockout = new LockoutTracker({ maxAttempts: 3, windowMs: 5 * 60_000 });
// safeStorage requiere app.whenReady(); ya estamos dentro de bootstrap llamado tras whenReady.
const credentials = createCredentialStorage();
void credentials; // se usará en Fase 4 (router.password)
```

- [ ] **Step 2: Update WaiterHandlerDeps to read business name & footer from AppConfigStore**

Cambiar la firma a aceptar `config: AppConfigStore` en lugar de `businessName` y `footerMessage` constantes:

```ts
// src/main/ipc/waiter.ts (cambios)
import type { AppConfigStore } from '../services/AppConfigStore.js';

export interface WaiterHandlerDeps {
  passwords: PasswordRepository;
  printers: PrinterRepository;
  qr: QRService;
  queue: PrintQueue;
  defaultSsid: string;
  config: AppConfigStore;
}
```

Y dentro del handler `waiter:print-voucher`, leer:
```ts
const cfg = deps.config.getAll();
// reemplazar deps.businessName por cfg.business.name
// reemplazar deps.footerMessage por cfg.business.footerMessage
```

- [ ] **Step 3: Wire handlers in src/main/index.ts**

```ts
registerWaiterHandlers({
  passwords,
  printers,
  qr,
  queue,
  defaultSsid: DEFAULT_SSID,
  config,
});

registerPrinterHandlers({ printers, jobs, queue, drivers });

registerAdminHandlers({ config, audit, stats, session, lockout });
```

Eliminar las constantes `DEFAULT_BUSINESS_NAME` y `DEFAULT_FOOTER` que ya no se usan.

- [ ] **Step 4: Run lint + type-check + tests**

Run: `cd wifi-voucher-manager && npm run lint && npm run type-check && npm run test`
Expected: 0 errores, todos los tests pasando.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/ipc/waiter.ts
git commit -m "feat(fase-3): wire AppConfigStore + admin handlers en composition root"
```

---

### Task 24: Smoke test manual — persistencia + flujo completo

- [ ] **Step 1: Levantar la app**

Run: `cd wifi-voucher-manager && npm run dev`
Esperado: ventana abre con `WaiterView`.

- [ ] **Step 2: Probar flujo PIN default + cambio**

1. Click en gear → `PinModal` abre.
2. Ingresar `0000` → entra a AdminView.
3. `ChangePinWizard` aparece (porque `pinIsDefault=true`).
4. Click "Comenzar" → ingresar `0000` → debe rechazar con mensaje rojo.
5. Ingresar `1357` → "Siguiente" → confirmar `1357` → wizard cierra.
6. Navegar paneles `Inicio`, `Impresora`, `Programación`, `Negocio`, `Estadísticas`, `Logs`.
7. En `Negocio`: cambiar nombre a "Restaurante Demo", guardar.

- [ ] **Step 3: Probar persistencia**

1. Cerrar la app (`Cmd+Q` / cerrar ventana).
2. Volver a abrir con `npm run dev`.
3. Click en gear → ingresar `1357` → entra sin wizard.
4. Verificar que `Negocio` muestra "Restaurante Demo".

- [ ] **Step 4: Probar lockout**

1. Salir de admin.
2. Click en gear → ingresar 3 PINs incorrectos.
3. Verificar mensaje de lockout con countdown 5 min.

- [ ] **Step 5: Verificar audit_log**

Run: `sqlite3 ~/Library/Application\ Support/wifi-voucher-manager/data.db 'select event_type, created_at from audit_log order by id desc limit 10'`
Esperado: ver eventos `admin_login`, `admin_pin_change`, `config_change`.

- [ ] **Step 6: Si todo OK, commit final + tag**

```bash
git commit --allow-empty -m "chore(fase-3): smoke manual completado — admin/PIN/persistencia OK"
git tag fase-3-complete -m "Fase 3: AdminView + PIN + 7 paneles"
```

---

## Self-review checklist (post-plan, pre-execution)

**Spec coverage (Sección 5 Fase 3):**
- ✅ PinCrypto + 7 reglas D-018 → Tasks 1-2
- ✅ LockoutTracker 3×5 min → Task 3
- ✅ AdminSession 32 bytes + TTL refresh → Task 4
- ✅ CredentialStorage interface + Mock + Safe + factory por env → Task 5
- ✅ AppConfigStore con tipos fuertes → Task 6
- ✅ admin.* IPC handlers con session token → Task 9
- ✅ AdminView shell 2-cols (240px nav) → Task 16
- ✅ PinModal con shake + countdown → Tasks 13-14
- ✅ ChangePinWizard 3 pasos D-018 → Task 15
- ✅ HomePanel dashboard → Task 17
- ✅ PrinterPanel + DiscoveryModal con badges (D-019) + testConnection auto + botón "Usar" disabled hasta éxito → Task 18
- ✅ SchedulePanel HH/MM picker → Task 19
- ✅ BusinessPanel (logo drag-drop diferido a Fase 6, justificado en panel) → Task 19
- ✅ RouterPanel placeholder → Task 19
- ✅ StatsPanel Recharts BarChart → Task 20
- ✅ LogsPanel tabla + CSV → Task 21
- ✅ Persistencia tras app.quit + relaunch → Task 24

**Acceptance criteria del spec:**
- ✅ PIN bloquea tras 3 fallos × 5 min con countdown — implementado en LockoutTracker + admin handler + PinModal.
- ✅ ChangePinWizard rechaza `0000` y las otras 6 reglas D-018.
- ✅ SSID/business name persiste tras `app.quit()` (electron-store).
- ✅ DiscoveryModal lanza testConnection automáticamente y deshabilita "Usar" hasta éxito.

**No-placeholders scan:** revisado — RouterPanel y "Aún no se persiste el create" en PrinterPanel son señalados como diferidos a fases posteriores con justificación visible (sin "TBD" suelto).

**Type consistency:** `AppConfigDTO` en shared/types.ts vs `AppConfig` en main coinciden por shape; los handlers solo devuelven el shape DTO. `ValidatePinResultDTO`, `ChangePinResultDTO`, `UpdateConfigResultDTO`, `StatsBundleDTO` y `AuditLogEntryDTO` están definidos antes de ser usados en preload (Task 11) y stores (Task 12).

---

## Notas operativas

- **Coverage gate Fase 3:** D-021 — services/ 70%, adapters/ 70%, repositories/ 60%, components/ 50%, hooks/ 60%. Verificar con `npm run test:coverage` antes del tag final si hay tiempo.
- **Visual review:** las pantallas usan tokens UX 5.6 (palette, typography, spacing, radii, shadows) — sin Material patterns, sin emojis, sin gradientes, sin sombras coloreadas. Revisar manualmente cada panel en dev.
- **Drag-drop logo (BusinessPanel):** marcado como Fase 6 deliberadamente para no inflar Fase 3. Está fuera del scope mínimo de "configuración persistente".
- **rotatePasswordNow:** stub en Fase 3 que solo registra en audit_log. La rotación real con backoff y commit atomic vive en Fase 5 (SchedulerService).
- **PIN del default:** se siembra automáticamente la primera vez que el composition root detecta `cfg.admin.pinHash === ''`. Esto sucede solo en instalaciones nuevas; instalaciones existentes (Fases 0-2) ya tendrán hash si pasaron por aquí (no aplica retroactivamente — las DBs existentes no tienen `admin` aún en `app-config.json`, por lo que el seed corre).

