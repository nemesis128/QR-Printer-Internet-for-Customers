# DECISIONS.md

Bitácora de decisiones técnicas. Append-only — modificar entradas requiere agregar nueva entrada con referencia.

## Convención

| Estado | Significado |
|---|---|
| ✅ Activa | Decisión vigente |
| ⚠️ Excepción | Excepción a una decisión activa |
| ❌ Revocada | Reemplazada por una decisión posterior |

---

## D-001 ✅ Activa — Hash PIN admin con argon2id (no bcrypt)

**Plan v1.1 decía:** bcrypt ^5.1.1.

**Decisión:** argon2 ^0.44 con argon2id, timeCost=3, memoryCost=2^16 (64 MB), parallelism=1.

**Justificación:** maragon_pdv ya usa argon2id en producción interna (`nip-crypto.ts`). Argon2id es ganador del PHC y resistente a GPU/ASIC; bcrypt sigue OK pero argon2 es estándar de facto post-2020.

---

## D-002 ✅ Activa — Tres drivers de impresora (USB / Bluetooth / BLE)

**Plan v1.1 decía:** un solo `ThermalPrinterAdapter` con `node-thermal-printer`.

**Decisión:** tres drivers concretos (`UsbDriver`, `BluetoothDriver`, `BleDriver`) detrás de interfaz `PrinterDriver`, despachados por `printer.connection: 'usb' | 'bluetooth' | 'bluetooth-ble'`.

**Justificación:** `node-thermal-printer` no soporta BLE ni Bluetooth Classic-SPP. Hardware HOY es Aomus My A1 (BLE). maragon_pdv ya tiene los tres drivers funcionando contra hardware real.

---

## D-003 ✅ Activa — Paquete `usb` opcional, no obligatorio

**Plan v1.1 decía:** `usb@^2.14.0` obligatoria para enumeración USB.

**Decisión:** discovery vía CUPS/wmic + serialport + noble. `usb` queda opcional para casos avanzados.

**Justificación:** En macOS, libusb directo no funciona sin root (kernel claim de IOUSBMassStorageClass). En Windows, el spooler (`Get-Printer`/`wmic printer`) es la ruta confiable.

---

## D-004 ✅ Activa — Discovery cross-platform

**Plan v1.1 decía:** solo Windows con `wmic` + USB enumeration.

**Decisión:** `lpstat -p` + `lpinfo -v` (mac/linux), `Get-Printer` PowerShell primario + `wmic` fallback (Windows), `SerialPort.list()` (Bluetooth-SPP), `noble` scan (BLE).

**Justificación:** Permite dev en Mac y validación en Win11 vía RDP. Patrón ya implementado en maragon_pdv `detect.ts`. `wmic` deprecado en Win11 22H2+, `Get-Printer` es el reemplazo soportado.

---

## D-005 ✅ Activa — Knex sobre better-sqlite3

**Plan v1.1 decía:** SQL crudo en repositorios.

**Decisión:** Knex 3.1 (query builder) + better-sqlite3, migraciones `.ts` versionadas con `db.migrate.latest()`.

**Justificación:** maragon usa este stack y le da migraciones idempotentes, type-safe queries y FK enforcement out of the box (afterCreate con `pragma foreign_keys = ON; journal_mode = WAL`).

---

## D-006 ✅ Activa — Repo independiente

**Plan v1.1 decía:** estructura standalone implícita.

**Decisión:** repo independiente. La app vive en `wifi-voucher-manager/` dentro del repo `QR-Printer-Internet-for-Customers`, sin pnpm workspace, sin `@maragon/shared`.

**Justificación:** Producto distinto, ciclo de release independiente. El código a reusar se copia/vendoriza, no se enlaza.

---

## D-007 ✅ Activa — EscPos builder propio

**Plan v1.1 decía:** rendering vía `node-thermal-printer.printQR()` implícito.

**Decisión:** Builder propio (`EscPosBuilder` portado de `packages/shared/src/escpos/` de maragon) que produce `Uint8Array`. QR como imagen raster con `GS v 0` (extender builder con `image()`).

**Justificación:** maragon tiene un builder limpio y testeado. Da control total y permite el mismo template en los tres drivers (USB, BT, BLE).

---

## D-008 ✅ Activa — Identifier canónico de impresora

