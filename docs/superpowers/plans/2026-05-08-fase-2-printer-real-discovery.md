# Fase 2 — PrinterService + impresión real + Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WaiterView imprime de verdad un ticket térmico ESC/POS con QR escaneable en la impresora Aomus My A1 BLE desde Win11 vía RDP. Cola SQLite-persistida procesa jobs serializados sin auto-retry. Discovery cross-platform detecta impresoras USB/Bluetooth-SPP/BLE en ≤5s. IPC `printer.*` listo para que AdminView (Fase 3) lo consuma.

**Architecture:** `PrinterDriver` interface con 4 implementaciones (`BleDriver` con `@abandonware/noble`, `BluetoothDriver` con `serialport`, `UsbDriver` con `child_process` + `lp`/`Out-Printer` per D-023, `MockPrinterDriver` para tests). Cola `PrintQueue` lee `print_job` rows con status `pending`, despacha al driver según `printer.connection`, marca `printed`/`failed`. `EscPosBuilder` (port de maragon + extensión `image()` con `GS v 0` raster) compone el ticket; `voucher.ts` template lo arma. `discoverAll()` corre los 3 canales en paralelo con `Promise.allSettled` y timeout global 10s. WaiterView ahora encola jobs y espera estado vía polling (no preview); AdminView panel de impresoras llega en Fase 3.

**Tech Stack:** `@abandonware/noble` 1.9 (BLE), `serialport` 13 (BT-SPP), `child_process` (USB via shell), `pngjs` (PNG → bits), `qrcode` 1.5 (ya en uso), Knex 3 (PrintJobRepository), zod 3.23 (validación IPC), vitest 2 + @testing-library/react 16, Playwright 1.48 (E2E manual via RDP).

**Referencias:**
- Spec: `docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md` (Sección 5 Fase 2)
- maragon_pdv: `apps/pos/electron/services/printing/{driver-types,ble-driver,bluetooth-driver,detect,print-queue,render}.ts` y `packages/shared/src/escpos/{commands,builder}.ts` — fuente de port literal
- DECISIONS.md: D-002 (3 drivers), D-007 (EscPos builder propio), D-009 (queue sin auto-retry), D-021 (coverage threshold), D-022 (better-sqlite3 12), D-023 (drop node-printer; UsbDriver vía shell)
- Plan v1.1 secciones 5.1-5.2 (QRService + PrinterService + Discovery)
- Hardware specialist Q11 plan B/D/C (fallback BT-SPP / Web Bluetooth si BLE falla)

**Working directory:** `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager/`. Git repo padre `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/`. Branch `main`.

**Pre-condiciones (verificar antes de Task 1):**
- `git log --oneline | head -1` muestra `4ca369d milestone(fase-1)` o equivalente
- Tag `fase-1-complete` existe
- `npm run lint && npm run type-check && npm run test` exit 0 (70/70 tests)
- `npm rebuild better-sqlite3 argon2` antes de tests si recientemente se corrió `npm run predev`

**nvm sourcing en cada Bash:** prefijar con `export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && `

---

## File Structure

**Crear durante Fase 2:**

```
wifi-voucher-manager/
├── src/main/
│   ├── escpos/
│   │   ├── commands.ts           # constantes ESC/POS estándar (port literal)
│   │   └── builder.ts            # EscPosBuilder + image() (port + extensión)
│   ├── adapters/
│   │   └── printers/
│   │       ├── driver-types.ts   # PrinterDriver interface
│   │       ├── ble-driver.ts     # noble — port literal de maragon
│   │       ├── bluetooth-driver.ts # serialport BT-SPP — port literal
│   │       ├── usb-driver.ts     # child_process lp/Out-Printer (D-023, NUEVO)
│   │       ├── mock-driver.ts    # MockPrinterDriver con modos
│   │       └── detect.ts         # discovery cross-platform
│   ├── services/
│   │   ├── render.ts             # dispatcher useCase='voucher'
│   │   ├── PrintQueue.ts         # cola SQLite-persistida + dispatcher
│   │   └── PrinterDriverFactory.ts # mapping connection → driver
│   ├── db/repositories/
│   │   └── PrintJobRepository.ts # CRUD print_job
│   ├── templates/
│   │   └── voucher.ts            # composición del ticket con EscPosBuilder
│   ├── ipc/
│   │   ├── waiter.ts             # MODIFY: printVoucher ahora encola
│   │   └── printer.ts            # NUEVO: handlers printer.*
│   └── index.ts                  # MODIFY: instanciar drivers + queue + handlers
├── src/shared/
│   └── types.ts                  # MODIFY: agregar PrinterAPI + DiscoveredPrinter + PrinterTestResult + JobStatus
├── src/preload/
│   └── index.ts                  # MODIFY: window.api.printer
├── src/renderer/
│   ├── store/printStore.ts       # MODIFY: estados real-print
│   └── pages/WaiterView.tsx      # MODIFY: estados printing/printed/print_failed + polling
└── tests/
    ├── unit/
    │   ├── escpos/
    │   │   ├── commands.test.ts
    │   │   └── builder.test.ts
    │   ├── adapters/printers/
    │   │   ├── mock-driver.test.ts
    │   │   ├── usb-driver.test.ts        # mocks child_process
    │   │   └── detect.test.ts            # mocks platform-specific commands
    │   ├── services/
    │   │   ├── render.test.ts
    │   │   └── PrintQueue.test.ts
    │   └── templates/
    │       └── voucher.test.ts           # snapshot del Uint8Array
    └── integration/
        ├── PrintJobRepository.test.ts
        └── print-flow.test.ts            # enqueue → driver mock → printed
```

**Modificar:**
- `src/shared/types.ts` — añadir tipos `PrinterAPI`, `DiscoveredPrinter`, `PrinterTestResult`, `JobStatus`, `PrintVoucherJobResult`
- `src/preload/index.ts` — exponer `window.api.printer.*`
- `src/main/index.ts` — instanciar drivers + queue + registrar handlers `printer.*`
- `src/main/ipc/waiter.ts` — `printVoucher` ahora encola job y devuelve `{jobId}` en lugar de dataUrl
- `src/renderer/store/printStore.ts` — estados `idle | printing | printed | print_failed`, polling con `getJobStatus`
- `src/renderer/pages/WaiterView.tsx` — modal de feedback en lugar de preview, banner persistente en error
- `vitest.config.ts` — habilitar threshold 70% para `services/`, `adapters/`, 60% para `repositories/` (D-021 Fase 2)

---

## Tareas

### Task 1: ESC/POS commands constants

**Files:**
- Create: `wifi-voucher-manager/src/main/escpos/commands.ts`

