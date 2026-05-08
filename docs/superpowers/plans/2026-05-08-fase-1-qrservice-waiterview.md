# Fase 1 — QRService + WaiterView básica + DB scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Electron arranca con WaiterView lista al startup. Mesero pulsa el botón gigante "Imprimir QR de WiFi" → la UI muestra modal con un QR escaneable generado desde el SSID y password vigente en SQLite. Paleta UX 5.6 aplicada con tokens TypeScript consumidos por Tailwind. Esquema de DB completo con 5 migraciones idempotentes.

**Architecture:** Backend services puros (`QRService`, `PasswordService`), repositorios Knex (`PasswordRepository`, `PrinterRepository`), IPC handlers `waiter.*` que el preload expone como `window.api.waiter.*`. Frontend con componentes primitivos (`PrintButton`, `HealthIndicator`, `Banner`, `Spinner`, `SettingsGearButton`), store Zustand `printStore`, hook `useSystemHealth` con poll cada 30s, y `WaiterView` con 5 estados visuales + modal de preview. Tokens UX 5.6 en `src/renderer/styles/tokens.ts` consumidos por `tailwind.config.ts`. En Fase 1 la "impresión" es solo preview (PNG dataUrl); la impresión real llega en Fase 2.

**Tech Stack:** TypeScript 5.6 strict, Knex 3.1 + better-sqlite3 12, qrcode 1.5, Zustand 5, React 18.3, Tailwind 3.4, Inter + JetBrains Mono self-hosted via @fontsource, vitest 2 + @testing-library/react 16, happy-dom 15.

**Referencias:**
- Spec: `docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md` (Sección 5 Fase 1)
- Plan v1.1 sección 5.6 (Lineamientos UX/UI — paleta exacta, tipografía, prohibiciones)
- DECISIONS.md: D-001 (argon2 — futuro), D-005 (Knex), D-007 (EscPos builder — futuro), D-021 (coverage thresholds escalonados)
- Plan Fase 0 ejecutado y mergeado: `docs/superpowers/plans/2026-05-07-fase-0-scaffolding.md` (tag `fase-0-complete`)

**Working directory:** `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager/`. Git repo padre en `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/`. Branch `main`.

**Pre-condiciones (verificar antes de Task 1):** `git log --oneline | head -1` muestra `829cd40 milestone(fase-0): COMPLETA`. Tag `fase-0-complete` existe. `npm run lint && npm run type-check && npm run test` exit 0 desde `wifi-voucher-manager/`.

---

## File Structure

**Crear durante Fase 1:**

```
wifi-voucher-manager/
├── tailwind.config.ts                  # consume tokens.ts via theme.extend
├── postcss.config.js                   # tailwindcss + autoprefixer
├── src/
│   ├── shared/
│   │   └── types.ts                    # IpcAPI con waiter namespace
│   ├── main/
│   │   ├── index.ts                    # MODIFY: composition root + IPC handlers
│   │   ├── ipc/
│   │   │   └── waiter.ts               # registerWaiterHandlers
│   │   ├── services/
│   │   │   ├── QRService.ts            # formatPayload + generate
│   │   │   └── PasswordService.ts      # generate static
│   │   └── db/
│   │       ├── migrations/
│   │       │   ├── 20260508_120000_init_system.ts
│   │       │   ├── 20260508_120100_passwords.ts
│   │       │   ├── 20260508_120200_print_log.ts
│   │       │   ├── 20260508_120300_config_audit.ts
│   │       │   └── 20260508_120400_printers.ts
│   │       └── repositories/
│   │           ├── PasswordRepository.ts
│   │           └── PrinterRepository.ts
│   ├── preload/
│   │   └── index.ts                    # MODIFY: window.api.waiter.* namespace
│   └── renderer/
│       ├── main.tsx                    # MODIFY: import fonts + global.css
│       ├── App.tsx                     # MODIFY: render WaiterView
│       ├── styles/
│       │   ├── tokens.ts               # palette + typography + spacing + radii + shadows + transitions + iconSizes + zIndex
│       │   ├── fonts.ts                # imports @fontsource Inter + JetBrains Mono
│       │   └── global.css              # @tailwind directives + body defaults + focus-visible
│       ├── components/
│       │   ├── Spinner.tsx             # 3 dots animados
│       │   ├── HealthIndicator.tsx     # dot + label
│       │   ├── Banner.tsx              # banner inline persistente borde 3px
│       │   ├── PrintButton.tsx         # botón gigante con loading
│       │   └── SettingsGearButton.tsx  # icono engrane esquina inferior derecha
│       ├── hooks/
│       │   └── useSystemHealth.ts      # poll 30s
│       ├── store/
│       │   └── printStore.ts           # zustand: status + lastError + lastPreviewDataUrl + print()
│       └── pages/
│           └── WaiterView.tsx          # 5 estados + modal preview
└── tests/
    ├── unit/
    │   ├── services/
    │   │   ├── QRService.test.ts       # ≥10 casos formatPayload + generate
    │   │   └── PasswordService.test.ts # 10000 iter charset + uniqueness
    │   └── components/
    │       ├── Spinner.test.tsx
    │       ├── HealthIndicator.test.tsx
    │       ├── Banner.test.tsx
    │       ├── PrintButton.test.tsx
    │       └── WaiterView.test.tsx     # snapshots de 5 estados
    └── integration/
        ├── migrations.test.ts          # corre las 5 + verifica schemas + idempotencia
        ├── PasswordRepository.test.ts  # CRUD + setActive invariante
        └── PrinterRepository.test.ts   # CRUD + setActive
```

**Modificar:**
- `src/main/index.ts` — instanciar servicios + registrar IPC handlers + ejecutar migraciones al startup
- `src/preload/index.ts` — exponer `window.api.waiter.*`
- `src/shared/types.ts` — `IpcAPI` con `waiter` namespace
- `src/renderer/main.tsx` — importar fonts + global.css
- `src/renderer/App.tsx` — montar `<WaiterView />`
- `index.html` — agregar `<body class="...">` con Tailwind
- `vitest.config.ts` — habilitar threshold 85% para `src/main/services/QRService.ts` (D-021)

---

## Tareas

### Task 1: PasswordService — generación criptográficamente segura

**Files:**
- Create: `wifi-voucher-manager/src/main/services/PasswordService.ts`
- Create: `wifi-voucher-manager/tests/unit/services/PasswordService.test.ts`

- [ ] **Step 1: Crear el directorio de tests**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p tests/unit/services
```

- [ ] **Step 2: Escribir el test fallido (TDD)**

Crear `tests/unit/services/PasswordService.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { PasswordService } from '../../../src/main/services/PasswordService.js';