**Decisión:** USB → `printer:<NAME>`. BT-SPP → ruta puerto serial (`COM4`, `/dev/cu.AOMU-MY-A1`). BLE → `<peripheralId>|<serviceUuid>|<charUuid>`.

**Justificación:** Patrón pipe-delimitado de maragon `ble-driver.ts` cubre el caso BLE de forma autodescriptiva. Persiste a través de reboots si el peripheralId es estable (en Windows lo es).

---

## D-009 ✅ Activa — Cola de impresión SQLite-persistida sin auto-retry

**Plan v1.1 decía:** "cola con prioridad baja" (vago).

**Decisión:** `PrintQueue` persistida en SQLite con estados `pending|printed|failed`, procesamiento serializado, sin auto-retry (admin re-encola desde Logs).

**Justificación:** Con CUPS, un fallo del driver puede ocurrir DESPUÉS de que el papel salió. Auto-retry imprimiría duplicado.

---

## D-010 ✅ Activa — Empaquetado nativo con asarUnpack

**Decisión:** electron-builder con `asarUnpack` explícito para `better-sqlite3`, `@abandonware/noble`, `serialport`, `argon2` (4 nativos post-D-023). Scripts `predev` y `predist` con `electron-rebuild -f -w <list>`.

**Justificación:** Sin esto, los módulos nativos no cargan desde el `.exe` empaquetado. Patrón en producción en `apps/pos/package.json` de maragon.

---

## D-011 ✅ Activa — Electron 39

**Decisión:** mantener Electron 39.x (plan v1.1).

**Validación (Fase 0 Task 15):** la BLOCKING gate de noble vs Electron 39 ABI 127 PASÓ. `scripts/smoke-noble.ts` corrió OK, detectó 6 BLE peripherals, no hubo necesidad de plan B (Electron 30). D-011 firme.

---

## D-012 ✅ Activa — npm scripts (no pnpm)

**Decisión:** `npm` para todos los scripts. Sin pnpm workspace fuera del monorepo.

**Justificación:** Plan v1.1 ya define scripts `npm run *`. Sin necesidad de pnpm fuera de monorepo.

---

## D-013 ✅ Activa — PIN inicial '0000' con cambio forzado

**Decisión:** PIN inicial hardcodeado `0000`. Primer login a AdminView fuerza wizard de cambio antes de mostrar contenido.

**Justificación:** Más simple que onboarding wizard al primer arranque. Default obvio para que el dueño nunca quede bloqueado por olvido. Wizard rechaza `0000` como nuevo PIN.

---

## D-014 ✅ Activa — Sin code signing en v1

**Decisión:** No firmar el `.exe` en v1. Manual de instalación incluye Apéndice C con 3 procedimientos de whitelist Win Defender (Unblock / SmartScreen "Run anyway" / Excluir carpeta).

**Justificación:** Cert EV (~$300/año) no se justifica para piloto v1. Si v2 vende a más clientes, re-evaluar.

---

## D-015 ✅ Activa — Smoke test diario en piloto

**Decisión:** Self-check interno diario a las 03:00 (post-rotación 23:00) con 6 probes (db_integrity, disk_free, log_size, last_rotation_recent, printer_reach, router_reach). Solo registra en `audit_log`. Sin webhooks externos en v1.

**Justificación:** Auto-fix tiene riesgos (duplicados de impresión, falsos positivos). Operador humano lee vía RDP y decide.

---

## D-016 ✅ Activa — Testing visual sin Storybook

**Decisión:** Testing Library snapshots (CI) + Playwright visual regression contra `.exe` empaquetado (local pre-release Win11). Tolerancia 1% (`maxDiffPixelRatio: 0.01`).

**Justificación:** Storybook agrega ~80MB de devDeps y duplica el árbol de imports. Para 2 páginas y ~12 componentes, ROI negativo.

---

## D-017 ✅ Activa — AppConfig partition

**Decisión:** electron-store para settings simples (router host/user, schedule, business, pinHash). SQLite para datos relacionales (passwords, print_log, audit_log, printer, print_job). `safeStorage` solo para `router.password`.

**Justificación:** Velocidad de lectura en `getConfig()` IPC + atomicidad por sección + backup-friendly.

---

## D-018 ✅ Activa — Validación de PIN nuevo (7 reglas)

**Decisión:** longitud exacta 4, solo dígitos, no `0000`, no repetidos (1111), no asc (1234), no desc (4321), confirmación coincide.