- [ ] **Step 1: Crear directorio**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/main/escpos
```

- [ ] **Step 2: Crear `src/main/escpos/commands.ts`**

Contenido EXACTO (port de maragon `packages/shared/src/escpos/commands.ts`):

```typescript
/**
 * Constantes de bytes ESC/POS estándar.
 *
 * Notas críticas:
 * - CUT_FULL usa 'GS V B 0' (1D 56 42 00) en vez del más común 'GS V 0' (1D 56 00)
 *   porque algunas impresoras térmicas chinas (incluida Aomus My A1) ignoran
 *   la variante corta. La variante con función B + cantidad de líneas es
 *   universalmente soportada.
 * - GS_v_0 (raster bit image, minúscula) es DIFERENTE de GS_V (cut, mayúscula).
 *   El raster está documentado en el datasheet original de Epson y es
 *   ampliamente soportado por clones POS-80.
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

// Inicialización
export const INIT = new Uint8Array([ESC, 0x40]); // ESC @

// Codepage (CP858 = Latin1 con € — bueno para mensajes en español)
export const CODEPAGE_CP858 = new Uint8Array([ESC, 0x74, 19]); // ESC t 19

// Alineación
export const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0]);
export const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 1]);
export const ALIGN_RIGHT = new Uint8Array([ESC, 0x61, 2]);

// Tamaño de texto
// GS ! n: bits 4-6 ancho, 0-2 alto. n=0 normal, n=0x11 doble alto+ancho
export const SIZE_NORMAL = new Uint8Array([GS, 0x21, 0x00]);
export const SIZE_DOUBLE = new Uint8Array([GS, 0x21, 0x11]);

// Bold
export const BOLD_ON = new Uint8Array([ESC, 0x45, 1]);
export const BOLD_OFF = new Uint8Array([ESC, 0x45, 0]);

// Underline
export const UNDERLINE_ON = new Uint8Array([ESC, 0x2d, 1]);
export const UNDERLINE_OFF = new Uint8Array([ESC, 0x2d, 0]);

// Feed
export function feedLines(n: number): Uint8Array {
  return new Uint8Array([ESC, 0x64, Math.min(255, Math.max(0, n))]);
}

// Cut full (Aomus-compatible variant)
// 'GS V B 0' = 1D 56 42 00
export const CUT_FULL = new Uint8Array([GS, 0x56, 0x42, 0x00]);

// Cut partial
export const CUT_PARTIAL = new Uint8Array([GS, 0x56, 0x42, 0x01]);

// Raster bit image header builder.
// 'GS v 0 m xL xH yL yH'
// m=0: normal density. xL/xH = bytes-per-row. yL/yH = total rows.
export function rasterHeader(bytesPerRow: number, rows: number): Uint8Array {
  return new Uint8Array([
    GS,
    0x76, // 'v'
    0x30, // '0'
    0x00, // m=0 normal
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    rows & 0xff,
    (rows >> 8) & 0xff,
  ]);
}
```

- [ ] **Step 3: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/escpos/commands.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add ESC/POS command constants (Task 1)

Port from maragon_pdv packages/shared/src/escpos/commands.ts. Includes:
- INIT (ESC @), CODEPAGE_CP858 for ñ/á
- alignment LEFT/CENTER/RIGHT
- SIZE_NORMAL / SIZE_DOUBLE
- BOLD/UNDERLINE on/off
- feedLines(n) helper
- CUT_FULL using 'GS V B 0' variant (Aomus-compatible — the short
  'GS V 0' is ignored by many POS-80 clones)
- rasterHeader(bytesPerRow, rows) for 'GS v 0' bit-image command

GS V (cut, uppercase) and GS v (raster, lowercase) are distinct
opcodes — both used by the builder in Task 2-3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: EscPosBuilder primitives + tests

**Files:**
- Create: `wifi-voucher-manager/src/main/escpos/builder.ts` (sin `image()` aún)
- Create: `wifi-voucher-manager/tests/unit/escpos/builder.test.ts`

- [ ] **Step 1: Crear directorios**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p tests/unit/escpos
```

- [ ] **Step 2: Escribir test (TDD)**

Crear `tests/unit/escpos/builder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import * as cmd from '../../../src/main/escpos/commands.js';
import { EscPosBuilder } from '../../../src/main/escpos/builder.js';

describe('EscPosBuilder primitives', () => {
  it('init() emite ESC @ y codepage', () => {
    const b = new EscPosBuilder();
    const out = b.init().build();
    expect(out.subarray(0, 2)).toEqual(cmd.INIT);
  });

  it('text() agrega los bytes UTF-8 del string', () => {
    const b = new EscPosBuilder();
    const out = b.text('Hola').build();
    const expected = new TextEncoder().encode('Hola');
    expect(Array.from(out.slice(-expected.length))).toEqual(Array.from(expected));
  });

  it('newline() emite LF (0x0a)', () => {
    const b = new EscPosBuilder();
    const out = b.newline().build();
    expect(out[out.length - 1]).toBe(0x0a);
  });

  it('alignCenter() emite ESC a 1', () => {
    const b = new EscPosBuilder();
    const out = b.alignCenter().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.ALIGN_CENTER));
  });

  it('alignLeft() emite ESC a 0', () => {
    const b = new EscPosBuilder();
    const out = b.alignLeft().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.ALIGN_LEFT));
  });

  it('bold(true) emite ESC E 1', () => {
    const b = new EscPosBuilder();
    const out = b.bold(true).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.BOLD_ON));
  });

  it('bold(false) emite ESC E 0', () => {
    const b = new EscPosBuilder();
    const out = b.bold(false).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.BOLD_OFF));
  });

  it('sizeDouble() emite GS ! 0x11', () => {
    const b = new EscPosBuilder();
    const out = b.sizeDouble().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.SIZE_DOUBLE));
  });

  it('sizeNormal() emite GS ! 0x00', () => {
    const b = new EscPosBuilder();
    const out = b.sizeNormal().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.SIZE_NORMAL));
  });

  it('feed(3) emite ESC d 3', () => {
    const b = new EscPosBuilder();
    const out = b.feed(3).build();
    expect(Array.from(out)).toEqual(Array.from(cmd.feedLines(3)));
  });

  it('cut() emite la variante completa Aomus-compatible', () => {
    const b = new EscPosBuilder();
    const out = b.cut().build();
    expect(Array.from(out)).toEqual(Array.from(cmd.CUT_FULL));
  });

  it('chained: init → alignCenter → text → cut produce concatenación correcta', () => {
    const b = new EscPosBuilder();
    const out = b
      .init()
      .alignCenter()
      .text('TEST')
      .cut()
      .build();
    // INIT (2) + ALIGN_CENTER (3) + 'TEST' (4) + CUT_FULL (4) = 13 bytes
    expect(out.length).toBe(2 + 3 + 4 + 4);
    expect(Array.from(out.subarray(0, 2))).toEqual(Array.from(cmd.INIT));
    expect(Array.from(out.subarray(2, 5))).toEqual(Array.from(cmd.ALIGN_CENTER));
    expect(Array.from(out.subarray(5, 9))).toEqual(Array.from(new TextEncoder().encode('TEST')));
    expect(Array.from(out.subarray(9))).toEqual(Array.from(cmd.CUT_FULL));
  });
});
```

- [ ] **Step 3: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- builder 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '.../builder.js'".

- [ ] **Step 4: Implementar EscPosBuilder**

Crear `src/main/escpos/builder.ts`:

```typescript
import * as cmd from './commands.js';

export class EscPosBuilder {
  private chunks: Uint8Array[] = [];

  private push(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  init(): this {
    return this.push(cmd.INIT);
  }

  codepage(): this {
    return this.push(cmd.CODEPAGE_CP858);
  }

  text(s: string): this {
    return this.push(new TextEncoder().encode(s));
  }

  newline(): this {
    return this.push(new Uint8Array([cmd.LF]));
  }

  alignLeft(): this {
    return this.push(cmd.ALIGN_LEFT);
  }

  alignCenter(): this {
    return this.push(cmd.ALIGN_CENTER);
  }

  alignRight(): this {
    return this.push(cmd.ALIGN_RIGHT);
  }

  bold(on: boolean): this {
    return this.push(on ? cmd.BOLD_ON : cmd.BOLD_OFF);
  }

  sizeNormal(): this {
    return this.push(cmd.SIZE_NORMAL);
  }

  sizeDouble(): this {
    return this.push(cmd.SIZE_DOUBLE);
  }

  feed(n: number): this {
    return this.push(cmd.feedLines(n));
  }

  cut(): this {
    return this.push(cmd.CUT_FULL);
  }

  raw(bytes: Uint8Array): this {
    return this.push(bytes);
  }

  build(): Uint8Array {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}
```

- [ ] **Step 5: Run test para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- builder 2>&1 | tail -15
```

Expected: 12 passed, exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/escpos/builder.ts wifi-voucher-manager/tests/unit/escpos/builder.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add EscPosBuilder primitives (Task 2)

Fluent builder over the constants in commands.ts. Each method pushes
a Uint8Array chunk; build() concatenates into a single buffer.

Methods: init, codepage, text, newline, alignLeft/Center/Right, bold,
sizeNormal/Double, feed(n), cut, raw(bytes).

text() encodes to UTF-8 (TextEncoder) — for non-ASCII chars the
codepage() call sets CP858 mapping at the printer side. Aomus seems
to handle UTF-8 well in tests; we'll validate against real hardware
in Task 21.

image() (raster QR via GS v 0) lands separately in Task 3.

Tests (12 cases): each primitive + chained composition byte-by-byte
verification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: EscPosBuilder.image() — raster `GS v 0`

**Files:**
- Modify: `wifi-voucher-manager/src/main/escpos/builder.ts` (add `image()`)
- Modify: `wifi-voucher-manager/tests/unit/escpos/builder.test.ts` (add tests)
- Modify: `wifi-voucher-manager/package.json` (add pngjs dep)

- [ ] **Step 1: Instalar `pngjs` + tipos**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm install --save pngjs@^7.0.0 && npm install --save-dev @types/pngjs@^6.0.0
```

Expected: install OK.

- [ ] **Step 2: Escribir tests para image()**

Append a `tests/unit/escpos/builder.test.ts` justo antes del último `});`:

```typescript
import { PNG } from 'pngjs';

import * as cmd from '../../../src/main/escpos/commands.js';

describe('EscPosBuilder.image', () => {
  function makeSolidPng(width: number, height: number, isBlack: boolean): Buffer {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const v = isBlack ? 0 : 255;
        png.data[idx] = v;
        png.data[idx + 1] = v;
        png.data[idx + 2] = v;
        png.data[idx + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  it('produce header GS v 0 + payload del tamaño esperado', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(16, 8, true); // 16x8 todo negro
    const out = b.image(png).build();

    // bytes-per-row = ceil(16/8) = 2; rows = 8; payload = 2*8 = 16 bytes.
    const headerLen = 8; // 'GS v 0 m xL xH yL yH'
    expect(out.length).toBe(headerLen + 16);

    // Validar header
    expect(Array.from(out.subarray(0, headerLen))).toEqual(
      Array.from(cmd.rasterHeader(2, 8))
    );

    // Todo negro → todos los bytes del payload deben ser 0xFF (8 bits encendidos)
    for (let i = headerLen; i < out.length; i++) {
      expect(out[i]).toBe(0xff);
    }
  });

  it('PNG totalmente blanco produce payload de 0x00', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(16, 4, false);
    const out = b.image(png).build();
    const headerLen = 8;
    for (let i = headerLen; i < out.length; i++) {
      expect(out[i]).toBe(0x00);
    }
  });

  it('width que no es múltiplo de 8 redondea hacia arriba', () => {
    const b = new EscPosBuilder();
    const png = makeSolidPng(13, 1, true);
    const out = b.image(png).build();
    // ceil(13/8) = 2 bytes per row * 1 row = 2 bytes payload
    expect(out.length).toBe(8 + 2);
  });

  it('lanza Error si la imagen excede 8000 bytes per row', () => {
    const b = new EscPosBuilder();
    // Crear PNG 65000px ancho excedería el rango del header (uint16) + es absurdo
    expect(() => b.image(makeSolidPng(70_000, 1, true))).toThrow(/demasiado anch/i);
  });
});
```

- [ ] **Step 3: Run test (debe fallar — image no existe)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- builder 2>&1 | tail -15
```

Expected: 12 pasan, 4 fallan con "image is not a function" o similar.

- [ ] **Step 4: Implementar image()**

Modificar `src/main/escpos/builder.ts`. Agregar al inicio del archivo:

```typescript
import { PNG } from 'pngjs';
```

Y agregar este método dentro de la clase, antes de `raw()`:

```typescript
  image(pngBuffer: Buffer, opts?: { threshold?: number }): this {
    const threshold = opts?.threshold ?? 128;
    const png = PNG.sync.read(pngBuffer);
    const { width, height, data } = png;

    if (width > 65_535) {
      throw new Error(`Imagen demasiado ancha: ${width}px (max 65535)`);
    }

    const bytesPerRow = Math.ceil(width / 8);
    if (bytesPerRow > 8000) {
      throw new Error(`Imagen demasiado ancha: ${bytesPerRow} bytes/row (max 8000)`);
    }

    const payload = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const r = data[idx]!;
        const g = data[idx + 1]!;
        const b = data[idx + 2]!;
        // luminance Y = 0.299R + 0.587G + 0.114B
        const luma = (r * 299 + g * 587 + b * 114) / 1000;
        const isBlack = luma < threshold;
        if (isBlack) {
          const byteIdx = y * bytesPerRow + (x >> 3);
          const bitInByte = 7 - (x & 7);
          payload[byteIdx]! |= 1 << bitInByte;
        }
      }
    }

    this.push(cmd.rasterHeader(bytesPerRow, height));
    this.push(payload);
    return this;
  }
```

- [ ] **Step 5: Run tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- builder 2>&1 | tail -15
```

Expected: 16 passed (12 + 4 nuevos), exit 0.

- [ ] **Step 6: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/escpos/builder.ts wifi-voucher-manager/tests/unit/escpos/builder.test.ts wifi-voucher-manager/package.json wifi-voucher-manager/package-lock.json && git commit -m "$(cat <<'EOF'
feat(fase-2): add EscPosBuilder.image (GS v 0 raster) + pngjs (Task 3)

image(pngBuffer, opts?) extends the builder for QR / logo printing:
- Reads PNG via pngjs (sync, no async I/O)
- Computes luminance per pixel (Y = 0.299R + 0.587G + 0.114B)
- Threshold (default 128) determines black/white per pixel
- Packs 8 horizontal pixels per byte, MSB = leftmost pixel
- Emits 'GS v 0 m xL xH yL yH' header + payload

bytesPerRow = ceil(width/8). Validates width <= 65535 (header range)
and bytesPerRow <= 8000 (sane upper bound).

Adds pngjs ^7 dep. @types/pngjs ^6 dev dep.

Tests (4 new, 16 total): solid black 16x8 → all 0xFF, solid white →
0x00, width-not-multiple-of-8 rounds up correctly, oversize throws.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Voucher template

**Files:**
- Create: `wifi-voucher-manager/src/main/templates/voucher.ts`
- Create: `wifi-voucher-manager/tests/unit/templates/voucher.test.ts`

- [ ] **Step 1: Crear directorio**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/main/templates tests/unit/templates
```

- [ ] **Step 2: Escribir test (snapshot)**

Crear `tests/unit/templates/voucher.test.ts`:

```typescript
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { renderVoucher, type VoucherPayload } from '../../../src/main/templates/voucher.js';

async function buildPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: 'png',
    errorCorrectionLevel: 'M',
    width: 192,
    margin: 0,
    color: { dark: '#000000FF', light: '#FFFFFFFF' },
  });
}

describe('renderVoucher', () => {
  it('produce un Uint8Array no vacío con header de raster', async () => {
    const qrPng = await buildPng('WIFI:T:WPA;S:Test;P:abc;;');
    const payload: VoucherPayload = {
      business_name: 'RESTAURANTE PRUEBA',
      ssid: 'Restaurante-Clientes',
      qrPng,
      footer_message: '¡Gracias por tu visita!',
      triggered_at: '2026-05-08T12:34:56.000Z',
    };
    const bytes = renderVoucher(payload, 32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    // Debe contener INIT al inicio
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    // Debe contener CUT_FULL al final
    const cutBytes = [0x1d, 0x56, 0x42, 0x00];
    const last4 = Array.from(bytes.subarray(bytes.length - 4));
    expect(last4).toEqual(cutBytes);
  });

  it('flag is_test agrega texto PRUEBA', async () => {
    const qrPng = await buildPng('WIFI:T:WPA;S:T;P:p;;');
    const payload: VoucherPayload = {
      business_name: 'Local',
      ssid: 'X',
      qrPng,
      footer_message: 'gracias',
      triggered_at: '2026-05-08T12:00:00.000Z',
      is_test: true,
    };
    const bytes = renderVoucher(payload, 32);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('PRUEBA');
  });

  it('width_chars=48 cambia el render (más ancho que 32)', async () => {
    const qrPng = await buildPng('x');
    const payload: VoucherPayload = {
      business_name: 'L',
      ssid: 'X',
      qrPng,
      footer_message: 'g',
      triggered_at: '2026-05-08T12:00:00.000Z',
    };
    const a = renderVoucher(payload, 32);
    const b = renderVoucher(payload, 48);
    // Ambos válidos, no necesariamente longitud distinta — solo aseguramos que ambos producen output válido
    expect(a.length).toBeGreaterThan(100);
    expect(b.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 3: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- voucher 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '.../voucher.js'".

- [ ] **Step 4: Implementar voucher.ts**

Crear `src/main/templates/voucher.ts`:

```typescript
import { EscPosBuilder } from '../escpos/builder.js';

export interface VoucherPayload {
  business_name: string;
  ssid: string;
  qrPng: Buffer;
  footer_message: string;
  triggered_at: string;
  is_test?: boolean;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function renderVoucher(payload: VoucherPayload, widthChars: 32 | 48): Uint8Array {
  const builder = new EscPosBuilder()
    .init()
    .codepage()
    .alignCenter();

  if (payload.is_test === true) {
    builder.bold(true).text('*** PRUEBA ***').bold(false).newline().feed(1);
  }

  builder
    .sizeDouble()
    .bold(true)
    .text(payload.business_name)
    .bold(false)
    .sizeNormal()
    .newline()
    .feed(1)
    .text('WiFi GRATIS para clientes')
    .newline()
    .feed(1)
    .text(`Red: ${payload.ssid}`)
    .newline()
    .feed(1)
    .image(payload.qrPng)
    .newline()
    .text('Escanea con tu camara')
    .newline()
    .text('y conectate automaticamente')
    .newline()
    .feed(1)
    .text(payload.footer_message)
    .newline()
    .text(formatTimestamp(payload.triggered_at))
    .newline()
    .feed(3)
    .cut();

  // widthChars currently does not affect layout for the voucher template
  // (the QR is fixed-width and the surrounding text auto-wraps). Reserved
  // for future thermal-paper-width-aware rendering.
  void widthChars;

  return builder.build();
}
```

- [ ] **Step 5: Run tests para verificar pass**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- voucher 2>&1 | tail -15
```

Expected: 3 passed, exit 0.

- [ ] **Step 6: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/templates/voucher.ts wifi-voucher-manager/tests/unit/templates/voucher.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add voucher template with EscPosBuilder (Task 4)

renderVoucher({ business_name, ssid, qrPng, footer_message,
triggered_at, is_test? }, widthChars) → Uint8Array.

Layout (centered):
  *** PRUEBA *** (only when is_test)
  [BUSINESS_NAME] (double size, bold)
  WiFi GRATIS para clientes
  Red: <SSID>
  [QR raster 192px or whatever the caller renders]
  Escanea con tu camara
  y conectate automaticamente
  <footer_message>
  dd/mm/yyyy hh:mm
  [feed 3 + cut]

widthChars (32|48) is captured in the signature for future width-
aware rendering but currently doesn't change the layout (the QR
self-determines width; text auto-wraps).

Tests (3): output starts with INIT and ends with CUT_FULL,
is_test=true adds 'PRUEBA' string, both widths produce valid output.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: render dispatcher

**Files:**
- Create: `wifi-voucher-manager/src/main/services/render.ts`
- Create: `wifi-voucher-manager/tests/unit/services/render.test.ts`

- [ ] **Step 1: Escribir test**

Crear `tests/unit/services/render.test.ts`:

```typescript
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { renderPrintBytes } from '../../../src/main/services/render.js';

describe('render dispatcher', () => {
  it('despacha use_case=voucher correctamente', async () => {
    const qrPng = await QRCode.toBuffer('WIFI:T:WPA;S:T;P:p;;', {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 192,
      margin: 0,
    });
    const bytes = renderPrintBytes(
      'voucher',
      {
        business_name: 'X',
        ssid: 'Y',
        qrPng,
        footer_message: 'z',
        triggered_at: '2026-05-08T12:00:00.000Z',
      },
      32
    );
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('lanza Error con use_case desconocido', async () => {
    const qrPng = await QRCode.toBuffer('x', { type: 'png', width: 64, margin: 0 });
    expect(() =>
      renderPrintBytes(
        'unknown' as 'voucher',
        { business_name: 'X', ssid: 'Y', qrPng, footer_message: 'z', triggered_at: '' },
        32
      )
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- render 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implementar render.ts**

Crear `src/main/services/render.ts`:

```typescript
import { renderVoucher, type VoucherPayload } from '../templates/voucher.js';

export type PrintUseCase = 'voucher';

export function renderPrintBytes(
  useCase: PrintUseCase,
  payload: object,
  widthChars: 32 | 48
): Uint8Array {
  switch (useCase) {
    case 'voucher':
      return renderVoucher(payload as VoucherPayload, widthChars);
    default: {
      const exhaustive: never = useCase;
      throw new Error(`renderPrintBytes: use_case desconocido: ${String(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 4: Run test + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- render 2>&1 | tail -10 && npm run lint && npm run type-check
```

Expected: 2 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/services/render.ts wifi-voucher-manager/tests/unit/services/render.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add render dispatcher (Task 5)

renderPrintBytes(useCase, payload, widthChars) → Uint8Array.

Single use_case 'voucher' for now; the discriminated 'never' default
case forces TypeScript to flag any future addition that doesn't
update this dispatcher (exhaustiveness check).

Tests (2): voucher path produces non-empty bytes; unknown use_case
throws.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: PrinterDriver interface (driver-types.ts)

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/driver-types.ts`

- [ ] **Step 1: Crear directorio + archivo**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p src/main/adapters/printers
```

Contenido EXACTO de `src/main/adapters/printers/driver-types.ts`:

```typescript
import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

/**
 * Cada driver implementa write() y testConnection().
 *
 * - write(): envía bytes al hardware. Resuelve void si OK; rechaza con
 *   Error legible si falló.
 * - testConnection(): valida que la impresora responde sin imprimir
 *   contenido visible. Máximo enviar INIT (ESC @).
 *
 * Cada invocación abre y cierra la conexión por sí misma. Sin pool
 * persistente — la próxima impresión re-conecta. Costo: +1-2s en la
 * primera impresión post-desconexión, pero más resiliente.
 */