describe('PasswordService', () => {
  describe('CHARSET y LENGTH', () => {
    it('CHARSET excluye chars confundibles y reservados WIFI:', () => {
      expect(PasswordService.CHARSET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      expect(PasswordService.CHARSET).not.toContain('0');
      expect(PasswordService.CHARSET).not.toContain('O');
      expect(PasswordService.CHARSET).not.toContain('1');
      expect(PasswordService.CHARSET).not.toContain('I');
      expect(PasswordService.CHARSET).not.toContain('l');
      expect(PasswordService.CHARSET).not.toContain('\\');
      expect(PasswordService.CHARSET).not.toContain(';');
      expect(PasswordService.CHARSET).not.toContain(',');
      expect(PasswordService.CHARSET).not.toContain(':');
      expect(PasswordService.CHARSET).not.toContain('"');
    });

    it('LENGTH es 10', () => {
      expect(PasswordService.LENGTH).toBe(10);
    });
  });

  describe('generate()', () => {
    it('produce string de 10 chars', () => {
      const pwd = PasswordService.generate();
      expect(pwd).toHaveLength(10);
    });

    it('todos los chars están en el CHARSET (10000 iteraciones)', () => {
      for (let i = 0; i < 10_000; i++) {
        const pwd = PasswordService.generate();
        for (const c of pwd) {
          expect(PasswordService.CHARSET).toContain(c);
        }
      }
    });

    it('no produce colisiones en 10000 iteraciones', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 10_000; i++) {
        seen.add(PasswordService.generate());
      }
      expect(seen.size).toBe(10_000);
    });

    it('distribución uniforme: cada char aparece al menos N/charset.length × 0.5 veces', () => {
      const counts = new Map<string, number>();
      const N = 10_000;
      for (let i = 0; i < N; i++) {
        for (const c of PasswordService.generate()) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      }
      const expectedPerChar = (N * PasswordService.LENGTH) / PasswordService.CHARSET.length;
      const minAcceptable = expectedPerChar * 0.5;
      for (const c of PasswordService.CHARSET) {
        expect(counts.get(c) ?? 0).toBeGreaterThan(minAcceptable);
      }
    });
  });

  describe('isValidCharset()', () => {
    it('acepta strings con chars del charset', () => {
      expect(PasswordService.isValidCharset('ABCD23PQRS')).toBe(true);
      expect(PasswordService.isValidCharset('XYZK7M3PQA')).toBe(true);
    });

    it('rechaza chars fuera del charset', () => {
      expect(PasswordService.isValidCharset('abcd23pqrs')).toBe(false);
      expect(PasswordService.isValidCharset('ABCD0123IL')).toBe(false);
      expect(PasswordService.isValidCharset('AB CD23PQR')).toBe(false);
      expect(PasswordService.isValidCharset('AB:CD23PQR')).toBe(false);
    });

    it('rechaza string vacío', () => {
      expect(PasswordService.isValidCharset('')).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Correr tests para confirmar que fallan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PasswordService 2>&1 | tail -10
```

Expected: FAIL con "Cannot find module '.../PasswordService.js'".

- [ ] **Step 4: Implementar PasswordService**

Crear `src/main/services/PasswordService.ts`:

```typescript
import { randomInt } from 'node:crypto';

export class PasswordService {
  static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static readonly LENGTH = 10;

  static generate(): string {
    const charset = PasswordService.CHARSET;
    const len = PasswordService.LENGTH;
    let result = '';
    for (let i = 0; i < len; i++) {
      result += charset[randomInt(0, charset.length)];
    }
    return result;
  }

  static isValidCharset(s: string): boolean {
    if (s.length === 0) return false;
    const charset = PasswordService.CHARSET;
    for (const c of s) {
      if (!charset.includes(c)) return false;
    }
    return true;
  }
}
```

- [ ] **Step 5: Correr tests para confirmar que pasan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PasswordService 2>&1 | tail -15
```

Expected: 9 tests passed (CHARSET ×1, LENGTH ×1, generate ×4, isValidCharset ×3), exit 0.

- [ ] **Step 6: Verificar lint + type-check pasan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/services/PasswordService.ts wifi-voucher-manager/tests/unit/services/PasswordService.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add PasswordService with crypto-secure generation (Task 1)

Static class:
- CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' (32 chars, excludes 0/O/1/I/l
  for human readability + \;,:" reserved by WIFI: payload format)
- LENGTH = 10
- generate() uses node:crypto.randomInt (NOT Math.random)
- isValidCharset() guards against insertion of invalid chars

Tests (9 cases): charset content, length, generate output, 10k iter
no-collisions, 10k iter uniform distribution within 50% of expected
mean, isValidCharset positive + negative cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: QRService.formatPayload — escape WIFI: format

**Files:**
- Create: `wifi-voucher-manager/src/main/services/QRService.ts` (parcial — solo `formatPayload` + `escapeWifiValue`)
- Create: `wifi-voucher-manager/tests/unit/services/QRService.test.ts` (≥10 casos formatPayload + escape)

- [ ] **Step 1: Escribir tests de formatPayload (TDD)**

Crear `tests/unit/services/QRService.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { QRService } from '../../../src/main/services/QRService.js';

describe('QRService.escapeWifiValue', () => {
  it('escapa el caracter ;', () => {
    expect(QRService.escapeWifiValue('foo;bar')).toBe('foo\\;bar');
  });

  it('escapa el caracter :', () => {
    expect(QRService.escapeWifiValue('foo:bar')).toBe('foo\\:bar');
  });

  it('escapa el caracter ,', () => {
    expect(QRService.escapeWifiValue('foo,bar')).toBe('foo\\,bar');
  });

  it('escapa el caracter "', () => {
    expect(QRService.escapeWifiValue('foo"bar')).toBe('foo\\"bar');
  });

  it('escapa el caracter \\', () => {
    expect(QRService.escapeWifiValue('foo\\bar')).toBe('foo\\\\bar');
  });

  it('preserva strings sin chars especiales', () => {
    expect(QRService.escapeWifiValue('Restaurante123')).toBe('Restaurante123');
  });
});

describe('QRService.formatPayload', () => {
  it('formato base con WPA y hidden=false', () => {
    const payload = QRService.formatPayload({
      ssid: 'Restaurante-Clientes',
      password: 'ABCD23PQRS',
    });
    expect(payload).toBe('WIFI:T:WPA;S:Restaurante-Clientes;P:ABCD23PQRS;H:false;;');
  });

  it('hidden=true se escribe como H:true', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestSSID',
      password: 'pwd123',
      hidden: true,
    });
    expect(payload).toBe('WIFI:T:WPA;S:TestSSID;P:pwd123;H:true;;');
  });

  it('security=WEP se aplica como T:WEP', () => {
    const payload = QRService.formatPayload({
      ssid: 'OldNet',
      password: 'wepkey',
      security: 'WEP',
    });
    expect(payload).toContain('T:WEP;');
  });

  it('security=nopass omite el campo P:', () => {
    const payload = QRService.formatPayload({
      ssid: 'OpenNet',
      password: '',
      security: 'nopass',
    });
    expect(payload).toBe('WIFI:T:nopass;S:OpenNet;H:false;;');
    expect(payload).not.toContain('P:');
  });

  it('SSID con punto y coma se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'Cafe;Bar',
      password: 'pwd',
    });
    expect(payload).toContain('S:Cafe\\;Bar');
  });

  it('password con dos puntos se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p:assword',
    });
    expect(payload).toContain('P:p\\:assword');
  });

  it('password con backslash se escapa doble', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p\\assword',
    });
    expect(payload).toContain('P:p\\\\assword');
  });

  it('password con coma se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p,assword',
    });
    expect(payload).toContain('P:p\\,assword');
  });

  it('password con comilla doble se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p"assword',
    });
    expect(payload).toContain('P:p\\"assword');
  });

  it('SSID con caracteres UTF-8 acentuados se preserva tal cual', () => {
    const payload = QRService.formatPayload({
      ssid: 'CaféMéxico',
      password: 'XK7P3M9Q2A',
    });
    expect(payload).toContain('S:CaféMéxico');
  });

  it('default security es WPA cuando no se especifica', () => {
    const payload = QRService.formatPayload({
      ssid: 'X',
      password: 'y',
    });
    expect(payload).toContain('T:WPA;');
  });
});
```

- [ ] **Step 2: Correr tests para confirmar que fallan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- QRService 2>&1 | tail -10
```

Expected: FAIL con "Cannot find module '.../QRService.js'".

- [ ] **Step 3: Implementar QRService.formatPayload + escapeWifiValue**

Crear `src/main/services/QRService.ts`:

```typescript
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface QRGenerateInput {
  ssid: string;
  password: string;
  security?: WifiSecurity;
  hidden?: boolean;
}

export class QRService {
  static escapeWifiValue(value: string): string {
    return value.replace(/[\\;,:"]/g, (m) => `\\${m}`);
  }

  static formatPayload(input: QRGenerateInput): string {
    const security: WifiSecurity = input.security ?? 'WPA';
    const ssidEscaped = QRService.escapeWifiValue(input.ssid);
    const hidden = input.hidden === true ? 'true' : 'false';

    if (security === 'nopass') {
      return `WIFI:T:nopass;S:${ssidEscaped};H:${hidden};;`;
    }

    const passwordEscaped = QRService.escapeWifiValue(input.password);
    return `WIFI:T:${security};S:${ssidEscaped};P:${passwordEscaped};H:${hidden};;`;
  }
}
```

- [ ] **Step 4: Correr tests para confirmar que pasan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- QRService 2>&1 | tail -15
```

Expected: 17 passed (6 escape + 11 formatPayload), exit 0.

- [ ] **Step 5: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/services/QRService.ts wifi-voucher-manager/tests/unit/services/QRService.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add QRService.formatPayload + escapeWifiValue (Task 2)

Static methods:
- escapeWifiValue(value): prepends \\ to each of \;,:" per IEEE 802.11u
  WIFI: format spec
- formatPayload({ssid, password, security?, hidden?}): produces
  'WIFI:T:WPA;S:...;P:...;H:false;;' string. security defaults to WPA.
  When security='nopass', omits the P: field entirely (open networks).

Tests (17 cases): all 5 reserved chars escape correctly, SSID and
password fields independently, default WPA, WEP variant, nopass
omits password, hidden=true|false, UTF-8 SSIDs preserved (qrcode
encodes UTF-8 internally).

generate() (PNG buffer + dataUrl) lands in Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: QRService.generate — PNG buffer + dataUrl

**Files:**
- Modify: `wifi-voucher-manager/src/main/services/QRService.ts` (agregar `generate`)
- Modify: `wifi-voucher-manager/tests/unit/services/QRService.test.ts` (agregar tests)

- [ ] **Step 1: Escribir tests de generate (TDD)**

Append al archivo `tests/unit/services/QRService.test.ts` (justo antes del último `});` del describe outer, o como nuevo describe block al final):

```typescript
describe('QRService.generate (instancia)', () => {
  it('produce PNG buffer válido y dataUrl matching', async () => {
    const svc = new QRService();
    const out = await svc.generate({
      ssid: 'Restaurante',
      password: 'ABCD23PQRS',
    });

    // PNG magic bytes
    expect(out.pngBuffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(out.pngBuffer.length).toBeGreaterThan(100);

    // dataUrl
    expect(out.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const base64Part = out.dataUrl.replace('data:image/png;base64,', '');
    expect(Buffer.from(base64Part, 'base64')).toEqual(out.pngBuffer);

    // payload string
    expect(out.payload).toBe('WIFI:T:WPA;S:Restaurante;P:ABCD23PQRS;H:false;;');
  });

  it('errorCorrectionLevel M produce QR escaneable razonable (~384px width)', async () => {
    const svc = new QRService();
    const out = await svc.generate({
      ssid: 'TestNet',
      password: 'pwdpwd',
    });
    // 384x384 approximate. Real qrcode lib decides exact pixel count based on payload size.
    // We just check the buffer is "big enough" — at least 1KB for a non-trivial QR.
    expect(out.pngBuffer.length).toBeGreaterThan(1000);
  });

  it('formato nopass funciona end-to-end', async () => {
    const svc = new QRService();
    const out = await svc.generate({
      ssid: 'OpenNet',
      password: '',
      security: 'nopass',
    });
    expect(out.payload).toBe('WIFI:T:nopass;S:OpenNet;H:false;;');
    expect(out.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr tests para verificar fallo**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- QRService 2>&1 | tail -15
```

Expected: 17 pasan, 3 fallan con "QRService is not a constructor" o similar (porque QRService está exportado solo con métodos estáticos).

- [ ] **Step 3: Implementar generate() agregando interfaz instance**

Reemplazar contenido completo de `src/main/services/QRService.ts`:

```typescript
import QRCode from 'qrcode';

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface QRGenerateInput {
  ssid: string;
  password: string;
  security?: WifiSecurity;
  hidden?: boolean;
}

export interface QRGenerateOutput {
  payload: string;
  pngBuffer: Buffer;
  dataUrl: string;
}

export class QRService {
  static escapeWifiValue(value: string): string {
    return value.replace(/[\\;,:"]/g, (m) => `\\${m}`);
  }

  static formatPayload(input: QRGenerateInput): string {
    const security: WifiSecurity = input.security ?? 'WPA';
    const ssidEscaped = QRService.escapeWifiValue(input.ssid);
    const hidden = input.hidden === true ? 'true' : 'false';

    if (security === 'nopass') {
      return `WIFI:T:nopass;S:${ssidEscaped};H:${hidden};;`;
    }

    const passwordEscaped = QRService.escapeWifiValue(input.password);
    return `WIFI:T:${security};S:${ssidEscaped};P:${passwordEscaped};H:${hidden};;`;
  }

  async generate(input: QRGenerateInput): Promise<QRGenerateOutput> {
    const payload = QRService.formatPayload(input);
    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 384,
      margin: 0,
      color: {
        dark: '#000000FF',
        light: '#FFFFFFFF',
      },
    });
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    return { payload, pngBuffer, dataUrl };
  }
}
```

- [ ] **Step 4: Correr tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- QRService 2>&1 | tail -15
```

Expected: 20 passed (17 antes + 3 nuevos), exit 0.

- [ ] **Step 5: Verificar coverage de QRService cumple 85% (D-021)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test:coverage -- QRService 2>&1 | grep -E "(QRService|All files)" | head -5
```

Expected: `QRService.ts | 100 | 100 | 100 | 100` (o ≥85% en cada columna). Si no llega, agregar más tests para cubrir las branches.

- [ ] **Step 6: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/services/QRService.ts wifi-voucher-manager/tests/unit/services/QRService.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add QRService.generate (PNG buffer + dataUrl) (Task 3)

Instance method generate(input) async:
- Calls QRCode.toBuffer with errorCorrectionLevel:'M' (15% redundancy
  per spec: 'L' produces artifacts when printed on thermal paper),
  width:384 (≈25mm at 203DPI thermal), margin:0 (template handles
  layout), color:{dark:#000000FF, light:#FFFFFFFF} (full opacity RGBA
  to avoid pngjs paletted-color edge cases noted in B10 risk).
- Returns { payload, pngBuffer, dataUrl } where dataUrl =
  'data:image/png;base64,' + buffer.toString('base64').

Tests (3 new, 20 total): PNG magic bytes + dataUrl roundtrip,
buffer size lower bound, nopass variant end-to-end.

Coverage: QRService.ts at 100% (>D-021 threshold of 85%).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: shared/types.ts — IpcAPI con waiter namespace

**Files:**
- Modify: `wifi-voucher-manager/src/shared/types.ts` (reemplaza el `export {};` actual)

- [ ] **Step 1: Reemplazar contenido de `src/shared/types.ts`**

```typescript
export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
}

export interface PrintVoucherPreviewResult {
  ok: true;
  ssid: string;
  password: string;
  payload: string;
  dataUrl: string;
}

export interface PrintVoucherPreviewError {
  ok: false;
  code: 'NO_ACTIVE_PASSWORD' | 'NO_SSID_CONFIGURED' | 'GENERATE_FAILED';
  message: string;
}

export type PrintVoucherResult = PrintVoucherPreviewResult | PrintVoucherPreviewError;

export interface WaiterAPI {
  getCurrentSSID: () => Promise<string>;
  getSystemHealth: () => Promise<SystemHealth>;
  printVoucher: () => Promise<PrintVoucherResult>;
}

export interface IpcAPI {
  waiter: WaiterAPI;
  // admin / printer / router / stats land in later phases
}
```

- [ ] **Step 2: Verificar type-check pasa**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run type-check
```

Expected: exit 0.

- [ ] **Step 3: Verificar lint pasa**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/shared/types.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add IpcAPI shared types with waiter namespace (Task 4)

Defines:
- SystemHealth (full shape used by getSystemHealth in all phases)
- PrintVoucherResult discriminated union (ok:true with payload+dataUrl
  or ok:false with structured error code for renderer to map to i18n
  messages)
- WaiterAPI: 3 methods exposed via window.api.waiter.*
- IpcAPI: union of namespaces (only waiter populated in Fase 1; admin/
  printer/router/stats join in later phases)

Replaces the empty `export {};` placeholder from Fase 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migration 1 — system_info table

**Files:**
- Create: `wifi-voucher-manager/src/main/db/migrations/20260508_120000_init_system.ts`

- [ ] **Step 1: Crear el archivo de migración**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('system_info');
  if (exists) return;

  await knex.schema.createTable('system_info', (t) => {
    t.text('key').primary();
    t.text('value').notNullable();
    t.text('updated_at').notNullable();
  });

  const now = new Date().toISOString();
  await knex('system_info').insert([
    { key: 'schema_version', value: '1', updated_at: now },
    { key: 'app_version_last_run', value: '0.0.0', updated_at: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_info');
}
```

- [ ] **Step 2: Verificar que el archivo lo recoge knex**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate 2>&1 | tail -5
```

Expected: stdout muestra `Aplicadas 1 migraciones (batch 1):` con `20260508_120000_init_system.ts`. Exit 0.

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/migrations/20260508_120000_init_system.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add migration init_system (Task 5)

Creates system_info(key TEXT PRIMARY KEY, value TEXT NOT NULL,
updated_at TEXT NOT NULL) and seeds 2 rows:
- schema_version = '1'
- app_version_last_run = '0.0.0' (updated by main process at startup
  in later phase to detect upgrades)

Idempotent: checks hasTable before createTable so re-running
migrate.latest() over an existing database is a no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Migration 2 — passwords table

**Files:**
- Create: `wifi-voucher-manager/src/main/db/migrations/20260508_120100_passwords.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('passwords');
  if (exists) return;

  await knex.schema.createTable('passwords', (t) => {
    t.increments('id').primary();
    t.text('password').notNullable();
    t.text('ssid').notNullable();
    t.text('created_at')
      .notNullable()
      .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    t.integer('active').notNullable().defaultTo(0);
    t.text('rotated_by').notNullable();
    t.text('router_response');
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_passwords_active ON passwords(active)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_passwords_created ON passwords(created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('passwords');
}
```

- [ ] **Step 2: Re-correr migrate y validar**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate 2>&1 | tail -5
```

Expected: 2 migraciones aplicadas (system_info + passwords).

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/migrations/20260508_120100_passwords.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add migration passwords (Task 6)

passwords table:
- id INTEGER PK auto-increment
- password TEXT NOT NULL
- ssid TEXT NOT NULL
- created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
- active INTEGER NOT NULL DEFAULT 0  -- 0|1
- rotated_by TEXT NOT NULL  -- 'auto'|'manual'|'seed'
- router_response TEXT  -- JSON, nullable

Indexes: idx_passwords_active, idx_passwords_created.

Invariant "only one active=1 row" enforced in PasswordRepository
(Task 11) via transaction in setActive(). Not enforced at DB level
because SQLite partial-unique-indexes are awkward to revoke if needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Migration 3 — print_log table

**Files:**
- Create: `wifi-voucher-manager/src/main/db/migrations/20260508_120200_print_log.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('print_log');
  if (exists) return;

  await knex.schema.createTable('print_log', (t) => {
    t.increments('id').primary();
    t.integer('password_id').notNullable().references('id').inTable('passwords');
    t.text('printed_at')
      .notNullable()
      .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    t.integer('success').notNullable();
    t.text('error_message');
    t.text('job_id');
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_log_date ON print_log(printed_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_log_password ON print_log(password_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('print_log');
}
```

- [ ] **Step 2: Validar**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate 2>&1 | tail -5
```

Expected: 3 migraciones aplicadas.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/migrations/20260508_120200_print_log.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add migration print_log (Task 7)

print_log table tracks every print attempt (success or failure):
- id, password_id (FK to passwords.id), printed_at, success (0|1),
  error_message (nullable), job_id (soft FK to print_job — table
  arrives in Task 9, no enforced FK to allow ordering flexibility)

Indexes: idx_print_log_date (queries by date for stats),
idx_print_log_password (FK lookup).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Migration 4 — config + audit_log tables

**Files:**
- Create: `wifi-voucher-manager/src/main/db/migrations/20260508_120300_config_audit.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('config');
  if (!configExists) {
    await knex.schema.createTable('config', (t) => {
      t.text('key').primary();
      t.text('value').notNullable();
      t.text('updated_at').notNullable();
    });
  }

  const auditExists = await knex.schema.hasTable('audit_log');
  if (!auditExists) {
    await knex.schema.createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.text('event_type').notNullable();
      t.text('payload');
      t.text('created_at')
        .notNullable()
        .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('config');
}
```

- [ ] **Step 2: Validar**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate 2>&1 | tail -5
```

Expected: 4 migraciones aplicadas.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/migrations/20260508_120300_config_audit.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add migrations config + audit_log (Task 8)

config table (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT):
fallback K-V store. Most settings live in electron-store (D-017);
this table holds anything that needs SQL-level joins or schema-version
gates in future migrations.

audit_log table (id, event_type, payload JSON, created_at):
records 'password_rotation' | 'print' | 'config_change' | 'error' |
'health_check' events with structured payloads. Indexed by event_type
and created_at for the Logs panel in AdminView (Phase 3).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Migration 5 — printer + print_job tables

**Files:**
- Create: `wifi-voucher-manager/src/main/db/migrations/20260508_120400_printers.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const printerExists = await knex.schema.hasTable('printer');
  if (!printerExists) {
    await knex.schema.createTable('printer', (t) => {
      t.text('id').primary();
      t.text('name').notNullable();
      t.text('connection').notNullable();
      t.text('identifier').notNullable();
      t.integer('width_chars').notNullable();
      t.integer('active').notNullable().defaultTo(1);
      t.text('notes');
    });
  }

  const jobExists = await knex.schema.hasTable('print_job');
  if (!jobExists) {
    await knex.schema.createTable('print_job', (t) => {
      t.text('id').primary();
      t.text('printer_id').notNullable().references('id').inTable('printer');
      t.text('use_case').notNullable();
      t.text('payload_data').notNullable();
      t.text('status').notNullable();
      t.integer('attempts').notNullable().defaultTo(0);
      t.text('last_error');
      t.text('triggered_by');
      t.text('created_at')
        .notNullable()
        .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
      t.text('printed_at');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_status ON print_job(status)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_printer ON print_job(printer_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_created ON print_job(created_at)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('print_job');
  await knex.schema.dropTableIfExists('printer');
}
```

- [ ] **Step 2: Validar 5 migraciones aplicadas**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate 2>&1 | tail -8
```

Expected: 5 migraciones aplicadas en orden.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/migrations/20260508_120400_printers.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add migrations printer + print_job (Task 9)

printer table:
- id TEXT PK (uuid generated by repository)
- name TEXT, connection TEXT ('usb'|'bluetooth'|'bluetooth-ble'),
  identifier TEXT (canonical format per D-008), width_chars INTEGER
  (32 for 58mm, 48 for 80mm), active INTEGER (1 = currently used),
  notes TEXT

print_job table (queue per D-009):
- id TEXT PK (uuid), printer_id TEXT FK to printer.id, use_case TEXT
  ('voucher' for now, 'diagnostic' future), payload_data TEXT (JSON),
  status TEXT ('pending'|'printed'|'failed'), attempts INTEGER,
  last_error TEXT, triggered_by TEXT (free-form: 'waiter'|'admin'|...)
- created_at, printed_at timestamps

Indexes on status, printer_id, created_at for queue dispatch and
recent-jobs listings.

Phase 0 D-023 dropped @thiagoelg/node-printer; the asarUnpack list and
PrintQueue dispatcher in Phase 2 will use shell commands for system-
spooled printers, not this row's connection='usb' code path through
that package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Integration test — todas las migraciones + idempotencia

**Files:**
- Create: `wifi-voucher-manager/tests/integration/migrations.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('migrations — Fase 1 schema', () => {
  it('aplica las 5 migraciones desde DB vacía', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      const result = await runMigrations(db);
      expect(result.filesApplied).toHaveLength(5);
      expect(result.filesApplied).toEqual(
        expect.arrayContaining([
          expect.stringContaining('init_system'),
          expect.stringContaining('passwords'),
          expect.stringContaining('print_log'),
          expect.stringContaining('config_audit'),
          expect.stringContaining('printers'),
        ])
      );
    } finally {
      await db.destroy();
    }
  });

  it('crea las 7 tablas esperadas', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      for (const tableName of [
        'system_info',
        'passwords',
        'print_log',
        'config',
        'audit_log',
        'printer',
        'print_job',
      ]) {
        const exists = await db.schema.hasTable(tableName);
        expect(exists, `tabla ${tableName} debe existir`).toBe(true);
      }
    } finally {
      await db.destroy();
    }
  });

  it('seed inicial de system_info presente', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      const rows = await db('system_info').select('*');
      const keys = rows.map((r) => r.key);
      expect(keys).toContain('schema_version');
      expect(keys).toContain('app_version_last_run');
    } finally {
      await db.destroy();
    }
  });

  it('migrate.latest() es idempotente — segunda corrida no aplica nada', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      const first = await runMigrations(db);
      expect(first.filesApplied.length).toBe(5);
      const second = await runMigrations(db);
      expect(second.filesApplied.length).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('FK enforcement está activo (insert con FK rota falla)', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      // print_log.password_id referencia passwords.id; insertar uno invalido debe fallar.
      await expect(
        db('print_log').insert({
          password_id: 9999,
          success: 1,
          printed_at: new Date().toISOString(),
        })
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
```

- [ ] **Step 2: Correr test**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm rebuild better-sqlite3 && npm run test -- migrations 2>&1 | tail -15
```

Expected: 5 passed, exit 0.

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/tests/integration/migrations.test.ts && git commit -m "$(cat <<'EOF'
test(fase-1): add integration tests for the 5 migrations (Task 10)

Validates:
- All 5 migrations apply from empty DB
- 7 tables exist after migrate.latest() (system_info, passwords,
  print_log, config, audit_log, printer, print_job)
- system_info seed rows present (schema_version,
  app_version_last_run)
- migrate.latest() is idempotent (second call applies 0 files)
- FK enforcement is active (proves connection.afterCreate set
  PRAGMA foreign_keys = ON correctly)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: PasswordRepository

**Files:**
- Create: `wifi-voucher-manager/src/main/db/repositories/PasswordRepository.ts`
- Create: `wifi-voucher-manager/tests/integration/PasswordRepository.test.ts`

- [ ] **Step 1: Crear directorio repositories**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/main/db/repositories
```

- [ ] **Step 2: Escribir el test**

```typescript
import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PasswordRepository', () => {
  let db: Knex;
  let repo: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PasswordRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('insert + getActive happy path', async () => {
    const inserted = await repo.insert({
      password: 'ABCD23PQRS',
      ssid: 'Restaurante-Clientes',
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.password).toBe('ABCD23PQRS');

    const active = await repo.getActive();
    expect(active).not.toBeNull();
    expect(active?.password).toBe('ABCD23PQRS');
  });

  it('getActive() retorna null cuando no hay rows', async () => {
    const active = await repo.getActive();
    expect(active).toBeNull();
  });

  it('setActive() invariante: solo una row con active=1', async () => {
    const a = await repo.insert({
      password: 'AAAA11AAAA',
      ssid: 'X',
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
    const b = await repo.insert({
      password: 'BBBB22BBBB',
      ssid: 'X',
      active: 0,
      rotated_by: 'auto',
      router_response: null,
    });
    expect(a.active).toBe(1);
    expect(b.active).toBe(0);

    await repo.setActive(b.id);

    const rows = await db('passwords').orderBy('id');
    expect(rows.find((r) => r.id === a.id)?.active).toBe(0);
    expect(rows.find((r) => r.id === b.id)?.active).toBe(1);

    const active = await repo.getActive();
    expect(active?.id).toBe(b.id);
  });

  it('listRecent(limit) devuelve rows ordenadas DESC por created_at', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        password: `PASSWORD${i}`.padEnd(10, 'X'),
        ssid: 'X',
        active: 0,
        rotated_by: 'auto',
        router_response: null,
      });
      // Pequeño delay para garantizar created_at distinto
      await new Promise((r) => setTimeout(r, 5));
    }
    const recent = await repo.listRecent(3);
    expect(recent).toHaveLength(3);
    // El último insertado tiene id mayor — y como created_at se setea con strftime, los más recientes vienen primero.
    const ids = recent.map((r) => r.id);
    expect(ids[0]).toBeGreaterThan(ids[2]);
  });
});
```

- [ ] **Step 3: Correr test (debe fallar — repo no existe)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PasswordRepository 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 4: Implementar PasswordRepository**

Crear `src/main/db/repositories/PasswordRepository.ts`:

```typescript
import type { Knex } from 'knex';

export interface PasswordRow {
  id: number;
  password: string;
  ssid: string;
  created_at: string;
  active: 0 | 1;
  rotated_by: 'auto' | 'manual' | 'seed';
  router_response: string | null;
}

export type PasswordInsertInput = Omit<PasswordRow, 'id' | 'created_at'>;

export class PasswordRepository {
  constructor(private readonly db: Knex) {}

  async insert(input: PasswordInsertInput): Promise<PasswordRow> {
    const [id] = await this.db('passwords').insert(input);
    const row = await this.db<PasswordRow>('passwords').where({ id }).first();
    if (!row) throw new Error(`PasswordRepository.insert: row id=${id} no encontrada después de insertar`);
    return row;
  }

  async getActive(): Promise<PasswordRow | null> {
    const row = await this.db<PasswordRow>('passwords')
      .where({ active: 1 })
      .orderBy('created_at', 'desc')
      .first();
    return row ?? null;
  }

  async setActive(id: number): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('passwords').update({ active: 0 });
      await trx('passwords').where({ id }).update({ active: 1 });
    });
  }

  async listRecent(limit = 50): Promise<PasswordRow[]> {
    return this.db<PasswordRow>('passwords')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);
  }
}
```

- [ ] **Step 5: Correr test para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PasswordRepository 2>&1 | tail -15
```

Expected: 4 passed, exit 0.

- [ ] **Step 6: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/repositories/PasswordRepository.ts wifi-voucher-manager/tests/integration/PasswordRepository.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add PasswordRepository (Task 11)

Methods:
- insert(input): inserts row, returns full PasswordRow with auto-
  generated id and created_at
- getActive(): returns the active=1 row or null
- setActive(id): atomic transaction — sets active=0 on all rows,
  then active=1 on the given id (enforces "only one active" invariant)
- listRecent(limit=50): rows DESC by created_at, then DESC by id

Tests (4 cases): insert+getActive, getActive null when empty,
setActive maintains invariant across many rows, listRecent ordering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: PrinterRepository

**Files:**
- Create: `wifi-voucher-manager/src/main/db/repositories/PrinterRepository.ts`
- Create: `wifi-voucher-manager/tests/integration/PrinterRepository.test.ts`

- [ ] **Step 1: Escribir el test**

```typescript
import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PrinterRepository } from '../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PrinterRepository', () => {
  let db: Knex;
  let repo: PrinterRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PrinterRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function newPrinterInput() {
    return {
      id: randomUUID(),
      name: 'Aomus My A1',
      connection: 'bluetooth-ble' as const,
      identifier: 'peripheralid|svc|char',
      width_chars: 32 as const,
      active: 1 as const,
      notes: null,
    };
  }

  it('create + findById', async () => {
    const created = await repo.create(newPrinterInput());
    const found = await repo.findById(created.id);
    expect(found?.name).toBe('Aomus My A1');
    expect(found?.connection).toBe('bluetooth-ble');
  });

  it('findById retorna null cuando no existe', async () => {
    const found = await repo.findById('no-existe');
    expect(found).toBeNull();
  });

  it('list devuelve todas las filas', async () => {
    await repo.create(newPrinterInput());
    await repo.create({ ...newPrinterInput(), id: randomUUID(), name: 'Otra' });
    const rows = await repo.list();
    expect(rows).toHaveLength(2);
  });

  it('update modifica solo los campos pasados', async () => {
    const created = await repo.create(newPrinterInput());
    const updated = await repo.update({ id: created.id, name: 'Renombrada' });
    expect(updated.name).toBe('Renombrada');
    expect(updated.connection).toBe(created.connection);
  });

  it('setActive invariante: solo una row activa', async () => {
    const a = await repo.create({ ...newPrinterInput(), id: randomUUID(), active: 1 });
    const b = await repo.create({ ...newPrinterInput(), id: randomUUID(), active: 0 });
    await repo.setActive(b.id);
    const rows = await repo.list();
    expect(rows.find((r) => r.id === a.id)?.active).toBe(0);
    expect(rows.find((r) => r.id === b.id)?.active).toBe(1);
  });

  it('delete remueve la fila', async () => {
    const created = await repo.create(newPrinterInput());
    await repo.delete(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Correr test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrinterRepository 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar PrinterRepository**

Crear `src/main/db/repositories/PrinterRepository.ts`:

```typescript
import type { Knex } from 'knex';

export type PrinterConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

export interface PrinterRow {
  id: string;
  name: string;
  connection: PrinterConnection;
  identifier: string;
  width_chars: 32 | 48;
  active: 0 | 1;
  notes: string | null;
}

export type PrinterCreateInput = PrinterRow;

export class PrinterRepository {
  constructor(private readonly db: Knex) {}

  async create(input: PrinterCreateInput): Promise<PrinterRow> {
    await this.db('printer').insert(input);
    const row = await this.findById(input.id);
    if (!row) throw new Error(`PrinterRepository.create: row id=${input.id} no encontrada`);
    return row;
  }

  async list(): Promise<PrinterRow[]> {
    return this.db<PrinterRow>('printer').select('*').orderBy('name');
  }

  async findById(id: string): Promise<PrinterRow | null> {
    const row = await this.db<PrinterRow>('printer').where({ id }).first();
    return row ?? null;
  }

  async update(input: Partial<PrinterRow> & { id: string }): Promise<PrinterRow> {
    const { id, ...rest } = input;
    await this.db('printer').where({ id }).update(rest);
    const row = await this.findById(id);
    if (!row) throw new Error(`PrinterRepository.update: row id=${id} no encontrada después de update`);
    return row;
  }

  async setActive(id: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('printer').update({ active: 0 });
      await trx('printer').where({ id }).update({ active: 1 });
    });
  }

  async delete(id: string): Promise<void> {
    await this.db('printer').where({ id }).delete();
  }
}
```

- [ ] **Step 4: Correr test para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrinterRepository 2>&1 | tail -15
```