**Justificación:** Alineado con NIST 800-63B. Quedan ~9990 PINs válidos, espacio suficiente.

---

## D-019 ✅ Activa — Discovery modal: lista única con badges

**Decisión:** Lista única vertical con badges de tipo de conexión a la izquierda. Sin tabs.

**Justificación:** UX 5.6 prohíbe >3 niveles de jerarquía visual y >1 acento simultáneo. Tabs vacíos son peores que lista corta. Inspiración: Linear, Stripe.

---

## D-020 ✅ Activa — CSP doble (dev relajada / prod estricta)

**Decisión:** `index.html` lleva `__CSP__` placeholder. Plugin Vite `csp-swap` reemplaza por DEV_CSP en mode='development' o PROD_CSP en producción. Defensa-en-profundidad: header HTTP en main process via `session.defaultSession.webRequest.onHeadersReceived`.

**PROD_CSP:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`

**DEV_CSP:** permite `unsafe-eval` + `localhost:5173` + `ws://localhost:5173` para Vite HMR.

---

## D-021 ✅ Activa — Coverage thresholds escalonados por carpeta y fase

**Decisión:** Vitest con thresholds que rompen build, escalonados:

| Carpeta | Fase 0-1 | Fase 2-3 | Fase 4-5 | Fase 6+ |
|---|---|---|---|---|
| services/ | desactivado | 70% | 80% | 80% |
| services/QRService.ts | 85% | 85% | 85% | 85% |
| adapters/ | desactivado | 70% | 80% | 80% |
| db/repositories/ | desactivado | 60% | 70% | 70% |
| renderer/components/ | desactivado | 50% | 60% | 60% |
| renderer/hooks/ | desactivado | 60% | 70% | 70% |

`src/main/ipc/` y `src/main/index.ts` excluidos. Tests E2E no aportan a coverage.

---

## D-022 ✅ Activa — Upgrade better-sqlite3 11.5 → 12.x (Fase 0 Task 14)

**Plan v1.1 / spec D-005 dijo:** `better-sqlite3 ^11.5.0`.

**Decisión:** `better-sqlite3 ^12.2.0` (resolved ^12.9.0).

**Justificación:** better-sqlite3 11.5 usa `v8::Context::GetIsolate()` que fue removido en v8 13. Electron 39 ships v8 13, por lo que 11.5 falla a compilar contra su ABI:

```
./src/better_sqlite3.lzz:68:34: error: no member named 'GetIsolate' in 'v8::Context'
```

12.x soporta v8 13 y es API-compatible con 11.x para nuestros uses (knex 3.1 query builder; no usamos métodos removidos).

**Validación:** `electron-rebuild -f -w better-sqlite3` succeeds. Smoke tests + db-connection.test.ts pasan en Node 22 ABI.

---

## D-023 ✅ Activa — Drop @thiagoelg/node-printer (Fase 0 Task 7)

**Plan v1.1 / spec dijo:** `@thiagoelg/node-printer ^0.6.2` para spooler USB / CUPS integration.

**Decisión:** eliminar la dependencia.

**Justificación:** `@thiagoelg/node-printer` (latest 0.6.2 — no hay upgrade) depende de `nan` (Native Abstractions for Node) que usa APIs internos de v8 12.x removidos en v8 13. Errors específicos al compilar contra Electron 39:

```
v8-internal.h:504:72: error: expected '(' for function-style cast or type construction
  static_assert(std::is_same_v<std::underlying_type_t<Tag>, uint16_t>);
```

`nan` lleva años deprecated; los nuevos ABI v8 lo rompen completamente.

**Reemplazo:** el `UsbDriver` (Fase 2 Task 14+) usará `lp`/`lpr` (mac/linux) y PowerShell `Out-Printer` (Win) vía `child_process` para enviar bytes ESC/POS al spooler. No requiere nativos. Cubre el mismo caso de uso (impresión vía sistema operativo, no driver propio).

**Impacto:** electron-rebuild watch list reducida a 4 nativos (better-sqlite3, @abandonware/noble, serialport, argon2). asarUnpack en electron-builder.yml también reducido. UsbDriver implementation pattern cambia de "envía bytes via node-printer" a "spawn `lp`/`lpr`/`Out-Printer` con bytes vía stdin".

---

## Excepciones registradas

(Ninguna al cierre de Fase 0.)