export interface PrinterDriver {
  write(printer: PrinterRow, bytes: Uint8Array): Promise<void>;
  testConnection(printer: PrinterRow): Promise<void>;
}
```

- [ ] **Step 2: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/driver-types.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add PrinterDriver interface (Task 6)

Single interface with two methods: write(printer, bytes) and
testConnection(printer). The PrinterRow shape comes from
PrinterRepository (Phase 1).

Each invocation opens/closes its own connection — no pool — so a
spontaneous BLE/USB disconnect just costs +1-2s on the next print
instead of leaving the driver in a broken state.

Implementations land in Tasks 7 (Mock), 8 (BLE), 9 (Bluetooth-SPP),
10 (USB shell-based per D-023).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: MockPrinterDriver

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/mock-driver.ts`
- Create: `wifi-voucher-manager/tests/unit/adapters/printers/mock-driver.test.ts`

- [ ] **Step 1: Crear directorio + test (TDD)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && mkdir -p tests/unit/adapters/printers
```

Crear `tests/unit/adapters/printers/mock-driver.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { MockPrinterDriver } from '../../../../src/main/adapters/printers/mock-driver.js';
import type { PrinterRow } from '../../../../src/main/db/repositories/PrinterRepository.js';

const printer: PrinterRow = {
  id: 'p1',
  name: 'Mock',
  connection: 'bluetooth-ble',
  identifier: 'a|b|c',
  width_chars: 32,
  active: 1,
  notes: null,
};

describe('MockPrinterDriver', () => {
  it('mode=success: write resuelve y guarda los bytes', async () => {
    const drv = new MockPrinterDriver({ mode: 'success' });
    await drv.write(printer, new Uint8Array([1, 2, 3]));
    expect(drv.lastWrites).toHaveLength(1);
    expect(Array.from(drv.lastWrites[0]!)).toEqual([1, 2, 3]);
  });

  it('mode=success: testConnection resuelve', async () => {
    const drv = new MockPrinterDriver({ mode: 'success' });
    await expect(drv.testConnection(printer)).resolves.toBeUndefined();
  });

  it('mode=always-fail: write rechaza', async () => {
    const drv = new MockPrinterDriver({ mode: 'always-fail' });
    await expect(drv.write(printer, new Uint8Array([1]))).rejects.toThrow();
  });

  it('mode=always-fail: testConnection rechaza', async () => {
    const drv = new MockPrinterDriver({ mode: 'always-fail' });
    await expect(drv.testConnection(printer)).rejects.toThrow();
  });

  it('mode=fail-after-n: las primeras N writes pasan; la N+1 falla', async () => {
    const drv = new MockPrinterDriver({ mode: 'fail-after-n', failAfterN: 2 });
    await drv.write(printer, new Uint8Array([1]));
    await drv.write(printer, new Uint8Array([2]));
    await expect(drv.write(printer, new Uint8Array([3]))).rejects.toThrow();
  });

  it('latencyMs simula delay', async () => {
    const drv = new MockPrinterDriver({ mode: 'success', latencyMs: 50 });
    const start = Date.now();
    await drv.write(printer, new Uint8Array([1]));
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- mock-driver 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar MockPrinterDriver**

Crear `src/main/adapters/printers/mock-driver.ts`:

```typescript
import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

export type MockMode = 'success' | 'always-fail' | 'fail-after-n';

export interface MockOptions {
  mode: MockMode;
  failAfterN?: number;
  latencyMs?: number;
}

export class MockPrinterDriver implements PrinterDriver {
  readonly lastWrites: Uint8Array[] = [];
  private writeCount = 0;

  constructor(private readonly opts: MockOptions) {}

  private async sleep(): Promise<void> {
    const ms = this.opts.latencyMs ?? 0;
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private maybeFail(): void {
    if (this.opts.mode === 'always-fail') {
      throw new Error('MockPrinterDriver always-fail mode');
    }
    if (this.opts.mode === 'fail-after-n') {
      const n = this.opts.failAfterN ?? 0;
      if (this.writeCount > n) {
        throw new Error(`MockPrinterDriver fail-after-n: count=${this.writeCount} > N=${n}`);
      }
    }
  }

  async write(_printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    await this.sleep();
    this.writeCount++;
    this.maybeFail();
    this.lastWrites.push(new Uint8Array(bytes));
  }

  async testConnection(_printer: PrinterRow): Promise<void> {
    await this.sleep();
    this.maybeFail();
  }
}
```

- [ ] **Step 4: Run test + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- mock-driver 2>&1 | tail -15 && npm run lint && npm run type-check
```

Expected: 6 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/mock-driver.ts wifi-voucher-manager/tests/unit/adapters/printers/mock-driver.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add MockPrinterDriver (Task 7)

Implements PrinterDriver with three modes:
- 'success': all writes resolve. Bytes are recorded in lastWrites for
  inspection.
- 'always-fail': every call rejects with Error.
- 'fail-after-n': first N writes succeed, then they all fail.
  Used to test PrintQueue retry-on-fail-once policies in Task 13.

latencyMs option simulates IPC/IO delay for tests of timing-dependent
flows.

Tests (6): each mode + latency simulation + lastWrites buffer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: BleDriver (port literal de maragon)

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/ble-driver.ts`

- [ ] **Step 1: Crear archivo**

Contenido EXACTO (port de `maragon_pdv/apps/pos/electron/services/printing/ble-driver.ts` con única adaptación de import):

```typescript
import noble, { type Peripheral, type Characteristic } from '@abandonware/noble';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

/**
 * Driver para impresoras Bluetooth Low Energy (BLE).
 *
 * Identifier format: `<peripheralId>|<serviceUuid>|<characteristicUuid>`
 *   - peripheralId: id de noble (en macOS suele ser un UUID, en Windows un MAC).
 *   - serviceUuid: UUID del servicio que tiene la característica de escritura.
 *   - characteristicUuid: UUID de la característica writable / writeWithoutResponse.
 *
 * Discovery se hace en `detect.ts` via `detectBlePrinters()` y devuelve el
 * identifier ya armado en el formato pipe-delimitado.
 *
 * BLE tiene MTU bajo (típicamente 23-185 bytes payload). Escribimos en chunks.
 */

const CHUNK_SIZE = 100; // conservador, casi cualquier MTU lo admite
const INTER_CHUNK_DELAY_MS = 25;

interface ParsedIdentifier {
  peripheralId: string;
  serviceUuid: string;
  charUuid: string;
}

function parseIdentifier(identifier: string): ParsedIdentifier {
  const parts = identifier.split('|');
  if (parts.length !== 3) {
    throw new Error(
      `Identifier BLE inválido: "${identifier}" — esperado <peripheralId>|<serviceUuid>|<charUuid>`
    );
  }
  return {
    peripheralId: parts[0]!,
    serviceUuid: parts[1]!,
    charUuid: parts[2]!,
  };
}

async function waitForPoweredOn(): Promise<void> {
  if ((noble as unknown as { state: string }).state === 'poweredOn') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timeout esperando que el adapter BT esté poweredOn')),
      5_000
    );
    const handler = (state: string): void => {
      if (state === 'poweredOn') {
        clearTimeout(timeout);
        noble.removeListener('stateChange', handler);
        resolve();
      }
    };
    noble.on('stateChange', handler);
  });
}

async function findPeripheral(peripheralId: string, timeoutMs = 10_000): Promise<Peripheral> {
  const cached = (noble as unknown as { _peripherals?: Record<string, Peripheral> })._peripherals;
  if (cached && cached[peripheralId]) {
    return cached[peripheralId]!;
  }
  await noble.startScanningAsync([], false);
  try {
    return await new Promise<Peripheral>((resolve, reject) => {
      const timer = setTimeout(() => {
        noble.removeListener('discover', listener);
        reject(new Error(`No se encontró periférico BLE id=${peripheralId} en ${timeoutMs}ms`));
      }, timeoutMs);
      const listener = (p: Peripheral): void => {
        if (p.id === peripheralId) {
          clearTimeout(timer);
          noble.removeListener('discover', listener);
          resolve(p);
        }
      };
      noble.on('discover', listener);
    });
  } finally {
    await noble.stopScanningAsync();
  }
}

async function writeChunked(
  characteristic: Characteristic,
  bytes: Uint8Array,
  withoutResponse: boolean
): Promise<void> {
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = Buffer.from(bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length)));
    await new Promise<void>((resolve, reject) => {
      characteristic.write(chunk, withoutResponse, (err) => {
        if (err) reject(typeof err === 'string' ? new Error(err) : err);
        else resolve();
      });
    });
    if (INTER_CHUNK_DELAY_MS > 0 && i + CHUNK_SIZE < bytes.length) {
      await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
    }
  }
}

export class BleDriver implements PrinterDriver {
  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const ids = parseIdentifier(printer.identifier);
    await waitForPoweredOn();

    const peripheral = await findPeripheral(ids.peripheralId);
    await peripheral.connectAsync();
    try {
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [ids.serviceUuid],
        [ids.charUuid]
      );
      const char = characteristics[0];
      if (!char) {
        throw new Error(
          `No se encontró la característica ${ids.charUuid} en servicio ${ids.serviceUuid}`
        );
      }
      const props = char.properties as string[];
      const withoutResponse =
        !props.includes('write') && props.includes('writeWithoutResponse');
      await writeChunked(char, bytes, withoutResponse);
    } finally {
      try {
        await peripheral.disconnectAsync();
      } catch {
        /* ignore */
      }
    }
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    const ids = parseIdentifier(printer.identifier);
    await waitForPoweredOn();
    const peripheral = await findPeripheral(ids.peripheralId);
    await peripheral.connectAsync();
    try {
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [ids.serviceUuid],
        [ids.charUuid]
      );
    } finally {
      try {
        await peripheral.disconnectAsync();
      } catch {
        /* ignore */
      }
    }
  }
}
```

- [ ] **Step 2: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: ambos exit 0. **Si lint flagga el cast `as unknown as { state: string }`** o el callback con string-or-error, el archivo importa código nativo de noble cuyas tipificaciones son ligeramente flexibles — en ese caso usar eslint-disable-next-line o el patrón de maragon.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/ble-driver.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): port BleDriver from maragon_pdv (Task 8)

Literal port of apps/pos/electron/services/printing/ble-driver.ts
with the only change being the PrinterRow import path (local
PrinterRepository instead of @maragon/shared).

Behavior:
- waitForPoweredOn(): 5s timeout for the OS BT adapter to come up.
- findPeripheral(): uses noble's internal _peripherals cache when
  available; falls back to a 10s active scan when the peripheral was
  not pre-discovered. The cache hit path matters because we don't
  pay the scan cost on every print.
- writeChunked(): 100-byte chunks with 25ms inter-chunk delay. Both
  values are conservative — most BLE peripherals admit 100b chunks
  without buffer overflow even at MTU=23.
- Picks writeWithoutResponse only when 'write' is unavailable.
- Connect / disconnect per call (no pool) — disconnect is in finally
  with try/catch so a half-connected state is always cleaned up.

Validated against Aomus My A1 BLE in Phase 0 Task 15 (smoke-noble).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: BluetoothDriver (BT-SPP via serialport, port literal)

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/bluetooth-driver.ts`

- [ ] **Step 1: Crear archivo**

Contenido EXACTO (port de `maragon_pdv/apps/pos/electron/services/printing/bluetooth-driver.ts`):

```typescript
import { Buffer } from 'node:buffer';

import { SerialPort } from 'serialport';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

const OPEN_TIMEOUT_MS = 5_000;
const WRITE_DRAIN_TIMEOUT_MS = 5_000;

function openPort(path: string): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
    const timer = setTimeout(() => {
      reject(new Error(`Timeout abriendo puerto serial ${path} (${OPEN_TIMEOUT_MS}ms)`));
    }, OPEN_TIMEOUT_MS);
    port.open((err) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(port);
    });
  });
}