Expected: 6 passed, exit 0.

- [ ] **Step 5: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/repositories/PrinterRepository.ts wifi-voucher-manager/tests/integration/PrinterRepository.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add PrinterRepository (Task 12)

Methods: create, list, findById, update (partial), setActive
(transactional invariant: only one active=1), delete.

Tests (6 cases): create+findById, findById null, list ordering,
partial update, setActive invariant across rows, delete.

PrinterConnection type re-exported here matches the IpcAPI shape
in shared/types.ts (Task 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Tokens UX 5.6 — `src/renderer/styles/tokens.ts`

**Files:**
- Create: `wifi-voucher-manager/src/renderer/styles/tokens.ts`

- [ ] **Step 1: Crear directorio styles**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/styles
```

- [ ] **Step 2: Escribir el archivo**

```typescript
/**
 * Tokens UX 5.6 — paleta y escala extraídas literalmente del plan v1.1.
 * Consumidos por tailwind.config.ts y por código TS que pasa colores a
 * librerías que no aceptan classes (Recharts, inline styles excepcionales).
 *
 * Restricción WCAG: textMuted #A1A1AA tiene ratio 2.99 sobre surface #FFFFFF.
 * Cumple AA SOLO para texto large (≥14px peso 500+ o ≥18px peso 400+).
 * NUNCA usar textMuted en texto pequeño regular.
 */

export const palette = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F5',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  accent: '#18181B',
  accentHover: '#27272A',
  accentForeground: '#FAFAFA',
  success: '#16A34A',
  warning: '#CA8A04',
  error: '#DC2626',
  info: '#2563EB',
} as const;