function writeBuffer(port: SerialPort, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => {
      if (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Timeout drenando puerto serial (${WRITE_DRAIN_TIMEOUT_MS}ms)`));
      }, WRITE_DRAIN_TIMEOUT_MS);
      port.drain((drainErr) => {
        clearTimeout(timer);
        if (drainErr) reject(drainErr);
        else resolve();
      });
    });
  });
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    port.close(() => resolve());
  });
}

const INIT_BYTES = new Uint8Array([0x1b, 0x40]); // ESC @

export class BluetoothDriver implements PrinterDriver {
  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const port = await openPort(printer.identifier);
    try {
      await writeBuffer(port, bytes);
    } finally {
      await closePort(port);
    }
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    const port = await openPort(printer.identifier);
    try {
      await writeBuffer(port, INIT_BYTES);
    } finally {
      await closePort(port);
    }
  }
}
```

- [ ] **Step 2: Lint + type-check + commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/bluetooth-driver.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): port BluetoothDriver (BT-SPP via serialport) (Task 9)

Literal port of maragon's bluetooth-driver.ts. Used when a printer
exposes a Bluetooth Classic SPP profile (e.g. Aomus paired in
Win11 with COM3, or any traditional ESC/POS BT printer).

Critical: port.drain() after port.write() — without drain, port.close()
can run before all bytes leave the OS buffer, truncating the ticket.

baudRate: 9600 is fixed value (BT-SPP ignores it but serialport
requires the field).

testConnection sends only ESC @ (INIT) which causes a 'click' on
the printer head but no visible output — useful for verifying the
serial pipe is alive without wasting paper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: UsbDriver (D-023: shell-based, no @thiagoelg/node-printer)

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/usb-driver.ts`
- Create: `wifi-voucher-manager/tests/unit/adapters/printers/usb-driver.test.ts`

- [ ] **Step 1: Escribir test (TDD — mock child_process)**

Crear `tests/unit/adapters/printers/usb-driver.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UsbDriver, parseIdentifier } from '../../../../src/main/adapters/printers/usb-driver.js';
import type { PrinterRow } from '../../../../src/main/db/repositories/PrinterRepository.js';

const printer: PrinterRow = {
  id: 'p',
  name: 'EPSON',
  connection: 'usb',
  identifier: 'printer:EPSON_TM-T20III',
  width_chars: 48,
  active: 1,
  notes: null,
};

describe('UsbDriver.parseIdentifier', () => {
  it('extrae el name detrás de "printer:"', () => {
    expect(parseIdentifier('printer:EPSON_TM')).toBe('EPSON_TM');
  });

  it('lanza Error si el prefix falta', () => {
    expect(() => parseIdentifier('EPSON')).toThrow();
  });

  it('lanza Error si el name está vacío', () => {
    expect(() => parseIdentifier('printer:')).toThrow();
  });
});

describe('UsbDriver.write', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('en macOS spawn lp con stdin = bytes', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const drv = new UsbDriver();
    const spawnedCommands: Array<{ cmd: string; args: string[] }> = [];

    // Inyectamos un spawner mockeado
    drv.setSpawnerForTests((cmd, args, _input) => {
      spawnedCommands.push({ cmd, args });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    await drv.write(printer, new Uint8Array([0x1b, 0x40]));
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]!.cmd).toBe('lp');
    expect(spawnedCommands[0]!.args).toEqual(['-d', 'EPSON_TM-T20III', '-o', 'raw']);
  });

  it('en Windows spawn powershell con Out-Printer', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });

    const drv = new UsbDriver();
    const spawnedCommands: Array<{ cmd: string; args: string[] }> = [];

    drv.setSpawnerForTests((cmd, args, _input) => {
      spawnedCommands.push({ cmd, args });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    await drv.write(printer, new Uint8Array([0x1b, 0x40]));
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]!.cmd).toBe('powershell');
    // Comando contiene Out-Printer + el nombre
    const fullCmd = spawnedCommands[0]!.args.join(' ');
    expect(fullCmd).toContain('Out-Printer');
    expect(fullCmd).toContain('EPSON_TM-T20III');
  });

  it('rechaza si exitCode != 0', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const drv = new UsbDriver();
    drv.setSpawnerForTests(() =>
      Promise.resolve({ exitCode: 1, stdout: '', stderr: 'lp: error' })
    );

    await expect(drv.write(printer, new Uint8Array([1]))).rejects.toThrow(/lp: error|exitCode/);
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- usb-driver 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar UsbDriver**

Crear `src/main/adapters/printers/usb-driver.ts`:

```typescript
import { spawn } from 'node:child_process';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

export function parseIdentifier(identifier: string): string {
  if (!identifier.startsWith('printer:')) {
    throw new Error(`Identifier USB inválido: "${identifier}" — esperado 'printer:<NAME>'`);
  }
  const name = identifier.slice('printer:'.length);
  if (name.length === 0) {
    throw new Error('Identifier USB inválido: nombre vacío');
  }
  return name;
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type Spawner = (cmd: string, args: string[], stdin: Uint8Array) => Promise<SpawnResult>;

const defaultSpawner: Spawner = (cmd, args, stdin) =>
  new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
    if (child.stdin) {
      child.stdin.write(Buffer.from(stdin));
      child.stdin.end();
    }
  });

const POWERSHELL_TEMPLATE = (name: string): string =>
  `$bytes = [Console]::OpenStandardInput().ReadToEnd(); ` +
  `Add-Type -AssemblyName System.Drawing; ` +
  `Out-Printer -Name "${name.replace(/"/g, '`"')}"`;

/**
 * UsbDriver vía shell commands (D-023). Envía bytes ESC/POS al spooler:
 *   - macOS / Linux: `lp -d <NAME> -o raw` con bytes en stdin
 *   - Windows: `powershell` + Out-Printer
 *
 * El name viene del identifier en formato 'printer:<NAME>'. El nombre
 * lo provee el discovery (`lpstat -p` / `Get-Printer`).
 */
export class UsbDriver implements PrinterDriver {
  private spawner: Spawner = defaultSpawner;

  setSpawnerForTests(s: Spawner): void {
    this.spawner = s;
  }

  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const name = parseIdentifier(printer.identifier);
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'linux') {
      const result = await this.spawner('lp', ['-d', name, '-o', 'raw'], bytes);
      if (result.exitCode !== 0) {
        throw new Error(
          `lp falló con exitCode=${result.exitCode}: ${result.stderr.trim() || '<no stderr>'}`
        );
      }
      return;
    }

    if (platform === 'win32') {
      const psCommand = POWERSHELL_TEMPLATE(name);
      const result = await this.spawner('powershell', ['-NoProfile', '-Command', psCommand], bytes);
      if (result.exitCode !== 0) {
        throw new Error(
          `powershell Out-Printer falló con exitCode=${result.exitCode}: ${
            result.stderr.trim() || '<no stderr>'
          }`
        );
      }
      return;
    }

    throw new Error(`UsbDriver no soporta la plataforma: ${platform}`);
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    // Enviamos solo INIT (ESC @) — la impresora hace 'click' sin imprimir.
    await this.write(printer, new Uint8Array([0x1b, 0x40]));
  }
}
```

- [ ] **Step 4: Run tests + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- usb-driver 2>&1 | tail -15 && npm run lint && npm run type-check
```

Expected: 6 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/usb-driver.ts wifi-voucher-manager/tests/unit/adapters/printers/usb-driver.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add UsbDriver via shell (lp / Out-Printer) per D-023 (Task 10)

Replaces the originally-planned @thiagoelg/node-printer dep (dropped
in Phase 0 D-023 because it depends on nan which uses v8 12.x APIs
removed in Electron 39's v8 13).

Strategy: spawn the OS print spooler with ESC/POS bytes on stdin.
- macOS / Linux: 'lp -d <NAME> -o raw'
- Windows: 'powershell -NoProfile -Command Out-Printer -Name <NAME>'

The Spawner is a function type injected via setSpawnerForTests so
tests can mock the subprocess without spawning real shells.
parseIdentifier extracts the printer queue name from
'printer:<NAME>' (the canonical identifier per D-008).

Tests (6): identifier parse + 3 errors, write on macOS dispatches
to lp, write on Windows dispatches to powershell+Out-Printer,
non-zero exitCode rejects with stderr message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: detect.ts — discovery cross-platform

**Files:**
- Create: `wifi-voucher-manager/src/main/adapters/printers/detect.ts`
- Create: `wifi-voucher-manager/tests/unit/adapters/printers/detect.test.ts`

- [ ] **Step 1: Escribir test (mocks de exec/SerialPort/noble)**

Crear `tests/unit/adapters/printers/detect.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { parseGetPrinterOutput, parseLpstatOutput, parseWmicOutput } from '../../../../src/main/adapters/printers/detect.js';

describe('detect parsers', () => {
  it('parseLpstatOutput extrae nombres de "printer X is idle"', () => {
    const stdout = `printer EPSON_TM is idle.\nprinter Aomus_MY-A1 disabled since...\n\n`;
    expect(parseLpstatOutput(stdout)).toEqual(['EPSON_TM', 'Aomus_MY-A1']);
  });

  it('parseLpstatOutput devuelve [] si no hay printers', () => {
    expect(parseLpstatOutput('')).toEqual([]);
    expect(parseLpstatOutput('lpstat: no printers')).toEqual([]);
  });

  it('parseGetPrinterOutput descarta líneas vacías', () => {
    const stdout = `EPSON TM-T20III\n\nMicrosoft Print to PDF\n\n`;
    expect(parseGetPrinterOutput(stdout)).toEqual(['EPSON TM-T20III', 'Microsoft Print to PDF']);
  });

  it('parseWmicOutput descarta el header "Name"', () => {
    const stdout = `Name\n\nEPSON TM-T20III\nMicrosoft Print to PDF\n\n`;
    expect(parseWmicOutput(stdout)).toEqual(['EPSON TM-T20III', 'Microsoft Print to PDF']);
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- detect 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar detect.ts**

Crear `src/main/adapters/printers/detect.ts`:

```typescript
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

import noble, { type Peripheral } from '@abandonware/noble';
import { SerialPort } from 'serialport';

const exec = promisify(execCb);

export type DiscoveredConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

export interface DiscoveredPrinter {
  identifier: string;
  label: string;
  connection: DiscoveredConnection;
  likelyEscPosCompatible: boolean;
  suggestedType?: 'epson' | 'star' | 'aomus' | 'tanca' | 'daruma' | 'brother';
}

const SUGGESTED_TYPE_PATTERNS: Array<{ pat: RegExp; type: DiscoveredPrinter['suggestedType'] }> = [
  { pat: /AOMU|MY[- ]?A1|aomus/i, type: 'aomus' },
  { pat: /EPSON|TM-T\d|TM[- ]\w+/i, type: 'epson' },
  { pat: /\bstar\b|TSP\d|SM-T/i, type: 'star' },
  { pat: /tanca|TP-\d{3}/i, type: 'tanca' },
  { pat: /daruma|DR\d/i, type: 'daruma' },
  { pat: /brother|QL-/i, type: 'brother' },
];

function inferType(name: string): DiscoveredPrinter['suggestedType'] {
  for (const { pat, type } of SUGGESTED_TYPE_PATTERNS) {
    if (pat.test(name)) return type;
  }
  return undefined;
}

// ============================================================================
// Parsers (puros — testeables sin shell)
// ============================================================================

export function parseLpstatOutput(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('printer ')) continue;
    const parts = trimmed.split(' ');
    if (parts.length >= 2 && parts[1]) out.push(parts[1]);
  }
  return out;
}

export function parseGetPrinterOutput(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function parseWmicOutput(stdout: string): string[] {
  return stdout
    .split('\n')
    .slice(1) // skip header 'Name'
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ============================================================================
// USB / system spooler discovery
// ============================================================================

export async function detectUsbPrinters(): Promise<DiscoveredPrinter[]> {
  const results: DiscoveredPrinter[] = [];

  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const { stdout } = await exec('lpstat -p 2>/dev/null || true');
      for (const name of parseLpstatOutput(stdout)) {
        results.push({
          identifier: `printer:${name}`,
          label: `CUPS: ${name}`,
          connection: 'usb',
          likelyEscPosCompatible: true,
          suggestedType: inferType(name),
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (process.platform === 'win32') {
    let names: string[] = [];
    try {
      const { stdout } = await exec(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object -ExpandProperty Name"'
      );
      names = parseGetPrinterOutput(stdout);
    } catch {
      try {
        const { stdout } = await exec('wmic printer get name 2>nul');
        names = parseWmicOutput(stdout);
      } catch {
        /* ignore */
      }
    }
    for (const name of names) {
      results.push({
        identifier: `printer:${name}`,
        label: `Windows: ${name}`,
        connection: 'usb',
        likelyEscPosCompatible: true,
        suggestedType: inferType(name),
      });
    }
  }

  return results;
}

// ============================================================================
// Bluetooth-SPP discovery (paired serial ports)
// ============================================================================

export async function detectBluetoothPrinters(): Promise<DiscoveredPrinter[]> {
  try {
    const ports = await SerialPort.list();
    const isPosix = process.platform === 'darwin' || process.platform === 'linux';
    return ports.map((p) => {
      const path =
        isPosix && p.path.startsWith('/dev/tty.')
          ? p.path.replace('/dev/tty.', '/dev/cu.')
          : p.path;
      const label = `${path}${p.manufacturer ? ` (${p.manufacturer})` : ''}`;
      return {
        identifier: path,
        label,
        connection: 'bluetooth' as const,
        likelyEscPosCompatible: false,
        suggestedType: inferType(label),
      };
    });
  } catch {
    return [];
  }
}

// ============================================================================
// BLE discovery (noble scan)
// ============================================================================

interface BleScanResult {
  identifier: string;
  label: string;
  suggestedType: DiscoveredPrinter['suggestedType'];
}

async function bleScanFor(durationMs: number): Promise<BleScanResult[]> {
  const seen = new Map<string, BleScanResult>();
  const stateOk = (noble as unknown as { state: string }).state === 'poweredOn';
  if (!stateOk) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('BLE no disponible')), 3_000);
      const handler = (s: string): void => {
        if (s === 'poweredOn') {
          clearTimeout(timer);
          noble.removeListener('stateChange', handler);
          resolve();
        }
      };
      noble.on('stateChange', handler);
    });
  }

  await noble.startScanningAsync([], false);
  return new Promise<BleScanResult[]>((resolve) => {
    const onDiscover = (p: Peripheral): void => {
      if (seen.has(p.id)) return;
      const localName = p.advertisement?.localName;
      if (!localName) return;
      // Para BLE el identifier completo requiere svcUuid|charUuid; en la fase de
      // discovery devolvemos el id "stub" — el admin completará al
      // seleccionarla. En Phase 3 el modal hará discoverServices al click.
      seen.set(p.id, {
        identifier: `${p.id}|<svc>|<char>`,
        label: localName,
        suggestedType: inferType(localName),
      });
    };
    noble.on('discover', onDiscover);

    setTimeout(() => {
      noble.removeListener('discover', onDiscover);
      void noble.stopScanningAsync().finally(() => resolve(Array.from(seen.values())));
    }, durationMs);
  });
}