export type PaletteToken = keyof typeof palette;

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '2rem',
    '4xl': '2.5rem',
    '5xl': '3.5rem',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  lineHeight: {
    heading: 1.2,
    body: 1.5,
  },
} as const;

export const spacing = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '6': '24px',
  '8': '32px',
  '12': '48px',
  '16': '64px',
} as const;

export const radii = {
  none: '0',
  sm: '4px',
  md: '6px',
  lg: '8px',
  full: '9999px',
} as const;

export const shadows = {
  card: '0 1px 2px rgba(0,0,0,0.04)',
  focus: '0 0 0 2px #18181B',
} as const;

export const transitions = {
  default: '150ms ease-out',
  modal: '200ms ease-out',
} as const;

export const iconSizes = {
  inline: 16,
  button: 20,
  header: 24,
  empty: 40,
} as const;

export const zIndex = {
  dropdown: 10,
  modalBackdrop: 50,
  modal: 51,
  banner: 60,
} as const;
```

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/styles/tokens.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add UX 5.6 design tokens (Task 13)

src/renderer/styles/tokens.ts exports literal hex values from plan
v1.1 §5.6:
- palette: 15 named colors (no other shades allowed)
- typography: Inter (UI) / JetBrains Mono (passwords/IDs/identifiers),
  scale xs..5xl (9 levels), weights 400/500/600 only
- spacing: 4px system (1..16)
- radii: lg=8px (cards), md=6px (buttons/inputs), sm=4px (badges)
- shadows: only 'card' (0 1px 2px 0.04 alpha) and 'focus' (accent 2px)
- transitions: default 150ms (hover/focus), modal 200ms (fade)
- iconSizes: inline=16, button=20, header=24, empty=40
- zIndex: 10..60 step layer (no magic numbers)

WCAG note in JSDoc: textMuted only for ≥14px+500 or ≥18px+400 text.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: tailwind.config.ts + postcss.config.js

**Files:**
- Create: `wifi-voucher-manager/tailwind.config.ts`
- Create: `wifi-voucher-manager/postcss.config.js`

- [ ] **Step 1: Crear `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Crear `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

import { palette, radii, shadows, spacing, transitions, typography } from './src/renderer/styles/tokens.js';

const config: Config = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...palette },
      fontFamily: {
        sans: typography.fontFamily.sans.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
        mono: typography.fontFamily.mono.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
      },
      fontSize: { ...typography.fontSize },
      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
      },
      spacing: { ...spacing },
      borderRadius: { ...radii },
      boxShadow: { card: shadows.card },
      transitionTimingFunction: { out: 'ease-out' },
      transitionDuration: {
        default: transitions.default.replace(' ease-out', ''),
        modal: transitions.modal.replace(' ease-out', ''),
      },
    },
  },
  safelist: ['bg-success', 'bg-warning', 'bg-error', 'bg-info'],
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Agregar `tailwind.config.ts` y `postcss.config.js` a ESLint ignores**

Editar `eslint.config.mjs`. En el primer bloque `ignores`, agregar `'tailwind.config.ts'` y `'postcss.config.js'` a la lista (siguen el patrón de los otros configs raíz). Si la lista ya tiene `'vitest.config.ts'`, añadir las dos nuevas en una línea consecutiva.

Ejemplo del bloque después del cambio (ajusta a la lista exacta que ya hay):

```javascript
ignores: [
  '**/dist/**',
  '**/dist-electron/**',
  '**/dist-installer/**',
  '**/build/**',
  '**/node_modules/**',
  '**/coverage/**',
  'src/preload/index.js',
  'scripts/**/*.mjs',
  'scripts/**/*.ts',
  'eslint.config.mjs',
  'vitest.config.ts',
  'playwright.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
],
```

- [ ] **Step 4: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/tailwind.config.ts wifi-voucher-manager/postcss.config.js wifi-voucher-manager/eslint.config.mjs && git commit -m "$(cat <<'EOF'
feat(fase-1): add Tailwind + PostCSS configs consuming tokens (Task 14)

- tailwind.config.ts:
  - content scans index.html + src/renderer/**/*.{ts,tsx}
  - theme.extend reads palette, typography, spacing, radii, shadows
    from tokens.ts (single source of truth)
  - fontWeight restricted to regular/medium/semibold (no 'bold' utility)
  - boxShadow restricted to 'card' (no shadow-lg / shadow-xl)
  - safelist for bg-success|warning|error|info (used dynamically by
    HealthIndicator dot colors)

- postcss.config.js: tailwindcss + autoprefixer (standard pipeline)

- eslint.config.mjs: add tailwind.config.ts + postcss.config.js to
  the ignores list (uncovered by any tsconfig project)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: fonts.ts + global.css

**Files:**
- Create: `wifi-voucher-manager/src/renderer/styles/fonts.ts`
- Create: `wifi-voucher-manager/src/renderer/styles/global.css`

- [ ] **Step 1: Crear `fonts.ts`**

```typescript
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
```

- [ ] **Step 2: Crear `global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  height: 100%;
}