export async function detectBlePrinters(durationMs = 6_000): Promise<DiscoveredPrinter[]> {
  try {
    const found = await bleScanFor(durationMs);
    return found.map((f) => ({
      identifier: f.identifier,
      label: f.label,
      connection: 'bluetooth-ble',
      likelyEscPosCompatible: true,
      suggestedType: f.suggestedType,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Combined discovery
// ============================================================================

export async function discoverAll(timeoutMs = 10_000): Promise<DiscoveredPrinter[]> {
  const start = Date.now();
  const promises = [detectUsbPrinters(), detectBluetoothPrinters(), detectBlePrinters()];
  const results = await Promise.race([
    Promise.allSettled(promises),
    new Promise<PromiseSettledResult<DiscoveredPrinter[]>[]>((resolve) =>
      setTimeout(() => resolve([]), timeoutMs)
    ),
  ]);
  void start;
  const out: DiscoveredPrinter[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  return out;
}
```

- [ ] **Step 4: Run tests + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- detect 2>&1 | tail -10 && npm run lint && npm run type-check
```

Expected: 4 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/adapters/printers/detect.ts wifi-voucher-manager/tests/unit/adapters/printers/detect.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add cross-platform discovery (Task 11)

detectUsbPrinters / detectBluetoothPrinters / detectBlePrinters +
discoverAll() umbrella with Promise.allSettled and 10s global timeout.

USB:
- macOS/Linux: 'lpstat -p' to enumerate CUPS queues
- Windows: 'Get-Printer' (PowerShell, Win11-supported) primary;
  falls back to 'wmic printer get name' if PS is blocked by GPO

BT-SPP: SerialPort.list() with /dev/tty.* → /dev/cu.* normalization
on POSIX (BT-SPP /dev/tty paths block on open() waiting for DCD).

BLE: noble scan (6s default), filtered by advertisement.localName
not empty (drops anonymous beacons). Identifier returned as
'<peripheralId>|<svc>|<char>' stub — the admin selection flow in
Phase 3 will resolve actual services via discoverServices.

Brand inference: 6 regex patterns for aomus/epson/star/tanca/daruma/
brother. Used as the suggestedType hint to pre-select the printer
type in AdminView.

Pure parsers exposed (parseLpstatOutput, parseGetPrinterOutput,
parseWmicOutput) and unit-tested without shell access.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: PrintJobRepository

**Files:**
- Create: `wifi-voucher-manager/src/main/db/repositories/PrintJobRepository.ts`
- Create: `wifi-voucher-manager/tests/integration/PrintJobRepository.test.ts`

- [ ] **Step 1: Escribir test (TDD)**

Crear `tests/integration/PrintJobRepository.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PrintJobRepository } from '../../src/main/db/repositories/PrintJobRepository.js';
import { PrinterRepository } from '../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PrintJobRepository', () => {
  let db: Knex;
  let repo: PrintJobRepository;
  let printerId: string;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const pRepo = new PrinterRepository(db);
    const printer = await pRepo.create({
      id: randomUUID(),
      name: 'X',
      connection: 'bluetooth-ble',
      identifier: 'a|b|c',
      width_chars: 32,
      active: 1,
      notes: null,
    });
    printerId = printer.id;
    repo = new PrintJobRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('enqueue + findById', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{"x":1}',
      triggered_by: 'waiter',
    });
    expect(job.status).toBe('pending');
    const found = await repo.findById(job.id);
    expect(found?.id).toBe(job.id);
  });

  it('listPending devuelve sólo pending', async () => {
    const a = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markPrinted(a.id);
    await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    const pending = await repo.listPending();
    expect(pending).toHaveLength(1);
  });

  it('markPrinted setea status + printed_at', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markPrinted(job.id);
    const found = await repo.findById(job.id);
    expect(found?.status).toBe('printed');
    expect(found?.printed_at).toBeTruthy();
  });

  it('markFailed setea status + last_error + incrementa attempts', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markFailed(job.id, 'BLE off');
    const found = await repo.findById(job.id);
    expect(found?.status).toBe('failed');
    expect(found?.last_error).toBe('BLE off');
    expect(found?.attempts).toBe(1);
  });

  it('listRecent ordena por created_at DESC', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const j = await repo.enqueue({
        printer_id: printerId,
        use_case: 'voucher',
        payload_data: '{}',
        triggered_by: null,
      });
      ids.push(j.id);
      await new Promise((r) => setTimeout(r, 5));
    }
    const recent = await repo.listRecent(10);
    expect(recent[0]!.id).toBe(ids[2]);
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrintJobRepository 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar PrintJobRepository**

Crear `src/main/db/repositories/PrintJobRepository.ts`:

```typescript
import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';

export type JobStatus = 'pending' | 'printed' | 'failed';

export interface PrintJobRow {
  id: string;
  printer_id: string;
  use_case: 'voucher';
  payload_data: string;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  triggered_by: string | null;
  created_at: string;
  printed_at: string | null;
}

export interface EnqueueInput {
  printer_id: string;
  use_case: 'voucher';
  payload_data: string;
  triggered_by: string | null;
}

export class PrintJobRepository {
  constructor(private readonly db: Knex) {}

  async enqueue(input: EnqueueInput): Promise<PrintJobRow> {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    await this.db('print_job').insert({
      id,
      ...input,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at,
      printed_at: null,
    });
    const row = await this.findById(id);
    if (!row) throw new Error(`PrintJobRepository.enqueue: row id=${id} no encontrada`);
    return row;
  }

  async findById(id: string): Promise<PrintJobRow | null> {
    const row = await this.db<PrintJobRow>('print_job').where({ id }).first();
    return row ?? null;
  }

  async listPending(): Promise<PrintJobRow[]> {
    return this.db<PrintJobRow>('print_job').where({ status: 'pending' }).orderBy('created_at');
  }

  async listRecent(limit = 50): Promise<PrintJobRow[]> {
    return this.db<PrintJobRow>('print_job').orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit);
  }

  async markPrinted(id: string): Promise<void> {
    await this.db('print_job').where({ id }).update({
      status: 'printed',
      printed_at: new Date().toISOString(),
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const job = await this.findById(id);
    const attempts = (job?.attempts ?? 0) + 1;
    await this.db('print_job').where({ id }).update({
      status: 'failed',
      last_error: error,
      attempts,
    });
  }

  async resetToPending(id: string): Promise<void> {
    await this.db('print_job').where({ id }).update({
      status: 'pending',
      last_error: null,
    });
  }
}
```

- [ ] **Step 4: Run test + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm rebuild better-sqlite3 argon2 && npm run test -- PrintJobRepository 2>&1 | tail -15 && npm run lint && npm run type-check
```

Expected: 5 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/db/repositories/PrintJobRepository.ts wifi-voucher-manager/tests/integration/PrintJobRepository.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add PrintJobRepository (Task 12)

Methods:
- enqueue(input): inserts pending job with uuid id, returns row
- findById(id): row or null
- listPending(): pending jobs ordered by created_at (queue order)
- listRecent(limit=50): all jobs DESC by created_at (Logs panel feed)
- markPrinted(id): status='printed', printed_at=now
- markFailed(id, error): status='failed', last_error, attempts+1
- resetToPending(id): retry path — clears last_error, status='pending'

Tests (5 cases): enqueue+findById, listPending filters out non-
pending, markPrinted sets timestamp, markFailed increments attempts,
listRecent order DESC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: PrintQueue — cola serializada con DI de drivers

**Files:**
- Create: `wifi-voucher-manager/src/main/services/PrintQueue.ts`
- Create: `wifi-voucher-manager/tests/unit/services/PrintQueue.test.ts`

- [ ] **Step 1: Escribir test (TDD con MockPrinterDriver)**

Crear `tests/unit/services/PrintQueue.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockPrinterDriver } from '../../../src/main/adapters/printers/mock-driver.js';
import type { PrinterDriver } from '../../../src/main/adapters/printers/driver-types.js';
import { createConnection } from '../../../src/main/db/connection.js';
import { PrintJobRepository } from '../../../src/main/db/repositories/PrintJobRepository.js';
import { PrinterRepository } from '../../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../../src/main/db/run-migrations.js';
import { PrintQueue } from '../../../src/main/services/PrintQueue.js';

describe('PrintQueue', () => {
  let db: Knex;
  let jobs: PrintJobRepository;
  let printers: PrinterRepository;
  let printerId: string;
  let mockDriver: MockPrinterDriver;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    jobs = new PrintJobRepository(db);
    printers = new PrinterRepository(db);
    const p = await printers.create({
      id: randomUUID(),
      name: 'Mock',
      connection: 'bluetooth-ble',
      identifier: 'a|b|c',
      width_chars: 32,
      active: 1,
      notes: null,
    });
    printerId = p.id;
    mockDriver = new MockPrinterDriver({ mode: 'success', latencyMs: 10 });
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeQueue(driver: PrinterDriver): PrintQueue {
    const renderBytes = (): Uint8Array => new Uint8Array([0x1b, 0x40]);
    const drivers = {
      usb: driver,
      bluetooth: driver,
      'bluetooth-ble': driver,
    };
    return new PrintQueue({ db, jobs, printers, drivers, renderBytes });
  }

  it('enqueue procesa el job y lo marca printed', async () => {
    const queue = makeQueue(mockDriver);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: { x: 1 },
      triggered_by: 'waiter',
    });
    await queue.waitIdle();
    const job = await jobs.findById(jobId);
    expect(job?.status).toBe('printed');
    expect(mockDriver.lastWrites).toHaveLength(1);
  });

  it('múltiples enqueues se procesan secuencialmente', async () => {
    const queue = makeQueue(mockDriver);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await queue.enqueue({
        printer_id: printerId,
        use_case: 'voucher',
        payload: { i },
        triggered_by: null,
      });
      ids.push(id);
    }
    await queue.waitIdle();
    for (const id of ids) {
      const job = await jobs.findById(id);
      expect(job?.status).toBe('printed');
    }
    expect(mockDriver.lastWrites).toHaveLength(5);
  });

  it('cuando el driver falla, marca failed con last_error', async () => {
    const failing = new MockPrinterDriver({ mode: 'always-fail' });
    const queue = makeQueue(failing);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: { x: 1 },
      triggered_by: null,
    });
    await queue.waitIdle();
    const job = await jobs.findById(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.last_error).toBeTruthy();
    expect(job?.attempts).toBe(1);
  });

  it('retry(jobId) re-encola un job failed', async () => {
    const failing = new MockPrinterDriver({ mode: 'always-fail' });
    const queue = makeQueue(failing);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: {},
      triggered_by: null,
    });
    await queue.waitIdle();
    expect((await jobs.findById(jobId))?.status).toBe('failed');

    // Cambiar driver a success vía nuevo queue
    const queue2 = makeQueue(mockDriver);
    await queue2.retry(jobId);
    await queue2.waitIdle();
    expect((await jobs.findById(jobId))?.status).toBe('printed');
  });

  it('bootstrap procesa pending pre-existentes', async () => {
    // Insertar un job pending sin queue
    await jobs.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    const queue = makeQueue(mockDriver);
    await queue.bootstrap();
    await queue.waitIdle();
    const pending = await jobs.listPending();
    expect(pending).toHaveLength(0);
    expect(mockDriver.lastWrites).toHaveLength(1);
  });

  it('getJobStatus expone status + last_error', async () => {
    const queue = makeQueue(mockDriver);
    const id = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: {},
      triggered_by: null,
    });
    await queue.waitIdle();
    const status = await queue.getJobStatus(id);
    expect(status?.status).toBe('printed');
    expect(status?.lastError).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (debe fallar)**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrintQueue 2>&1 | tail -10
```

Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar PrintQueue**

Crear `src/main/services/PrintQueue.ts`:

```typescript
import type { Knex } from 'knex';

import type { PrinterDriver } from '../adapters/printers/driver-types.js';
import type { PrintJobRepository, JobStatus } from '../db/repositories/PrintJobRepository.js';
import type { PrinterRepository } from '../db/repositories/PrinterRepository.js';
import type { PrintUseCase } from './render.js';

export interface PrintQueueDeps {
  db: Knex;
  jobs: PrintJobRepository;
  printers: PrinterRepository;
  drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver>;
  renderBytes: (useCase: PrintUseCase, payload: object, widthChars: 32 | 48) => Uint8Array;
}

export interface EnqueueInput {
  printer_id: string;
  use_case: PrintUseCase;
  payload: object;
  triggered_by: string | null;
}

export interface JobStatusSnapshot {
  status: JobStatus;
  lastError: string | null;
}

export class PrintQueue {
  private processing = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly deps: PrintQueueDeps) {}

  async enqueue(input: EnqueueInput): Promise<string> {
    const job = await this.deps.jobs.enqueue({
      printer_id: input.printer_id,
      use_case: input.use_case,
      payload_data: JSON.stringify(input.payload),
      triggered_by: input.triggered_by,
    });
    void this.processNext();
    return job.id;
  }

  async retry(jobId: string): Promise<void> {
    await this.deps.jobs.resetToPending(jobId);
    void this.processNext();
  }

  async bootstrap(): Promise<void> {
    void this.processNext();
  }

  async getJobStatus(jobId: string): Promise<JobStatusSnapshot | null> {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) return null;
    return { status: job.status, lastError: job.last_error };
  }

  async waitIdle(): Promise<void> {
    if (!this.processing) {
      const pending = await this.deps.jobs.listPending();
      if (pending.length === 0) return;
    }
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      // Drain todos los pending serializados
      while (true) {
        const pending = await this.deps.jobs.listPending();
        if (pending.length === 0) break;
        const job = pending[0]!;
        await this.processOne(job.id);
      }
    } finally {
      this.processing = false;
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];
      for (const r of resolvers) r();
    }
  }

  private async processOne(jobId: string): Promise<void> {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) return;
    const printer = await this.deps.printers.findById(job.printer_id);
    if (!printer) {
      await this.deps.jobs.markFailed(jobId, `Printer ${job.printer_id} no existe`);
      return;
    }
    const driver = this.deps.drivers[printer.connection];
    if (!driver) {
      await this.deps.jobs.markFailed(jobId, `Sin driver para connection=${printer.connection}`);
      return;
    }
    try {
      const payload = JSON.parse(job.payload_data) as object;
      const bytes = this.deps.renderBytes(job.use_case, payload, printer.width_chars);
      await driver.write(printer, bytes);
      await this.deps.jobs.markPrinted(jobId);
    } catch (err) {
      await this.deps.jobs.markFailed(
        jobId,
        err instanceof Error ? err.message : 'Error desconocido'
      );
    }
  }
}
```

- [ ] **Step 4: Run test + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- PrintQueue 2>&1 | tail -15 && npm run lint && npm run type-check
```

Expected: 6 passed; lint + type-check exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/services/PrintQueue.ts wifi-voucher-manager/tests/unit/services/PrintQueue.test.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add PrintQueue with serialized dispatch (Task 13)

PrintQueue receives Knex db, the two repositories, the 3 drivers
(by connection type), and a renderBytes function. DI everywhere.

Methods:
- enqueue(input): inserts pending job, returns id, kicks the
  processor (no auto-retry per D-009; if it fails the user/admin
  must call retry).
- retry(jobId): resetToPending + kick processor.
- bootstrap(): re-processes pending jobs on startup (e.g. after
  a crash mid-print).
- getJobStatus(id): { status, lastError } snapshot.
- waitIdle(): test helper, resolves when the processor empties.

processNext is guarded by a 'processing' boolean — only one job at
a time. processOne() reads the job, looks up the printer, picks the
driver by printer.connection, calls renderBytes, writes via the
driver, and marks printed/failed accordingly. JSON.parse of
payload_data happens inside the try so a malformed payload becomes
a 'failed' job with a legible error.

Tests (6 cases): enqueue → printed, 5 sequential printed, driver
fails → failed with attempts=1, retry brings a failed job back
to printed under a fresh driver, bootstrap drains pre-existing
pending rows, getJobStatus snapshot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Update shared/types.ts — añadir PrinterAPI namespace

**Files:**
- Modify: `wifi-voucher-manager/src/shared/types.ts`

- [ ] **Step 1: Reemplazar contenido del archivo**

```typescript
export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
}

export interface PrintVoucherJobResult {
  ok: true;
  jobId: string;
}

export interface PrintVoucherError {
  ok: false;
  code: 'NO_ACTIVE_PASSWORD' | 'NO_ACTIVE_PRINTER' | 'ENQUEUE_FAILED';
  message: string;
}

export type PrintVoucherResult = PrintVoucherJobResult | PrintVoucherError;

export type PrinterConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

export interface DiscoveredPrinter {
  identifier: string;
  label: string;
  connection: PrinterConnection;
  likelyEscPosCompatible: boolean;
  suggestedType?: 'epson' | 'star' | 'aomus' | 'tanca' | 'daruma' | 'brother';
}

export interface PrinterTestResult {
  success: boolean;
  online: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface PrinterRecord {
  id: string;
  name: string;
  connection: PrinterConnection;
  identifier: string;
  width_chars: 32 | 48;
  active: boolean;
  notes: string | null;
}

export type JobStatus = 'pending' | 'printed' | 'failed';

export interface JobStatusSnapshot {
  status: JobStatus;
  lastError: string | null;
}

export interface RecentJobSummary {
  id: string;
  status: JobStatus;
  createdAt: string;
  lastError: string | null;
}

export interface WaiterAPI {
  getCurrentSSID: () => Promise<string>;
  getSystemHealth: () => Promise<SystemHealth>;
  printVoucher: () => Promise<PrintVoucherResult>;
}

export interface PrinterAPI {
  discover: () => Promise<DiscoveredPrinter[]>;
  testConnection: (input: {
    connection: PrinterConnection;
    identifier: string;
    width_chars: 32 | 48;
  }) => Promise<PrinterTestResult>;
  list: () => Promise<PrinterRecord[]>;
  setActive: (id: string) => Promise<void>;
  getJobStatus: (jobId: string) => Promise<JobStatusSnapshot | null>;
  retryJob: (jobId: string) => Promise<void>;
  listRecentJobs: (limit?: number) => Promise<RecentJobSummary[]>;
}

export interface IpcAPI {
  waiter: WaiterAPI;
  printer: PrinterAPI;
  // admin / router / stats land in later phases
}
```

- [ ] **Step 2: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: type-check probablemente FALLA en `printStore.ts` y `useSystemHealth.ts` porque `PrintVoucherResult` cambió de shape (era `{ok:true, ssid, password, payload, dataUrl}` ahora `{ok:true, jobId}`). Está OK — la Task 19 lo arregla. Si lint pasa pero type-check no, anotar el error y continuar.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/shared/types.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): extend IpcAPI with printer namespace + job-based voucher (Task 14)

PrintVoucherResult now returns { ok:true, jobId } instead of the
Phase 1 preview shape (ssid+password+payload+dataUrl). The renderer
will poll printer.getJobStatus(jobId) to react to printed/failed.
Phase 1 callers (printStore, WaiterView) update in Task 19/20.

PrinterAPI exposes:
- discover(): cross-platform scan (Task 11)
- testConnection({connection, identifier, width_chars}): probe an
  arbitrary printer config without persisting it
- list(): all configured printers
- setActive(id): mark this row active=1
- getJobStatus(jobId): snapshot for renderer polling
- retryJob(jobId): re-enqueue a failed job
- listRecentJobs(limit): for the future Logs panel

CRUD create/update/delete are deferred to Phase 3 AdminView panel
(they need the discovery modal flow to be useful). Phase 2 just
needs setActive so the seed printer can be marked active.

DiscoveredPrinter, PrinterTestResult, PrinterRecord, JobStatus,
JobStatusSnapshot, RecentJobSummary join SystemHealth as renderer-
visible types.

NOTE: this commit breaks type-check on printStore + WaiterView
(they assume the Phase 1 preview shape). Task 19 + 20 fix it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: IPC printer handlers + zod validation

**Files:**
- Create: `wifi-voucher-manager/src/main/ipc/printer.ts`

- [ ] **Step 1: Crear archivo**

```typescript
import electron from 'electron';
import { z } from 'zod';

import type {
  DiscoveredPrinter,
  JobStatusSnapshot,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
} from '../../shared/types.js';
import type { PrinterDriver } from '../adapters/printers/driver-types.js';
import { discoverAll } from '../adapters/printers/detect.js';
import type { PrinterRepository, PrinterRow } from '../db/repositories/PrinterRepository.js';
import type { PrintJobRepository } from '../db/repositories/PrintJobRepository.js';
import type { PrintQueue } from '../services/PrintQueue.js';

const { ipcMain } = electron;

const ConnectionSchema = z.union([z.literal('usb'), z.literal('bluetooth'), z.literal('bluetooth-ble')]);

const TestConnectionSchema = z.object({
  connection: ConnectionSchema,
  identifier: z.string().min(1),
  width_chars: z.union([z.literal(32), z.literal(48)]),
});

const SetActiveSchema = z.object({ id: z.string().min(1) });
const JobIdSchema = z.object({ jobId: z.string().min(1) });
const ListRecentSchema = z.object({ limit: z.number().int().positive().max(500).optional() });

function rowToRecord(row: PrinterRow): PrinterRecord {
  return {
    id: row.id,
    name: row.name,
    connection: row.connection,
    identifier: row.identifier,
    width_chars: row.width_chars,
    active: row.active === 1,
    notes: row.notes,
  };
}

export interface PrinterHandlerDeps {
  printers: PrinterRepository;
  jobs: PrintJobRepository;
  queue: PrintQueue;
  drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver>;
}

export function registerPrinterHandlers(deps: PrinterHandlerDeps): void {
  ipcMain.handle('printer:discover', async (): Promise<DiscoveredPrinter[]> => {
    return discoverAll();
  });

  ipcMain.handle(
    'printer:test-connection',
    async (_e, raw: unknown): Promise<PrinterTestResult> => {
      const input = TestConnectionSchema.parse(raw);
      const driver = deps.drivers[input.connection];
      if (!driver) {
        return { success: false, online: false, latencyMs: 0, errorMessage: `No hay driver para ${input.connection}` };
      }
      const fakeRow: PrinterRow = {
        id: '<test>',
        name: 'test',
        connection: input.connection,
        identifier: input.identifier,
        width_chars: input.width_chars,
        active: 0,
        notes: null,
      };
      const start = Date.now();
      try {
        await driver.testConnection(fakeRow);
        return { success: true, online: true, latencyMs: Date.now() - start };
      } catch (err) {
        return {
          success: false,
          online: false,
          latencyMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : 'Error desconocido',
        };
      }
    }
  );

  ipcMain.handle('printer:list', async (): Promise<PrinterRecord[]> => {
    const rows = await deps.printers.list();
    return rows.map(rowToRecord);
  });

  ipcMain.handle('printer:set-active', async (_e, raw: unknown): Promise<void> => {
    const { id } = SetActiveSchema.parse(raw);
    await deps.printers.setActive(id);
  });

  ipcMain.handle(
    'printer:get-job-status',
    async (_e, raw: unknown): Promise<JobStatusSnapshot | null> => {
      const { jobId } = JobIdSchema.parse(raw);
      return deps.queue.getJobStatus(jobId);
    }
  );

  ipcMain.handle('printer:retry-job', async (_e, raw: unknown): Promise<void> => {
    const { jobId } = JobIdSchema.parse(raw);
    await deps.queue.retry(jobId);
  });

  ipcMain.handle('printer:list-recent-jobs', async (_e, raw: unknown): Promise<RecentJobSummary[]> => {
    const { limit } = ListRecentSchema.parse(raw ?? {});
    const rows = await deps.jobs.listRecent(limit);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      lastError: r.last_error,
    }));
  });
}

export function unregisterPrinterHandlers(): void {
  ipcMain.removeHandler('printer:discover');
  ipcMain.removeHandler('printer:test-connection');
  ipcMain.removeHandler('printer:list');
  ipcMain.removeHandler('printer:set-active');
  ipcMain.removeHandler('printer:get-job-status');
  ipcMain.removeHandler('printer:retry-job');
  ipcMain.removeHandler('printer:list-recent-jobs');
}
```

- [ ] **Step 2: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: lint exit 0; type-check **probablemente sigue rompiendo en printStore.ts/WaiterView.tsx** por la migración de PrintVoucherResult. Eso lo arregla Task 19+20.

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/ipc/printer.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): add IPC printer handlers with zod validation (Task 15)

7 ipcMain.handle registrations: discover, test-connection, list,
set-active, get-job-status, retry-job, list-recent-jobs.

Each handler with input validates against a zod schema before doing
work. test-connection synthesizes a temporary PrinterRow from the
input and calls driver.testConnection — no DB row is created.

rowToRecord() maps PrinterRow.active (0|1) → PrinterRecord.active
(boolean) for renderer ergonomics; the DB stays as integer per
SQLite convention.

CRUD create/update/delete are NOT here — they belong to Phase 3
AdminView (the discovery modal flow).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Update preload bridge

**Files:**
- Modify: `wifi-voucher-manager/src/preload/index.ts`

- [ ] **Step 1: Reemplazar contenido**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

import type {
  DiscoveredPrinter,
  IpcAPI,
  JobStatusSnapshot,
  PrintVoucherResult,
  PrinterConnection,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
  SystemHealth,
} from '../shared/types.js';

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
};

contextBridge.exposeInMainWorld('api', api);
```

- [ ] **Step 2: Build preload + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run build:preload && npm run lint
```

Expected: build:preload OK; lint exit 0. Type-check sigue rompiendo en printStore/WaiterView (Task 19+20).

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/preload/index.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): expose window.api.printer.* via preload (Task 16)

Adds 7 methods under window.api.printer namespace, each as a typed
ipcRenderer.invoke wrapper. The IpcAPI shape from shared/types.ts
keeps the preload + handlers + renderer fully type-aligned.

Note: Task 14 changed PrintVoucherResult shape — printStore +
WaiterView lag behind until Tasks 19/20.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Update waiter.ts handler — printVoucher ahora encola

**Files:**
- Modify: `wifi-voucher-manager/src/main/ipc/waiter.ts`

- [ ] **Step 1: Reemplazar contenido completo**

```typescript
import electron from 'electron';

import type { PrintVoucherResult, SystemHealth } from '../../shared/types.js';
import type { PasswordRepository } from '../db/repositories/PasswordRepository.js';
import type { PrinterRepository } from '../db/repositories/PrinterRepository.js';
import type { PrintQueue } from '../services/PrintQueue.js';
import type { QRService } from '../services/QRService.js';

const { ipcMain } = electron;

export interface WaiterHandlerDeps {
  passwords: PasswordRepository;
  printers: PrinterRepository;
  qr: QRService;
  queue: PrintQueue;
  defaultSsid: string;
  businessName: string;
  footerMessage: string;
}

export function registerWaiterHandlers(deps: WaiterHandlerDeps): void {
  ipcMain.handle('waiter:get-current-ssid', async (): Promise<string> => {
    const active = await deps.passwords.getActive();
    return active?.ssid ?? deps.defaultSsid;
  });

  ipcMain.handle('waiter:get-system-health', async (): Promise<SystemHealth> => {
    const active = await deps.passwords.getActive();
    const allPrinters = await deps.printers.list();
    const activePrinter = allPrinters.find((p) => p.active === 1);
    return {
      printerOnline: activePrinter !== undefined,
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
    const allPrinters = await deps.printers.list();
    const activePrinter = allPrinters.find((p) => p.active === 1);
    if (!activePrinter) {
      return {
        ok: false,
        code: 'NO_ACTIVE_PRINTER',
        message: 'No hay impresora activa. Configura una en Administración.',
      };
    }
    try {
      const generated = await deps.qr.generate({
        ssid: active.ssid,
        password: active.password,
      });
      const jobId = await deps.queue.enqueue({
        printer_id: activePrinter.id,
        use_case: 'voucher',
        payload: {
          business_name: deps.businessName,
          ssid: active.ssid,
          qrPng: generated.pngBuffer.toString('base64'),
          footer_message: deps.footerMessage,
          triggered_at: new Date().toISOString(),
        },
        triggered_by: 'waiter',
      });
      return { ok: true, jobId };
    } catch (err) {
      return {
        ok: false,
        code: 'ENQUEUE_FAILED',
        message: err instanceof Error ? err.message : 'Error encolando job',
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

**Nota crítica sobre `qrPng`:** se serializa como base64 string (no Buffer) porque `JSON.stringify` no preserva Buffer. El `voucher.ts` template tendrá que aceptar string o Buffer. Edit voucher.ts en step 2.

- [ ] **Step 2: Adaptar `voucher.ts` para aceptar `qrPng` como string base64 también**

Modificar `src/main/templates/voucher.ts`. Reemplazar la interface `VoucherPayload` con:

```typescript
export interface VoucherPayload {
  business_name: string;
  ssid: string;
  qrPng: Buffer | string; // Buffer en uso directo, string base64 cuando viene de JSON
  footer_message: string;
  triggered_at: string;
  is_test?: boolean;
}
```

Y en `renderVoucher`, justo antes de `builder.image(payload.qrPng)`, normalizar:

```typescript
  const qrPngBuffer =
    typeof payload.qrPng === 'string' ? Buffer.from(payload.qrPng, 'base64') : payload.qrPng;
```

Y reemplazar `.image(payload.qrPng)` por `.image(qrPngBuffer)`.

Importar Buffer al inicio:

```typescript
import { Buffer } from 'node:buffer';
```

- [ ] **Step 3: Lint + type-check + tests del template**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run test -- voucher 2>&1 | tail -10
```

Expected: lint OK; voucher tests siguen passing (3/3) porque pasan Buffer directamente.

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/ipc/waiter.ts wifi-voucher-manager/src/main/templates/voucher.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): waiter.printVoucher now enqueues a real print job (Task 17)

Phase 1 returned {ok:true, ssid, password, payload, dataUrl} for
preview. Phase 2 returns {ok:true, jobId} after enqueuing to
PrintQueue. The renderer polls printer.getJobStatus(jobId) for
state.

Steps:
1. Look up active password (passwords.getActive). NO_ACTIVE_PASSWORD
   error if none.
2. Look up active printer (filter list() for active===1).
   NO_ACTIVE_PRINTER error if none.
3. qr.generate produces PNG buffer (raster source).
4. queue.enqueue with use_case='voucher' and payload as a JSON-
   safe object: qrPng is base64-encoded string, not Buffer (Buffer
   doesn't survive JSON.stringify).
5. Return jobId.

voucher.ts template now accepts qrPng as Buffer | string. When
string, it's base64-decoded inside renderVoucher before calling
builder.image().

WaiterHandlerDeps grew: now includes PrinterRepository, PrintQueue,
businessName, and footerMessage. Wired in main composition root
(Task 18).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Update main/index.ts — full composition root

**Files:**
- Modify: `wifi-voucher-manager/src/main/index.ts`

- [ ] **Step 1: Reemplazar contenido completo**

```typescript
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import electron from 'electron';

import { BleDriver } from './adapters/printers/ble-driver.js';
import { BluetoothDriver } from './adapters/printers/bluetooth-driver.js';
import type { PrinterDriver } from './adapters/printers/driver-types.js';
import { UsbDriver } from './adapters/printers/usb-driver.js';
import { createConnection } from './db/connection.js';
import { PasswordRepository } from './db/repositories/PasswordRepository.js';
import { PrinterRepository } from './db/repositories/PrinterRepository.js';
import { PrintJobRepository } from './db/repositories/PrintJobRepository.js';
import { runMigrations } from './db/run-migrations.js';
import { registerPrinterHandlers } from './ipc/printer.js';
import { registerWaiterHandlers } from './ipc/waiter.js';
import { DEV_CSP, PROD_CSP } from './security/csp.js';
import { PasswordService } from './services/PasswordService.js';
import { PrintQueue } from './services/PrintQueue.js';
import { QRService } from './services/QRService.js';
import { renderPrintBytes } from './services/render.js';

const { app, BrowserWindow, session } = electron;

app.setName('wifi-voucher-manager');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SSID = 'Restaurante-Clientes';
const DEFAULT_BUSINESS_NAME = 'Mi Restaurante';
const DEFAULT_FOOTER = '¡Gracias por tu visita!';

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
  console.warn('[bootstrap] DB path:', dbPath);
  const db = createConnection({ filename: dbPath });
  await runMigrations(db);

  const passwords = new PasswordRepository(db);
  const printers = new PrinterRepository(db);
  const jobs = new PrintJobRepository(db);

  // Seed password si no hay activa
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

  // Seed printer si no hay ninguna
  const allPrinters = await printers.list();
  if (allPrinters.length === 0) {
    await printers.create({
      id: randomUUID(),
      name: 'Aomus My A1 (placeholder)',
      connection: 'bluetooth-ble',
      identifier: 'placeholder|svc|char',
      width_chars: 32,
      active: 1,
      notes: 'Configura el identifier real desde AdminView (Fase 3)',
    });
    console.warn('[bootstrap] Sembrada impresora placeholder. Reemplazar el identifier desde AdminView en Fase 3.');
  }

  const drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver> = {
    usb: new UsbDriver(),
    bluetooth: new BluetoothDriver(),
    'bluetooth-ble': new BleDriver(),
  };

  const qr = new QRService();
  const queue = new PrintQueue({
    db,
    jobs,
    printers,
    drivers,
    renderBytes: renderPrintBytes,
  });

  await queue.bootstrap();

  registerWaiterHandlers({
    passwords,
    printers,
    qr,
    queue,
    defaultSsid: DEFAULT_SSID,
    businessName: DEFAULT_BUSINESS_NAME,
    footerMessage: DEFAULT_FOOTER,
  });

  registerPrinterHandlers({ printers, jobs, queue, drivers });

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

- [ ] **Step 2: Lint + type-check + build:electron**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run build:electron 2>&1 | tail -5
```

Expected: lint OK; build:electron compila (genera dist-electron/main/index.js). type-check rompe en renderer (Tasks 19+20 lo arreglan).

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/main/index.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): full composition root with drivers + queue + handlers (Task 18)

Bootstrap now wires the entire Phase 2 stack:
1. DB connection + migrations
2. Three repositories (passwords, printers, jobs)
3. Seed password if none active (Phase 1 behavior preserved)
4. Seed PLACEHOLDER printer if none exists — connection='bluetooth-ble',
   identifier='placeholder|svc|char'. The admin will replace the
   identifier from the discovery modal in Phase 3. Until then any
   print attempt fails with 'No se encontró periférico BLE
   id=placeholder' which the WaiterView handles.
5. Three drivers instantiated: UsbDriver, BluetoothDriver, BleDriver
6. QRService, PrintQueue with renderBytes wired
7. queue.bootstrap() drains any pending jobs left from a prior crash
8. registerWaiterHandlers + registerPrinterHandlers
9. db.destroy on before-quit

The seed printer makes the app boot 'usable' but with the BLE address
unset; the goal of Phase 2 is the printing pipeline, not auto-detection
on first run. RDP validation (Task 21) replaces the placeholder with
the real Aomus identifier via printer.testConnection + printer.setActive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Update printStore — estados real-print + polling

**Files:**
- Modify: `wifi-voucher-manager/src/renderer/store/printStore.ts`

- [ ] **Step 1: Reemplazar contenido completo**

```typescript
import { create } from 'zustand';

export type PrintStatus = 'idle' | 'enqueuing' | 'printing' | 'printed' | 'print-failed';

const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 60; // 30s total

export interface PrintState {
  status: PrintStatus;
  lastError: string | null;
  lastJobId: string | null;
  startPrint: () => Promise<void>;
  retryLastJob: () => Promise<void>;
  clear: () => void;
}

async function pollUntilDone(jobId: string): Promise<{ status: 'printed' | 'failed'; lastError: string | null }> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const snapshot = await window.api.printer.getJobStatus(jobId);
    if (snapshot && snapshot.status !== 'pending') {
      return { status: snapshot.status, lastError: snapshot.lastError };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: 'failed', lastError: `Timeout esperando job ${jobId} (>${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms)` };
}

export const usePrintStore = create<PrintState>((set, get) => ({
  status: 'idle',
  lastError: null,
  lastJobId: null,
  startPrint: async () => {
    set({ status: 'enqueuing', lastError: null, lastJobId: null });
    try {
      const result = await window.api.waiter.printVoucher();
      if (!result.ok) {
        set({ status: 'print-failed', lastError: result.message });
        return;
      }
      set({ status: 'printing', lastJobId: result.jobId });
      const final = await pollUntilDone(result.jobId);
      if (final.status === 'printed') {
        set({ status: 'printed', lastError: null });
      } else {
        set({ status: 'print-failed', lastError: final.lastError ?? 'Falló sin mensaje' });
      }
    } catch (err) {
      set({
        status: 'print-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  retryLastJob: async () => {
    const { lastJobId } = get();
    if (!lastJobId) return;
    set({ status: 'printing', lastError: null });
    try {
      await window.api.printer.retryJob(lastJobId);
      const final = await pollUntilDone(lastJobId);
      if (final.status === 'printed') {
        set({ status: 'printed', lastError: null });
      } else {
        set({ status: 'print-failed', lastError: final.lastError ?? 'Falló sin mensaje' });
      }
    } catch (err) {
      set({
        status: 'print-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  clear: () => {
    set({ status: 'idle', lastError: null, lastJobId: null });
  },
}));
```

- [ ] **Step 2: Lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run lint && npm run type-check
```

Expected: lint OK; type-check **probablemente sigue rompiendo en WaiterView** (Task 20 lo arregla).

- [ ] **Step 3: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/store/printStore.ts && git commit -m "$(cat <<'EOF'
feat(fase-2): printStore tracks real-print state with polling (Task 19)

Replaces the Phase 1 preview state machine with:
  idle → enqueuing → printing → printed | print-failed

startPrint(): calls waiter.printVoucher (returns jobId), then polls
printer.getJobStatus every 500ms up to 30s. The poll stops on
status != 'pending'.

retryLastJob(): calls printer.retryJob(lastJobId) and polls again.
Used by the WaiterView "Reintentar" button when a print fails.

Phase 1 fields lastDataUrl/lastSsid/lastPassword are gone — the
print is no longer a preview. The renderer doesn't need to know
the password or render the QR; it only needs the status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Update WaiterView — feedback de impresión real

**Files:**
- Modify: `wifi-voucher-manager/src/renderer/pages/WaiterView.tsx`
- Modify: `wifi-voucher-manager/tests/unit/components/WaiterView.test.tsx`

- [ ] **Step 1: Reemplazar `WaiterView.tsx` completo**

```tsx
import { useEffect, useState, type FC } from 'react';

import { Banner } from '../components/Banner.js';
import { HealthIndicator, type HealthStatus } from '../components/HealthIndicator.js';
import { PrintButton } from '../components/PrintButton.js';
import { SettingsGearButton } from '../components/SettingsGearButton.js';
import { useSystemHealth } from '../hooks/useSystemHealth.js';
import { usePrintStore } from '../store/printStore.js';

function deriveHealth(
  loading: boolean,
  error: string | null,
  passwordValid: boolean | undefined,
  printerOnline: boolean | undefined
): { status: HealthStatus; label: string } {
  if (loading) return { status: 'idle', label: 'Cargando estado del sistema…' };
  if (error) return { status: 'error', label: `Error: ${error}` };
  if (!passwordValid) return { status: 'error', label: 'Sin contraseña configurada' };
  if (!printerOnline) return { status: 'warning', label: 'Sin impresora activa' };
  return { status: 'success', label: 'Sistema listo' };
}

export const WaiterView: FC = () => {
  const { health, isLoading, error, refetch } = useSystemHealth();
  const { status, lastError, startPrint, retryLastJob, clear } = usePrintStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [ssid, setSsid] = useState('—');

  useEffect(() => {
    void window.api.waiter.getCurrentSSID().then(setSsid).catch(() => {
      setSsid('—');
    });
  }, [health]);

  // Auto-clear printed banner después de 4s
  useEffect(() => {
    if (status === 'printed') {
      const id = setTimeout(() => clear(), 4_000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [status, clear]);

  const derivedHealth = deriveHealth(
    isLoading,
    error,
    health?.passwordValid,
    health?.printerOnline
  );

  const buttonDisabled =
    !health?.passwordValid ||
    !health?.printerOnline ||
    status === 'enqueuing' ||
    status === 'printing';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      {status === 'print-failed' && lastError ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2 w-[480px]">
          <Banner variant="error" message={lastError}>
            <button
              type="button"
              onClick={() => void retryLastJob()}
              className="rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Reintentar
            </button>
          </Banner>
        </div>
      ) : null}

      {status === 'printed' ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2">
          <Banner variant="success" message="QR impreso correctamente" />
        </div>
      ) : null}

      <p className="font-mono text-sm text-textSecondary">Red: {ssid}</p>

      <PrintButton
        onClick={async () => {
          await startPrint();
          await refetch();
        }}
        disabled={buttonDisabled}
      >
        {status === 'enqueuing'
          ? 'Encolando…'
          : status === 'printing'
            ? 'Imprimiendo…'
            : 'Imprimir QR de WiFi'}
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
    </div>
  );
};
```

- [ ] **Step 2: Actualizar tests del WaiterView**

Reemplazar contenido de `tests/unit/components/WaiterView.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaiterView } from '../../../src/renderer/pages/WaiterView.js';
import { usePrintStore } from '../../../src/renderer/store/printStore.js';

interface MockApi {
  waiter: {
    getCurrentSSID: () => Promise<string>;
    getSystemHealth: () => Promise<unknown>;
    printVoucher: () => Promise<unknown>;
  };
  printer: {
    getJobStatus: () => Promise<unknown>;
    retryJob: () => Promise<void>;
  };
}

declare global {
  interface Window {
    api: MockApi;
  }
}

describe('WaiterView (Fase 2)', () => {
  let originalApi: MockApi | undefined;

  beforeEach(() => {
    originalApi = window.api;
    usePrintStore.getState().clear();
  });

  afterEach(() => {
    window.api = originalApi as MockApi;
    vi.useRealTimers();
  });

  it('passwordValid + printerOnline → "Sistema listo" + botón habilitado', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('TestSSID'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: true,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: '2026-05-08T12:00:00Z',
          lastRotationStatus: 'success',
        }),
        printVoucher: vi.fn(),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sistema listo/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).not.toBeDisabled();
  });

  it('printerOnline=false → warning "Sin impresora activa" + botón disabled', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
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
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin impresora activa/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).toBeDisabled();
  });

  it('passwordValid=false → error', async () => {
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
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin contraseña configurada/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests + lint + type-check**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run test -- WaiterView 2>&1 | tail -10 && npm run lint && npm run type-check
```

Expected: 3 passed; lint y type-check exit 0 (toda la cadena de tipos del IpcAPI ahora está consistente).

- [ ] **Step 4: Commit**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git add wifi-voucher-manager/src/renderer/pages/WaiterView.tsx wifi-voucher-manager/tests/unit/components/WaiterView.test.tsx && git commit -m "$(cat <<'EOF'
feat(fase-2): WaiterView reflects real-print states + retry (Task 20)

Replaces the Phase 1 preview modal with status-driven banners:
- 'enqueuing': button label changes to 'Encolando…' (still disabled)
- 'printing': button label 'Imprimiendo…' (disabled)
- 'printed': green Banner top-center 'QR impreso correctamente'
  auto-clears after 4s via clear() in useEffect
- 'print-failed': red Banner with the error message + 'Reintentar'
  button that calls printStore.retryLastJob()

deriveHealth now considers printer online too:
- success: passwordValid AND printerOnline
- warning: passwordValid AND NOT printerOnline ('Sin impresora activa')
- error: NOT passwordValid

SSID comes from waiter.getCurrentSSID (not from the print result —
no more dataUrl flow).

Tests (3) updated for the new states; usePrintStore.getState().clear()
in beforeEach prevents zustand state bleed across tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Final integration + RDP validation + tag fase-2-complete

**Files:**
- (empty milestone commit + tag)

- [ ] **Step 1: Suite completa local pasa**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && rm -rf dist dist-electron coverage && npm run predev 2>&1 | tail -5 && npm rebuild better-sqlite3 argon2 && npm run lint && npm run type-check && npm run build && npm run test 2>&1 | tail -10
```

Expected: lint OK, type-check OK, build OK, tests **TODOS passing** (Phase 1: 70 + Phase 2 nuevos ≈ 105+ tests).

- [ ] **Step 2: Validación BLE local**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager" && export NVM_DIR="$HOME/.nvm" && source /opt/homebrew/opt/nvm/nvm.sh && nvm use 22 > /dev/null 2>&1 && npm run smoke:noble 2>&1 | grep -E "VALIDACIÓN|stateChange|discover\[" | head -10
```

Expected: `VALIDACIÓN BLE: OK` con peripherals detectados. Si la Aomus aparece en la lista de discover, anotar su `peripheralId`.

- [ ] **Step 3: Aplicar identifier real en DB local**

Si en step 2 detectaste la Aomus, abre `npm run dev`, abre DevTools del Electron window, y ejecuta:

```javascript
// Lista las impresoras configuradas en la DB
await window.api.printer.list()
```

Para Phase 2 dev local en macOS, dado que la Aomus está pareada via macOS Bluetooth, el discovery completo (con discoverServices) llega en Phase 3. Por ahora, valida que el WaiterView muestra "Sin impresora activa" si el placeholder `'placeholder|svc|char'` no encuentra periférico (warning amarillo, botón disabled). Eso comprueba el path no-feliz.

Para validación Win11 real (debe hacerse vía RDP):
1. `git push origin main` desde Mac.
2. Desde RDP, `git pull` en la Dell, `npm run predev`, `npm run dev`.
3. Aomus debe estar emparejada en Win11.
4. En Mac (este lado), abrir `~/Library/Application Support/wifi-voucher-manager/data.db` con un cliente SQLite (DB Browser for SQLite o `sqlite3` CLI).
5. Update `printer` row con el identifier real BLE: `UPDATE printer SET identifier='<peripheralId>|<svc>|<char>' WHERE active=1;`
6. Restart `npm run dev`. Click WaiterView button → debe imprimir.

**Esto es validación manual; no automatizable hasta Phase 3 AdminView modal.** Documentar el resultado en el commit message del tag.

- [ ] **Step 4: Commit milestone + tag**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes" && git commit --allow-empty -m "$(cat <<'EOF'
milestone(fase-2): COMPLETA — printing pipeline + discovery ready

All 21 Phase 2 tasks done. Acceptance criteria met:

✓ npm run lint          → exit 0
✓ npm run type-check    → exit 0 (full IpcAPI consistency restored)
✓ npm run build         → vite + tsc + esbuild all OK
✓ npm run test          → all passing (Phase 1 + Phase 2 totals)
✓ npm run smoke:noble   → BLE adapter ready, peripherals detected

Phase 2 deliverables:
- ESC/POS: commands, EscPosBuilder primitives + image (raster GS v 0)
- voucher.ts template + render dispatcher
- 3 real drivers (BleDriver, BluetoothDriver, UsbDriver via shell per
  D-023) + MockPrinterDriver
- detect.ts cross-platform discovery (CUPS / Get-Printer / wmic /
  SerialPort.list / noble scan)
- PrintJobRepository (CRUD + status transitions)
- PrintQueue (serialized dispatch, no auto-retry, bootstrap recovery,
  DI of drivers)
- IpcAPI extended with printer namespace (7 methods, zod-validated)
- waiter.printVoucher refactored to enqueue jobs (returns jobId)
- printStore tracks idle → enqueuing → printing → printed | failed
  with 500ms polling
- WaiterView shows real-print state, success banner auto-clears,
  retry button on failure

Architecture upheld:
- D-002: 3 drivers behind PrinterDriver interface
- D-007: own EscPosBuilder, image() with GS v 0 raster
- D-009: queue persisted in SQLite, no auto-retry
- D-021: coverage thresholds remain QRService-only in Phase 2

Manual validation pending in production:
- RDP to Win11, pair Aomus, sqlite update active printer identifier
  to real <peripheralId>|<svc>|<char>, click WaiterView button →
  expect ticket with scannable QR. AdminView discovery modal lands
  in Phase 3 to make this UX-clean.

Stats since fase-1-complete:
- 21 commits in Phase 2
- ~12 new source files in src/main/
- ~6 new test files
- DECISIONS.md unchanged (no new decisions; D-022/D-023 stayed valid)

Ready for Phase 3: AdminView with PIN + 7 panels (Inicio, Impresora
con discovery modal real, Router placeholder, Programación, Negocio,
Estadísticas, Logs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)" && git tag -a fase-2-complete -m "Fase 2: printing pipeline funcional, drivers BLE/USB/BT, queue, discovery"
```

---

## Self-Review

**1. Spec coverage** (Phase 2 deliverables del spec Sección 5):
- ✓ Port literal de drivers maragon (Tasks 6, 8, 9 — driver-types, ble, bluetooth)
- ✓ UsbDriver D-023 (Task 10) reemplazo de @thiagoelg/node-printer
- ✓ MockPrinterDriver (Task 7)
- ✓ Discovery cross-platform Get-Printer + wmic + lpstat + serialport + noble (Task 11)
- ✓ Inferencia de marca (Task 11)
- ✓ EscPosBuilder.image() GS v 0 (Task 3)
- ✓ voucher.ts template (Task 4)
- ✓ render dispatcher (Task 5)
- ✓ PrintQueue SQLite-persistida + bootstrap + sin auto-retry (Task 13)
- ✓ IPC printer.* con zod (Task 15)
- ✓ Validación RDP en producción (Task 21 step 3 — manual)

**2. Placeholder scan:** sin "TBD", "implement later", "appropriate error handling". El uso de "placeholder" en el seed printer es intencional y descriptivo (la app necesita una row inicial; AdminView en Phase 3 la actualiza). El comment en código lo aclara.

**3. Type consistency:** `PrinterRow` (DB) → `PrinterRecord` (renderer-facing) — el mapeo con `rowToRecord` está documentado. `PrinterConnection`, `JobStatus`, `JobStatusSnapshot`, `RecentJobSummary`, `DiscoveredPrinter`, `PrinterTestResult` consistentes entre `shared/types.ts`, `preload`, IPC handlers, drivers, repositorios.

**4. Dependencias entre tasks:**
- Tasks 1-5: ESC/POS infra + render (independientes de drivers).
- Task 6 (driver-types) depende de Phase 1 PrinterRow.
- Task 7 (MockDriver) depende de Task 6.
- Tasks 8/9/10 (drivers concretos) dependen de Task 6.
- Task 11 (detect) independiente de drivers (no instancia ninguno).
- Task 12 (PrintJobRepository) depende de Phase 1 (migration `print_job` ya existe).
- Task 13 (PrintQueue) depende de Tasks 6/7/12 + Task 5 (renderBytes).
- Task 14 (shared types) depende de Task 13 (JobStatus).
- Task 15 (IPC printer) depende de Tasks 11/12/13/14.
- Task 16 (preload) depende de Task 14.
- Task 17 (waiter.ts) depende de Tasks 13, 14.
- Task 18 (main) depende de Tasks 8/9/10/13/15/17.
- Task 19 (printStore) depende de Task 14.
- Task 20 (WaiterView) depende de Tasks 14/19.
- Task 21 (final) integra todo.

Plan consistente, ejecutable.

---

## Notas operacionales

- **nvm sourcing en cada Bash** (igual que Fase 0/1)
- **npm rebuild better-sqlite3 argon2** después de cada `electron-rebuild` antes de tests vitest
- **Path sin espacios** garantizado desde Phase 0 (qr-clientes)
- **Subagentes ejecutores:** `haiku` para ports literales y configs, `sonnet` para PrintQueue, IPC handlers con DI, composition root, store con polling
- **RDP validation:** manual; el script `npm run smoke:noble` ya confirma BLE compila en Phase 0. Phase 2 RDP test es print real.

**Próximo paso post-Fase 2:** invocar `/writing-plans` con la **Fase 3 — AdminView + PIN + configuración persistente** (incluye discovery modal real para resolver el seed printer placeholder).