body {
  font-family: theme('fontFamily.sans');
  background-color: theme('colors.background');
  color: theme('colors.textPrimary');
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*:focus-visible {
  outline: 2px solid theme('colors.accent');
  outline-offset: 2px;
}
```

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/styles/fonts.ts wifi-voucher-manager/src/renderer/styles/global.css && git commit -m "$(cat <<'EOF'
feat(fase-1): add fonts.ts + global.css (Task 15)

fonts.ts: side-effect imports of @fontsource CSS for Inter (400/500/
600) and JetBrains Mono (400/500). Vite will copy referenced .woff2
files to dist/assets/ during build with hashed names. asarUnpack of
those assets is implicit via the dist/**/* files glob in
electron-builder.yml.

global.css: @tailwind directives + body defaults (Inter font,
background, text color) + focus-visible outline (UX 5.6 a11y rule).
Uses Tailwind theme() helper to read tokens at compile time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Component primitive — Spinner (3 dots animados)

**Files:**
- Create: `wifi-voucher-manager/src/renderer/components/Spinner.tsx`
- Create: `wifi-voucher-manager/tests/unit/components/Spinner.test.tsx`

- [ ] **Step 1: Crear directorios**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/components tests/unit/components
```

- [ ] **Step 2: Escribir el test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '../../../src/renderer/components/Spinner.js';

describe('Spinner', () => {
  it('renderiza 3 dots', () => {
    const { container } = render(<Spinner />);
    const dots = container.querySelectorAll('[data-spinner-dot]');
    expect(dots.length).toBe(3);
  });

  it('respeta aria-label personalizable', () => {
    render(<Spinner label="Cargando" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Cargando');
  });

  it('aria-label default es "Cargando"', () => {
    render(<Spinner />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Cargando');
  });
});
```

- [ ] **Step 3: Correr test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- Spinner 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 4: Implementar Spinner**

```tsx
import type { FC } from 'react';

export interface SpinnerProps {
  label?: string;
  className?: string;
}

export const Spinner: FC<SpinnerProps> = ({ label = 'Cargando', className = '' }) => {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-spinner-dot
          className="h-1.5 w-1.5 rounded-full bg-textMuted animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
};
```

- [ ] **Step 5: Correr tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- Spinner 2>&1 | tail -10
```

Expected: 3 passed, exit 0.

- [ ] **Step 6: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/components/Spinner.tsx wifi-voucher-manager/tests/unit/components/Spinner.test.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): add Spinner primitive (Task 16)

3 dots with staggered Tailwind 'animate-pulse' (150ms phase shift).
- role="status", aria-label="Cargando" by default (overridable)
- 6px square dots, 4px gap, bg-textMuted
- 'animate-pulse' is the only allowed animation per UX 5.6 (besides
  hover/focus 150ms transitions and modal-fade 200ms)

Tests (3): renders 3 dots, custom aria-label, default aria-label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Component primitive — HealthIndicator

**Files:**
- Create: `wifi-voucher-manager/src/renderer/components/HealthIndicator.tsx`
- Create: `wifi-voucher-manager/tests/unit/components/HealthIndicator.test.tsx`

- [ ] **Step 1: Escribir el test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HealthIndicator } from '../../../src/renderer/components/HealthIndicator.js';

describe('HealthIndicator', () => {
  it('renderiza el label', () => {
    render(<HealthIndicator status="success" label="Sistema listo" />);
    expect(screen.getByText('Sistema listo')).toBeInTheDocument();
  });

  it('aplica clase bg-success cuando status=success', () => {
    const { container } = render(<HealthIndicator status="success" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-success');
  });

  it('aplica clase bg-warning cuando status=warning', () => {
    const { container } = render(<HealthIndicator status="warning" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-warning');
  });

  it('aplica clase bg-error cuando status=error', () => {
    const { container } = render(<HealthIndicator status="error" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-error');
  });

  it('aplica clase bg-textMuted cuando status=idle', () => {
    const { container } = render(<HealthIndicator status="idle" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-textMuted');
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- HealthIndicator 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
import type { FC } from 'react';

export type HealthStatus = 'success' | 'warning' | 'error' | 'idle';

export interface HealthIndicatorProps {
  status: HealthStatus;
  label: string;
  className?: string;
}

const STATUS_TO_BG: Record<HealthStatus, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  idle: 'bg-textMuted',
};

export const HealthIndicator: FC<HealthIndicatorProps> = ({ status, label, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        data-health-dot
        className={`h-2 w-2 rounded-full ${STATUS_TO_BG[status]}`}
        aria-hidden="true"
      />
      <span className="text-sm text-textSecondary">{label}</span>
    </span>
  );
};
```

- [ ] **Step 4: Correr tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- HealthIndicator 2>&1 | tail -10
```

Expected: 5 passed, exit 0.

- [ ] **Step 5: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/components/HealthIndicator.tsx wifi-voucher-manager/tests/unit/components/HealthIndicator.test.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): add HealthIndicator primitive (Task 17)

8px colored dot (rounded-full) + label text.
- Statuses: success / warning / error / idle (gray)
- Color comes from bg-{success|warning|error|textMuted} which Tailwind
  resolves from tokens.ts. safelist in tailwind.config.ts ensures the
  classes survive purge.
- Label in text-sm + textSecondary (UX 5.6 secondary text contrast OK)
- Dot aria-hidden because the label carries semantic meaning

Tests (5): label visible, each of 4 statuses applies the right bg
class.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Component primitive — Banner

**Files:**
- Create: `wifi-voucher-manager/src/renderer/components/Banner.tsx`
- Create: `wifi-voucher-manager/tests/unit/components/Banner.test.tsx`

- [ ] **Step 1: Escribir el test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Banner } from '../../../src/renderer/components/Banner.js';

describe('Banner', () => {
  it('renderiza el mensaje', () => {
    render(<Banner variant="error" message="Algo falló" />);
    expect(screen.getByText('Algo falló')).toBeInTheDocument();
  });

  it('variant=error aplica border y fondo correctos', () => {
    const { container } = render(<Banner variant="error" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-error|border-error/);
  });

  it('variant=warning usa color warning', () => {
    const { container } = render(<Banner variant="warning" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-warning|border-warning/);
  });

  it('variant=success usa color success', () => {
    const { container } = render(<Banner variant="success" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-success|border-success/);
  });

  it('variant=info usa color info', () => {
    const { container } = render(<Banner variant="info" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-info|border-info/);
  });

  it('renderiza children con acción opcional', () => {
    render(
      <Banner variant="error" message="Algo falló">
        <button>Reintentar</button>
      </Banner>
    );
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- Banner 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
import type { FC, ReactNode } from 'react';

export type BannerVariant = 'error' | 'warning' | 'success' | 'info';

export interface BannerProps {
  variant: BannerVariant;
  message: string;
  children?: ReactNode;
  className?: string;
}

const VARIANT_BORDER: Record<BannerVariant, string> = {
  error: 'border-l-error',
  warning: 'border-l-warning',
  success: 'border-l-success',
  info: 'border-l-info',
};

export const Banner: FC<BannerProps> = ({ variant, message, children, className = '' }) => {
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 border-l-[3px] ${VARIANT_BORDER[variant]} bg-surface px-4 py-3 ${className}`}
    >
      <p className="flex-1 text-sm text-textPrimary">{message}</p>
      {children ? <div className="flex-shrink-0">{children}</div> : null}
    </div>
  );
};
```

- [ ] **Step 4: Correr tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- Banner 2>&1 | tail -10
```

Expected: 6 passed, exit 0.

- [ ] **Step 5: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/components/Banner.tsx wifi-voucher-manager/tests/unit/components/Banner.test.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): add Banner primitive (Task 18)

Inline persistent banner (NEVER a toast) per UX 5.6:
- 3px left border colored by variant (error/warning/success/info)
- Surface bg, no shadow (UX 5.6: no agressive drop shadows)
- text-sm message, optional children for action button
- role='alert' when error/warning (immediate ARIA), 'status' otherwise

Tests (6): message visible, each of 4 variants applies left-border
color, children render in action slot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Component primitive — PrintButton

**Files:**
- Create: `wifi-voucher-manager/src/renderer/components/PrintButton.tsx`
- Create: `wifi-voucher-manager/tests/unit/components/PrintButton.test.tsx`

- [ ] **Step 1: Escribir el test**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PrintButton } from '../../../src/renderer/components/PrintButton.js';

describe('PrintButton', () => {
  it('renderiza children como label', () => {
    render(<PrintButton onClick={async () => {}}>Imprimir</PrintButton>);
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('dispara onClick al hacer click', async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {});
    render(<PrintButton onClick={fn}>X</PrintButton>);
    await user.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('está deshabilitado y NO dispara cuando disabled', async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {});
    render(
      <PrintButton onClick={fn} disabled>
        X
      </PrintButton>
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fn).not.toHaveBeenCalled();
  });

  it('muestra Spinner mientras la promesa no resuelve', async () => {
    const user = userEvent.setup();
    let resolveExternal: () => void = () => {};
    const promise = new Promise<void>((res) => {
      resolveExternal = res;
    });
    render(<PrintButton onClick={() => promise}>X</PrintButton>);

    await user.click(screen.getByRole('button'));
    // El status (Spinner) debe estar presente
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolveExternal();
    // Después de resolver, dejamos pasar un tick. No verificamos que el spinner desaparezca para no flakear.
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrintButton 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
import { useState, type FC, type ReactNode } from 'react';

import { Spinner } from './Spinner.js';

export interface PrintButtonProps {
  onClick: () => Promise<void>;
  disabled?: boolean;
  size?: 'lg' | 'md';
  children: ReactNode;
}

export const PrintButton: FC<PrintButtonProps> = ({ onClick, disabled, size = 'lg', children }) => {
  const [busy, setBusy] = useState(false);
  const dimensions =
    size === 'lg' ? 'min-w-[240px] h-20 text-lg' : 'min-w-[160px] h-12 text-base';

  const handle = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handle();
      }}
      disabled={disabled || busy}
      className={`${dimensions} rounded-md bg-accent px-6 font-medium text-accentForeground transition-colors duration-default ease-out hover:bg-accentHover disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center`}
    >
      {busy ? <Spinner label="Procesando" /> : children}
    </button>
  );
};
```

- [ ] **Step 4: Correr tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrintButton 2>&1 | tail -15
```

Expected: 4 passed, exit 0.

- [ ] **Step 5: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/components/PrintButton.tsx wifi-voucher-manager/tests/unit/components/PrintButton.test.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): add PrintButton primitive (Task 19)

Reusable big button used as the WaiterView main action and as a
secondary action on AdminView/Inicio (Phase 3).
- size='lg' (240×80, text-lg) by default; size='md' (160×48, text-base)
  for secondary placements
- accent bg, accentForeground text, accentHover on hover
- disabled state: opacity 0.45, cursor not-allowed
- internal busy state during onClick promise: button stays disabled
  + Spinner replaces children. void wrapper around the async handler
  satisfies the @typescript-eslint no-misused-promises rule

Tests (4): label, click fires handler, disabled blocks click, busy
state shows status role.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Component primitive — SettingsGearButton

**Files:**
- Create: `wifi-voucher-manager/src/renderer/components/SettingsGearButton.tsx`

- [ ] **Step 1: Implementar**

```tsx
import { Settings } from 'lucide-react';
import type { FC } from 'react';

export interface SettingsGearButtonProps {
  onClick: () => void;
  className?: string;
}

export const SettingsGearButton: FC<SettingsGearButtonProps> = ({ onClick, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir configuración de administrador"
      className={`fixed bottom-6 right-6 inline-flex h-8 w-8 items-center justify-center rounded-md text-textMuted transition-colors duration-default ease-out hover:text-textSecondary ${className}`}
    >
      <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
};
```

- [ ] **Step 2: Verificar render rápido (smoke render)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0. (Sin test propio: el componente es trivial — el test de WaiterView ejercerá el render.)

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/components/SettingsGearButton.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): add SettingsGearButton (Task 20)

16px lucide Settings icon (stroke-width 1.5 per UX 5.6) inside a
fixed bottom-right 8×8 button.
- aria-label="Abrir configuración de administrador" because there is
  no visible text
- text-textMuted default, hover text-textSecondary (subtle, low-
  prominence to keep waiter focused on the main button)

The button just calls onClick — the modal/wizard logic lives in
WaiterView (Task 25). Lands as standalone primitive so AdminView
(Phase 3) can reuse it without dragging WaiterView state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: useSystemHealth hook

**Files:**
- Create: `wifi-voucher-manager/src/renderer/hooks/useSystemHealth.ts`

- [ ] **Step 1: Crear directorio + archivo**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/hooks
```

Crear `src/renderer/hooks/useSystemHealth.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';

import type { SystemHealth } from '../../shared/types.js';

const POLL_INTERVAL_MS = 30_000;

export interface UseSystemHealthResult {
  health: SystemHealth | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSystemHealth(): UseSystemHealthResult {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.api.waiter.getSystemHealth();
      setHealth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido obteniendo salud del sistema');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const id = setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return { health, isLoading, error, refetch };
}
```

- [ ] **Step 2: Crear el augment de Window en `src/renderer/types/window.d.ts`**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/types
```

Crear `src/renderer/types/window.d.ts`:

```typescript
import type { IpcAPI } from '../../shared/types.js';

declare global {
  interface Window {
    api: IpcAPI;
  }
}

export {};
```

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/hooks/useSystemHealth.ts wifi-voucher-manager/src/renderer/types/window.d.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add useSystemHealth hook + Window.api augmentation (Task 21)

useSystemHealth():
- Calls window.api.waiter.getSystemHealth() on mount
- Polls every 30s (POLL_INTERVAL_MS = 30_000)
- Returns { health, isLoading, error, refetch }
- refetch() can be called manually after a mutation that changes health

src/renderer/types/window.d.ts: declare global { interface Window {
  api: IpcAPI } } — typed access from anywhere in the renderer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: printStore (zustand)

**Files:**
- Create: `wifi-voucher-manager/src/renderer/store/printStore.ts`

- [ ] **Step 1: Crear directorio**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/store
```

- [ ] **Step 2: Implementar**

Crear `src/renderer/store/printStore.ts`:

```typescript
import { create } from 'zustand';

export type PrintStatus = 'idle' | 'previewing' | 'preview-shown' | 'preview-failed';

export interface PrintState {
  status: PrintStatus;
  lastError: string | null;
  lastDataUrl: string | null;
  lastSsid: string | null;
  lastPassword: string | null;
  startPreview: () => Promise<void>;
  closePreview: () => void;
  clear: () => void;
}

export const usePrintStore = create<PrintState>((set) => ({
  status: 'idle',
  lastError: null,
  lastDataUrl: null,
  lastSsid: null,
  lastPassword: null,
  startPreview: async () => {
    set({ status: 'previewing', lastError: null });
    try {
      const result = await window.api.waiter.printVoucher();
      if (result.ok) {
        set({
          status: 'preview-shown',
          lastDataUrl: result.dataUrl,
          lastSsid: result.ssid,
          lastPassword: result.password,
          lastError: null,
        });
      } else {
        set({
          status: 'preview-failed',
          lastError: result.message,
        });
      }
    } catch (err) {
      set({
        status: 'preview-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  closePreview: () => {
    set({ status: 'idle' });
  },
  clear: () => {
    set({
      status: 'idle',
      lastError: null,
      lastDataUrl: null,
      lastSsid: null,
      lastPassword: null,
    });
  },
}));
```

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/store/printStore.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add printStore (zustand) for preview flow (Task 22)

State machine for the preview flow in Phase 1:
- idle (default) → user clicks button
- previewing (in flight) → waiter.printVoucher IPC pending
- preview-shown (success) → modal opens with lastDataUrl, lastSsid,
  lastPassword
- preview-failed (error) → modal NOT shown; banner inline shows
  lastError

Actions:
- startPreview(): triggers IPC, transitions states based on result
- closePreview(): user dismisses modal, status → idle
- clear(): full reset (used on dev hot reload)

Phase 2 will replace this with a real-print state machine that
includes 'printing' / 'printed' / 'print_failed'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: IPC handlers — `src/main/ipc/waiter.ts`

**Files:**
- Create: `wifi-voucher-manager/src/main/ipc/waiter.ts`

- [ ] **Step 1: Crear directorio**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/main/ipc
```

- [ ] **Step 2: Implementar**

```typescript
import electron from 'electron';

import type { PrintVoucherResult, SystemHealth } from '../../shared/types.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { QRService } from '../services/QRService.js';

const { ipcMain } = electron;

export interface WaiterHandlerDeps {
  passwords: PasswordRepository;
  qr: QRService;
  defaultSsid: string;
}

export function registerWaiterHandlers(deps: WaiterHandlerDeps): void {
  ipcMain.handle('waiter:get-current-ssid', async (): Promise<string> => {
    const active = await deps.passwords.getActive();
    return active?.ssid ?? deps.defaultSsid;
  });

  ipcMain.handle('waiter:get-system-health', async (): Promise<SystemHealth> => {
    const active = await deps.passwords.getActive();
    return {
      printerOnline: false,
      routerReachable: false,
      passwordValid: active !== null,
      schedulerRunning: false,
      lastRotation: active?.created_at ?? null,
      lastRotationStatus: active ? 'success' : null,
    };
  });

  ipcMain.handle('waiter:print-voucher', async (): Promise<PrintVoucherResult> => {
    const active = await deps.passwords.getActive();
    if (!active) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PASSWORD',
        message: 'No hay contraseña vigente. Configura el sistema en Administración.',
      };
    }
    try {
      const generated = await deps.qr.generate({
        ssid: active.ssid,
        password: active.password,
      });
      return {
        ok: true,
        ssid: active.ssid,
        password: active.password,
        payload: generated.payload,
        dataUrl: generated.dataUrl,
      };
    } catch (err) {
      return {
        ok: false,
        code: 'GENERATE_FAILED',
        message: err instanceof Error ? err.message : 'Error generando QR',
      };
    }
  });
}

export function unregisterWaiterHandlers(): void {
  ipcMain.removeHandler('waiter:get-current-ssid');
  ipcMain.removeHandler('waiter:get-system-health');
  ipcMain.removeHandler('waiter:print-voucher');
}
```

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/ipc/waiter.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): add IPC handlers for waiter namespace (Task 23)

registerWaiterHandlers(deps) wires three ipcMain.handle calls:

- 'waiter:get-current-ssid': reads active password row's SSID, falls
  back to deps.defaultSsid (electron-store key) if none.

- 'waiter:get-system-health': returns SystemHealth shape. In Phase 1
  most flags are stubbed false (printerOnline, routerReachable,
  schedulerRunning). passwordValid is real (checks active row). The
  remaining flags become real in their respective phases (2/4/5).

- 'waiter:print-voucher': PREVIEW MODE. Looks up active password and
  SSID, calls qr.generate, returns
    { ok: true, ssid, password, payload, dataUrl }
  or
    { ok: false, code: 'NO_ACTIVE_PASSWORD'|'GENERATE_FAILED', message }.
  In Phase 2 this gets replaced with a path that enqueues to
  PrintQueue and returns { jobId } for status polling.

unregisterWaiterHandlers() included for symmetric cleanup (used in
tests and on app.before-quit if needed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Update preload — expose `window.api.waiter`

**Files:**
- Modify: `wifi-voucher-manager/src/preload/index.ts`

- [ ] **Step 1: Reemplazar contenido del preload**

Reemplazar `src/preload/index.ts` completo:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

import type { IpcAPI, PrintVoucherResult, SystemHealth } from '../shared/types.js';

const api: IpcAPI = {
  waiter: {
    getCurrentSSID: (): Promise<string> => ipcRenderer.invoke('waiter:get-current-ssid'),
    getSystemHealth: (): Promise<SystemHealth> => ipcRenderer.invoke('waiter:get-system-health'),
    printVoucher: (): Promise<PrintVoucherResult> => ipcRenderer.invoke('waiter:print-voucher'),
  },
};

contextBridge.exposeInMainWorld('api', api);
```

- [ ] **Step 2: Build preload con esbuild**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run build:preload
```

Expected: `dist-electron/preload/index.js` se actualiza.

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/preload/index.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): replace preload stub with waiter namespace (Task 24)

contextBridge.exposeInMainWorld('api', { waiter: { ... } }) where
each method calls ipcRenderer.invoke with the matching channel name
('waiter:get-current-ssid', etc.).

Imports IpcAPI shape from src/shared/types.ts (Task 4) so the bridge
is fully typed. Renderer imports the types via window.d.ts
augmentation (Task 21).

Replaces the Phase 0 hello() stub.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Update main/index.ts — composition root

**Files:**
- Modify: `wifi-voucher-manager/src/main/index.ts`

- [ ] **Step 1: Reemplazar contenido del main**

Reemplazar `src/main/index.ts` completo:

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

import { PasswordRepository } from './db/repositories/PasswordRepository.js';
import { createConnection } from './db/connection.js';
import { runMigrations } from './db/run-migrations.js';
import { registerWaiterHandlers } from './ipc/waiter.js';
import { DEV_CSP, PROD_CSP } from './security/csp.js';
import { PasswordService } from './services/PasswordService.js';
import { QRService } from './services/QRService.js';

const { app, BrowserWindow, session } = electron;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SSID = 'Restaurante-Clientes';

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FAFAFA',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
      e.preventDefault();
    }
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

async function bootstrap(): Promise<void> {
  const dbPath = path.join(app.getPath('userData'), 'data.db');
  const db = createConnection({ filename: dbPath });
  await runMigrations(db);

  const passwords = new PasswordRepository(db);

  // Seed: si no hay password activa, generar una para que la app sea utilizable
  // antes de que llegue el rotador automático en Fase 5.
  const active = await passwords.getActive();
  if (!active) {
    await passwords.insert({
      password: PasswordService.generate(),
      ssid: DEFAULT_SSID,
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
  }

  const qr = new QRService();

  registerWaiterHandlers({ passwords, qr, defaultSsid: DEFAULT_SSID });

  app.on('before-quit', () => {
    void db.destroy();
  });
}

void app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [app.isPackaged ? PROD_CSP : DEV_CSP],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });

  await bootstrap();
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Verificar type-check + lint pasan**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/index.ts && git commit -m "$(cat <<'EOF'
feat(fase-1): composition root + bootstrap + IPC registration (Task 25)

bootstrap() runs at app.whenReady():
1. Open DB at userData/data.db (real per-OS path)
2. Run migrations (idempotent — safe on every launch)
3. Instantiate PasswordRepository
4. Seed: if no active password row, generate one with PasswordService
   and insert with rotated_by='seed', active=1, ssid=DEFAULT_SSID.
   This makes the app usable in Phase 1 before the auto-rotator
   (Phase 5) lands.
5. Instantiate QRService
6. Register waiter IPC handlers with the deps wired
7. Hook db.destroy() to before-quit

The composition root pattern keeps DI explicit and testable: each
piece is constructed in one place (this file) and passed down via
constructor or function parameters.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: Update renderer/main.tsx — import fonts + global.css

**Files:**
- Modify: `wifi-voucher-manager/src/renderer/main.tsx`

- [ ] **Step 1: Reemplazar contenido**

```tsx
import './styles/fonts.js';
import './styles/global.css';
import './types/window.js';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No se encontró el elemento #root en index.html');

const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Verificar build:renderer aún funciona**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run build:renderer 2>&1 | tail -10
```

Expected: build OK; los archivos woff2 aparecen en `dist/assets/`. (App.tsx aún no existe — el build:renderer fallará en este step si los imports no resuelven; en ese caso Task 27 + 28 lo arreglan.)

- [ ] **Step 3: Commit (espera Task 27 a integrar App)**

No hacer commit todavía — el build aún no compila. Si tras Task 27/28 todo está verde, se commitean juntos.

---

### Task 27: Update App.tsx + WaiterView (initial wiring)

**Files:**
- Modify: `wifi-voucher-manager/src/renderer/App.tsx`
- Create: `wifi-voucher-manager/src/renderer/pages/WaiterView.tsx`

- [ ] **Step 1: Crear directorio pages**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/renderer/pages
```

- [ ] **Step 2: Crear `WaiterView.tsx`**

```tsx
import { useState, type FC } from 'react';

import { Banner } from '../components/Banner.js';
import { HealthIndicator, type HealthStatus } from '../components/HealthIndicator.js';
import { PrintButton } from '../components/PrintButton.js';
import { SettingsGearButton } from '../components/SettingsGearButton.js';
import { useSystemHealth } from '../hooks/useSystemHealth.js';
import { usePrintStore } from '../store/printStore.js';

function deriveHealth(loading: boolean, error: string | null, passwordValid: boolean | undefined): {
  status: HealthStatus;
  label: string;
} {
  if (loading) return { status: 'idle', label: 'Cargando estado del sistema…' };
  if (error) return { status: 'error', label: `Error: ${error}` };
  if (!passwordValid) return { status: 'error', label: 'Sin contraseña configurada' };
  return { status: 'success', label: 'Sistema listo' };
}

export const WaiterView: FC = () => {
  const { health, isLoading, error, refetch } = useSystemHealth();
  const { status, lastDataUrl, lastSsid, lastPassword, lastError, startPreview, closePreview } =
    usePrintStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const ssid = health
    ? health.passwordValid
      ? lastSsid ?? '—'
      : '—'
    : '—';

  const derivedHealth = deriveHealth(isLoading, error, health?.passwordValid);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      {status === 'preview-failed' && lastError ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2">
          <Banner variant="error" message={lastError} />
        </div>
      ) : null}

      <p className="font-mono text-sm text-textSecondary">Red: {ssid}</p>

      <PrintButton
        onClick={async () => {
          await startPreview();
          await refetch();
        }}
        disabled={!health?.passwordValid}
      >
        Imprimir QR de WiFi
      </PrintButton>

      <HealthIndicator status={derivedHealth.status} label={derivedHealth.label} />

      <SettingsGearButton onClick={() => setPinModalOpen(true)} />

      {pinModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
          onClick={() => setPinModalOpen(false)}
        >
          <div className="rounded-lg bg-surface p-8 shadow-card">
            <p className="text-base text-textPrimary">PIN admin — disponible en Fase 3.</p>
          </div>
        </div>
      ) : null}

      {status === 'preview-shown' && lastDataUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del QR"
          className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
          onClick={closePreview}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-lg bg-surface p-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-textPrimary">Vista previa</h2>
            <img src={lastDataUrl} alt="QR de WiFi" className="h-72 w-72" />
            {lastPassword ? (
              <p className="font-mono text-base text-textSecondary">
                Contraseña: <span className="text-textPrimary">{lastPassword}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={closePreview}
              className="rounded-md border border-border px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 3: Reemplazar `App.tsx`**

```tsx
import type { FC } from 'react';

import { WaiterView } from './pages/WaiterView.js';

export const App: FC = () => {
  return <WaiterView />;
};
```

- [ ] **Step 4: Reemplazar también el contenido de `src/renderer/types/window.ts` con un re-export**

Crear/actualizar `src/renderer/types/window.ts` (no `.d.ts` — necesitamos un módulo importable) con:

```typescript
import './window.d.js';
```

Wait — el módulo .d.ts no tiene runtime. El import en main.tsx (`import './types/window.js';`) del paso 1 de Task 26 falla porque busca un .js que se compila desde .ts/.d.ts. Solución: cambiar el import en main.tsx a `import type {} from './types/window.js';` — esto fuerza solo type-side effect y Vite lo deja pasar.

Editar `src/renderer/main.tsx` cambiar la línea `import './types/window.js';` a:

```typescript
import type {} from './types/window.js';
```

(Mantener el resto de imports.)

- [ ] **Step 5: Verificar build:renderer pasa**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run build:renderer 2>&1 | tail -10
```

Expected: build OK. `dist/index.html` y `dist/assets/index-*.js` se generan; archivos `*.woff2` aparecen.

- [ ] **Step 6: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/main.tsx wifi-voucher-manager/src/renderer/App.tsx wifi-voucher-manager/src/renderer/pages/WaiterView.tsx && git commit -m "$(cat <<'EOF'
feat(fase-1): wire WaiterView with preview modal + state derivations (Task 27)

main.tsx: imports fonts.ts + global.css (CSS side-effects), opens
StrictMode + ReactDOM.createRoot, mounts <App />.

App.tsx: renders <WaiterView /> (admin route lands in Phase 3).

WaiterView.tsx — composes Phase 1 primitives:
- Layout: full-screen flex column, all centered. SSID label above
  the button (text-secondary, mono, sm), HealthIndicator below,
  SettingsGearButton fixed bottom-right.
- PrintButton calls printStore.startPreview() (which invokes the
  IPC) then refetch() so the health indicator updates.
- Modal preview: when status='preview-shown', shows the QR image
  and the password in mono. Click backdrop or Cerrar dismisses.
- Banner top-center when status='preview-failed' shows lastError.
- PIN modal stub when SettingsGearButton clicked (real wizard in
  Phase 3).
- deriveHealth(): maps (loading, error, passwordValid) → HealthStatus
  + label. Phase 2 will extend with printer/router checks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: WaiterView snapshot tests

**Files:**
- Create: `wifi-voucher-manager/tests/unit/components/WaiterView.test.tsx`

- [ ] **Step 1: Escribir el test**

```typescript
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaiterView } from '../../../src/renderer/pages/WaiterView.js';

interface MockApi {
  waiter: {
    getCurrentSSID: () => Promise<string>;
    getSystemHealth: () => Promise<unknown>;
    printVoucher: () => Promise<unknown>;
  };
}

declare global {
  interface Window {
    api: MockApi;
  }
}

describe('WaiterView', () => {
  let originalApi: MockApi | undefined;

  beforeEach(() => {
    originalApi = window.api;
  });

  afterEach(() => {
    window.api = originalApi as MockApi;
    vi.useRealTimers();
  });

  it('estado idle: muestra botón habilitado y label "Sistema listo" cuando passwordValid=true', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('TestSSID'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: false,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: '2026-05-08T12:00:00Z',
          lastRotationStatus: 'success',
        }),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sistema listo/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).not.toBeDisabled();
  });

  it('estado error: deshabilita botón y muestra "Sin contraseña configurada" cuando passwordValid=false', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: false,
          routerReachable: false,
          passwordValid: false,
          schedulerRunning: false,
          lastRotation: null,
          lastRotationStatus: null,
        }),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin contraseña configurada/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).toBeDisabled();
  });

  it('cuando getSystemHealth lanza, muestra mensaje de error', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockRejectedValue(new Error('IPC down')),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Error: IPC down/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr test**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- WaiterView 2>&1 | tail -15
```

Expected: 3 passed, exit 0.

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/tests/unit/components/WaiterView.test.tsx && git commit -m "$(cat <<'EOF'
test(fase-1): add WaiterView state coverage tests (Task 28)

3 cases covering the deriveHealth() branches:
- passwordValid=true → 'Sistema listo' + button enabled
- passwordValid=false → 'Sin contraseña configurada' + button disabled
- IPC throws → 'Error: <message>' branch

window.api is replaced per-test with a vi.fn-backed MockApi shape;
the original is restored in afterEach. happy-dom hosts the DOM so
the elements render synchronously enough for findByText to resolve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 29: Update vitest.config.ts — habilitar threshold 85% para QRService

**Files:**
- Modify: `wifi-voucher-manager/vitest.config.ts`

- [ ] **Step 1: Editar la sección coverage**

Reemplazar la línea `thresholds: undefined,` con:

```typescript
      thresholds: {
        'src/main/services/QRService.ts': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
      },
```

(Solo activamos QRService en Fase 1 per D-021. Las demás carpetas escalan en Fases 2+.)

- [ ] **Step 2: Correr coverage para verificar threshold pasa**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm rebuild better-sqlite3 argon2 && npm run test:coverage 2>&1 | tail -20
```

Expected: exit 0. Thresholds para QRService.ts pasan (debería estar a 100%).

- [ ] **Step 3: Verificar lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/vitest.config.ts && git commit -m "$(cat <<'EOF'
chore(fase-1): activate QRService 85% coverage threshold per D-021 (Task 29)

vitest.config.ts: sets thresholds.['src/main/services/QRService.ts']
to 85% on statements/branches/functions/lines per D-021 escalation
table (Phase 1 column).

Other folders remain disabled in Phase 1 (services/ generally,
adapters/, repositories/, components/, hooks/) and will activate at
the higher percentages defined for Phase 2-3 etc.

QRService.ts currently sits at 100% per Task 3 tests, so this
threshold is a stop-the-build floor — it only fails if a future
change reduces coverage below 85%.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 30: Final integration — `npm run dev` + manual scan

**Files:**
- (no nuevos archivos)

- [ ] **Step 1: Asegurar nativos en Electron ABI para dev**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run predev 2>&1 | tail -5
```

Expected: electron-rebuild OK + build:preload OK.

- [ ] **Step 2: Levantar dev en background y validar arranque**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && rm -f /tmp/dev-fase1.log && npm run dev > /tmp/dev-fase1.log 2>&1 &
DEV_PID=$!
sleep 25
tail -25 /tmp/dev-fase1.log
kill -SIGTERM $DEV_PID 2>/dev/null
sleep 2
pkill -9 -f "vite" 2>/dev/null; pkill -9 -f "electron" 2>/dev/null; pkill -9 -f "concurrently" 2>/dev/null
echo "killed"
```

Expected log contiene:
- `VITE v5.4 ready`
- Sin errores en `[electron]`. La ventana abre con WaiterView visible (verificación visual queda como criterio manual).

- [ ] **Step 3: Manual visual validation (criterio de aceptación de Fase 1)**

Correr `npm run dev` interactivamente y verificar visualmente:

1. Ventana abre con fondo `#FAFAFA`.
2. Texto "Red: Restaurante-Clientes" centrado arriba en mono pequeño gris.
3. Botón "Imprimir QR de WiFi" 240×80, fondo negro, texto blanco.
4. Debajo: dot verde + "Sistema listo".
5. Esquina inferior derecha: icono engrane (16px, gris muted).
6. Click en botón → modal aparece con QR escaneable + password en monoespaciado.
7. Escanear QR con celular Android o iPhone → conecta a SSID `Restaurante-Clientes` (red dummy — el celular intentará conectar; si el SSID no existe físicamente, muestra "Connect to network").

Para escanear:
- Abrir la app de cámara del celular
- Apuntar al QR del modal
- Confirmar que el OS ofrece "Conectarse a Restaurante-Clientes" o equivalente

- [ ] **Step 4: Verificar fonts cargan en runtime**

Con `npm run dev` corriendo, abrir DevTools del Electron window → Console:

```javascript
document.fonts.check('500 14px Inter')
document.fonts.check('500 14px "JetBrains Mono"')
```

Expected: ambos `true`.

- [ ] **Step 5: Limpiar procesos y correr suite completa final**

```bash
pkill -9 -f "vite" 2>/dev/null; pkill -9 -f "electron" 2>/dev/null; sleep 1
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm rebuild better-sqlite3 argon2 && npm run lint && npm run type-check && npm run test 2>&1 | tail -15
```

Expected: lint exit 0, type-check exit 0, tests todos passing (~50+ tests entre todos los archivos).

- [ ] **Step 6: Tag de cierre de Fase 1**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git commit --allow-empty -m "$(cat <<'EOF'
milestone(fase-1): COMPLETA — QRService + WaiterView preview funcional

All Phase 1 deliverables done:
✓ PasswordService (Task 1) — crypto-secure 10-char generator
✓ QRService.formatPayload (Task 2) — escape WIFI: format
✓ QRService.generate (Task 3) — PNG buffer + dataUrl
✓ shared/types.ts IpcAPI shape (Task 4)
✓ 5 migrations: init_system, passwords, print_log, config_audit,
  printers (Tasks 5-9, integration test in Task 10)
✓ PasswordRepository + PrinterRepository (Tasks 11-12)
✓ Tokens UX 5.6 + Tailwind config (Tasks 13-14)
✓ Fonts self-hosted + global.css (Task 15)
✓ Component primitives: Spinner, HealthIndicator, Banner, PrintButton,
  SettingsGearButton (Tasks 16-20)
✓ useSystemHealth hook + Window.api augment (Task 21)
✓ printStore zustand (Task 22)
✓ IPC handlers waiter.* (Task 23)
✓ Preload bridge (Task 24)
✓ main/index.ts composition root + bootstrap + DB seed (Task 25)
✓ WaiterView with preview modal + state derivations (Task 27)
✓ WaiterView state coverage tests (Task 28)
✓ vitest.config.ts QRService 85% threshold per D-021 (Task 29)
✓ npm run dev verified: window opens, button + health + gear render,
  click → preview modal with scannable QR, fonts load, lint+type-
  check+test all green (Task 30)

Acceptance criteria from spec Section 5 Phase 1:
✓ formatPayload tests: 17 cases covering all 5 escape chars
✓ PasswordService.generate: 10000-iter charset + uniqueness
✓ Component visual review: tokens consumed via Tailwind, no emoji,
  no gradients, accent only on primary CTA
✓ Manual: scan QR with phone — connects to SSID dummy (Restaurante-
  Clientes) — verified by operator
✓ document.fonts.check returns true for Inter 500/14 + JetBrains Mono

Ready for Phase 2: PrinterService + impresión real + Discovery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)" && git tag -a fase-1-complete -m "Fase 1: WaiterView preview con QR escaneable, paleta UX 5.6 aplicada"
```

---

## Self-Review

**1. Spec coverage** (Phase 1 deliverables del spec):
- ✓ QRService.generate (Task 3), formatPayload tests ≥10 (Task 2 — 11 tests + 6 escape = 17)
- ✓ PasswordService.generate (Task 1), 10000 iter (Task 1 step 2)
- ✓ 5 migraciones knex (Tasks 5-9)
- ✓ PasswordRepository (Task 11), PrinterRepository (Task 12)
- ✓ connection.ts y run-migrations.ts ya existían de Fase 0 (referencia inline)
- ✓ IPC handlers waiter.getCurrentSSID, waiter.getSystemHealth (stub), waiter.printVoucher (preview) (Task 23)
- ✓ tokens.ts (Task 13), tailwind.config.ts (Task 14), fonts.ts (Task 15)
- ✓ WaiterView.tsx con estados (Task 27 — derivación inline en componente)
- ✓ Spinner / HealthIndicator / SettingsGearButton / PrintButton / Banner (Tasks 16-20)
- ✓ useSystemHealth (Task 21)
- ✓ printStore zustand (Task 22)
- ✓ Coverage QRService 85% (Task 29)
- ✓ Visual review por orquestador (Task 30 paso 3)
- ✓ Manual: escanear QR (Task 30 paso 3)
- ✓ document.fonts.check (Task 30 paso 4)

**2. Placeholder scan:** sin "TBD", "implement later", "appropriate error handling". Cada step muestra código completo o comando exacto. La nota "PIN admin — disponible en Fase 3" en WaiterView es una etiqueta de UI, no un placeholder de código (es texto que debe aparecer al usuario).

**3. Type consistency:** `PrinterConnection` es `'usb' | 'bluetooth' | 'bluetooth-ble'` consistente entre `shared/types.ts` (Task 4) y `PrinterRepository.ts` (Task 12). `SystemHealth` shape es la misma en types.ts (Task 4), useSystemHealth (Task 21), e IPC handler (Task 23). `PrintVoucherResult` discriminated union usado consistentemente entre types, IPC, preload, y store.

**4. Dependencias entre tasks:**
- Tasks 1-3 (services) son independientes.
- Task 4 (types) lo necesitan Tasks 21, 22, 23, 24.
- Tasks 5-9 (migraciones) van en orden (datetime asegura).
- Task 10 (integration test) requiere Tasks 5-9.
- Tasks 11-12 (repositorios) requieren Tasks 5-9.
- Tasks 13-15 (tokens + tailwind + fonts) son setup CSS — independientes pero ordenadas.
- Tasks 16-20 (primitives) requieren Tasks 13-15.
- Task 21 (useSystemHealth) requiere Task 4.
- Task 22 (printStore) requiere Task 4.
- Task 23 (IPC handlers) requiere Tasks 1, 3, 11, 4.
- Task 24 (preload) requiere Task 4.
- Task 25 (composition root) requiere Tasks 1, 3, 11, 23.
- Task 26 (renderer/main.tsx) requiere Tasks 15.
- Task 27 (WaiterView + App) requiere Tasks 16-22, 24.
- Task 28 (WaiterView tests) requiere Task 27.
- Task 29 (coverage threshold) puede ir cualquier momento ≥ Task 3.
- Task 30 (final integration) requiere Tasks 25, 26, 27.

Plan limpio, ejecutable, ~30 tasks, ~210 steps. Listo para ejecución.

---

## Notas operacionales

- **Cada Task termina con commit.** El usuario hace push manual cuando quiera (instrucción del flujo de Fase 0).
- **Path absoluto del proyecto:** `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/` (sin espacios — fix de Fase 0).
- **Sourcing nvm en cada Bash:** `export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22` antes de cualquier `npm`/`node` command.
- **Después de electron-rebuild → re-rebuild Node ABI:** `npm rebuild better-sqlite3 argon2` antes de correr vitest. Patrón ya documentado en README.md y en CI.
- **Subagentes ejecutores:** prefieran `haiku` para tasks mecánicas (config, archivos sin lógica). `sonnet` para tasks con lógica de negocio o debugging probable (services, IPC handlers, composition root).

**Próximo paso post-Fase 1:** invocar `/writing-plans` con la **Fase 2** (PrinterService + impresión real + Discovery contra Aomus My A1 vía RDP a Win11) usando el mismo spec consolidado.
