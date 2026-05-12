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

## D-024 ✅ Activa — Schema `print_log` se conserva tal cual desde Fase 1 (Fase 3 Task 8)

**Plan Fase 3 dijo:** test inserts con `{ password_id: null, success, error, created_at }`.

**Decisión:** el plan tenía nombres incorrectos. La migración real (`20260508_120200_print_log.ts`) define `password_id NOT NULL FK`, `printed_at`, `error_message`, `job_id`. Mantener ese schema (D-005 manda migraciones append-only) y adaptar `StatsService` + tests a las columnas reales.

**Justificación:** Cambiar la migración rompería el invariante append-only de D-005 y la prueba FK en `tests/integration/migrations.test.ts`. Adaptar el servicio es trivial y no afecta el contrato externo.

**Impacto:** `StatsService.getDailyPrints` consulta `printed_at` y agrega `WHERE printed_at >= cutoff` para usar el índice `idx_print_log_date`. Tests siembran un row en `passwords` antes de insertar en `print_log`.

---

## D-025 ✅ Activa — Mock de `window.api` en tests de componentes (Fase 3)

**Decisión:** asignar `(window as any).api = { ... }` en `beforeEach` en lugar de reemplazar `globalThis.window = { ... }`.

**Justificación:** Reemplazar `globalThis.window` con un objeto literal destruye las APIs DOM de happy-dom (`document`, `Node`, `Element`), provocando errores `instanceof` en React y rompiendo `@testing-library/react`. Asignar sólo la propiedad `.api` preserva el entorno DOM completo.

**Aplicación:** todos los tests de componentes con dependencias IPC (`adminStore.test.ts`, `AdminView.test.tsx`, `DiscoveryModal.test.tsx`). El cast `as any` se silencia con `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.

---

## D-026 ✅ Activa — `rotatePasswordNow` stub en Fase 3 (handler real en Fase 5)

**Decisión:** el handler `admin.rotatePasswordNow` en Fase 3 sólo registra una entrada `password_rotation` con `{success: false, reason: 'scheduler-not-yet-implemented', triggered_by: 'admin'}` en `audit_log` y retorna `{ok: false, message: 'Rotación automática pendiente de Fase 5'}`.

**Justificación:** Permite que HomePanel y la pantalla de admin funcionen end-to-end sin esperar al `SchedulerService` (Fase 5) y al `RouterService` (Fase 4). El usuario ve feedback claro y el audit_log conserva los intentos para depuración futura.

**Impacto:** La métrica `successfulRotations` en `StatsService` filtra `json_extract(payload, '$.success') = 1`, por lo que estos stubs no inflan el conteo. La rotación real reemplaza el cuerpo del handler en Fase 5 sin tocar el shim IPC.

**Resuelta en Fase 4 Task 22:** el handler ahora genera una nueva password con `PasswordService.generate()`, la inserta en `passwords` (active=0), llama a `RouterService.applyPasswordNow`, y al éxito marca active=1 + applied_method=auto. Al fallo marca active=1 + applied=0 + applied_method='manual_pending' para que el banner aparezca. El loop de backoff vive en Fase 5.

---

## D-027 ✅ Activa — Fixtures HTTP sintéticos en Fase 4 (sin hardware)

**Decisión:** los 5 fixtures en `tests/fixtures/tplink/` son sintéticos, basados en docs públicas de TP-Link Archer C24 v1.2, no en tráfico real grabado.

**Why:** sin acceso al router físico no podemos correr `nock.recorder`. Mantener el shape esperado permite cubrir la lógica del adapter; cuando el cliente compre el hardware se reemplazan con grabaciones reales en una task follow-up de Fase 4.

**Impacto:** los tests pasan con los fixtures sintéticos pero NO validan que la firma HTTP real del Archer C24 v1.2 coincida. La impresión `f4-fixtures-need-real-grab` queda como deuda explícita hasta la compra.

---

## D-028 ✅ Activa — Variant detection limitada a Archer C24 v1.2 en Fase 4

**Decisión:** el `TPLinkArcherAdapter` sólo reconoce la variant `archer-c24-v1.2`. Cualquier otra cae a `UnsupportedVariantError`.

**Why:** el cliente sólo va a comprar el C24/A6 v3 (C24 v1.2 firmware). Soportar otros modelos es over-engineering para v1.

**Impacto:** si el router que llega no matchea el regex `/TP-LINK\s+Archer\s+C24\s+V1\.2/i`, la app rechaza el login y muestra el error. Operador puede ajustar el regex en la task de grabación de fixtures reales.

---

## D-029 ✅ Activa — RouterService.applyPasswordNow es single-attempt (Fase 5 hace el loop)

**Decisión:** `RouterService.applyPasswordNow` hace **un** intento. Si falla, marca la password como `applied=0 + applied_method='manual_pending'` y retorna failure.

**Why:** el backoff exponencial 1m/5m/15m × 3 vive en el `SchedulerService` de Fase 5. Mantener `RouterService` simple permite que el scheduler controle la política de retry y que `admin.rotatePasswordNow` (botón manual) tenga el mismo comportamiento.

**Impacto:** si Fase 5 se demora, el operador debe ir al banner manual cada vez que falla la rotación.

---

## D-030 ✅ Activa — Tests con nock requieren `// @vitest-environment node` (Fase 4 Task 7)

**Decisión:** los archivos de test que usan `nock` para interceptar tráfico HTTP de axios deben declarar `// @vitest-environment node` en la primera línea.

**Why:** la config global de vitest usa `happy-dom`. En ese entorno, axios usa el adapter XHR del navegador, que bypassa el módulo `node:http` que `nock` instrumentaliza. Sin la directiva, nock no intercepta y los tests caen al network real (que `nock.disableNetConnect()` bloquea).

**How to apply:** primer renglón del archivo de test, antes de los imports:
```ts
// @vitest-environment node
import nock from 'nock';
```

**Impacto:** los tests de adapters HTTP (TPLinkArcherAdapter, futuros) se aíslan del entorno DOM. Tests de componentes React siguen en happy-dom (default).

---

## D-031 ✅ Activa — Composition root selecciona MockRouterAdapter cuando no hay host configurado (Fase 4 Task 21)

**Decisión:** `src/main/index.ts` instancia `MockRouterAdapter` cuando:
1. `process.env.WIFI_VOUCHER_USE_MOCK_ROUTER === '1'`, o
2. `config.getAll().router.host === ''` (instalación nueva sin TP-Link configurado)

En caso contrario instancia `TPLinkArcherAdapter`.

**Why:** permite arrancar la app inmediatamente después de la instalación sin hardware. El admin configura el host desde RouterPanel, reinicia, y el TPLink adapter toma el relevo. Para tests y CI, basta con `WIFI_VOUCHER_USE_MOCK_ROUTER=1`.

**Impacto:** una rotación con MockRouter siempre será exitosa (mode='success' default) — el operador puede confundir que "ya está aplicando al router" cuando en realidad es el mock. El banner del HomePanel deja claro el estado cuando hay pending.

---

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

---

## D-035 ✅ Activa — RouterService.applyPasswordNow acepta `triggeredBy` opcional (Fase 5 Task 1)

**Decisión:** `RouterService.applyPasswordNow(credentials, passwordId, newPassword, triggeredBy = 'router-service')` ahora acepta un 4º parámetro opcional que se propaga al audit_log como `payload.triggered_by`. Los callers conocen quién disparó la rotación: scheduler / admin / startup-recovery / router-service.

**Why:** sin este parámetro, todos los eventos `password_rotation` quedaban etiquetados `triggered_by='router-service'`, ocultando la causa real. El reporting de stats y el debug post-piloto necesitan distinguir entre tipos de trigger.

**Impacto:** firma extendida es backward-compatible (default preserva el comportamiento anterior). Existing Fase 4 RouterService tests pasan sin cambios; Fase 5 RotationOrchestrator usa el nuevo arg para auditar `scheduler` o `admin` correctamente.

---

## D-036 ✅ Activa — Auto-arranque condicionado a pinIsDefault=false (Fase 6 Task 1)

**Decisión:** `app.setLoginItemSettings({ openAtLogin: true })` se activa automáticamente cuando el admin completa el primer cambio de PIN (deja de ser `0000`). No requiere configuración explícita por el usuario.

**Why:** el flujo de onboarding ya fuerza el cambio de PIN antes de mostrar AdminView (D-013). Activar auto-arranque sólo después de ese cambio garantiza que (a) el dueño quiso configurar el sistema (no es un test de instalación), y (b) la primera vez que la app arranca tras reboot ya tiene un PIN custom, no el default — no estamos exponiendo el `0000` en un sistema desatendido.

**Impacto:** en Linux la API es no-op (Electron docs); en macOS/Windows el setting persiste en el sistema. El admin puede desactivarlo manualmente desde Windows → Configuración → Aplicaciones → Inicio si lo necesita. Para v1 no exponemos toggle en la UI. El callback `onPinChanged` en `AdminHandlerDeps` mantiene `admin.changePin` desacoplado de la API de Electron `app`.

---

## D-037 ✅ Activa — Logo se persiste en userData/, no en assets del bundle (Fase 6 Task 2)

**Decisión:** `admin.uploadLogo` copia el archivo seleccionado a `app.getPath('userData')/logo.<ext>` y guarda la ruta absoluta en `business.logoPath`. NO se embebe en el bundle ni en `resources/`.

**Why:** el bundle es read-only post-instalación (asar). El logo es contenido del cliente, no del producto — debe vivir en `userData/` igual que la DB y la config. Una actualización del `.exe` preserva el logo del cliente.

**Impacto:** el voucher template (Fase 1 / Fase 2) puede leer `business.logoPath` directamente del config para renderizarlo en la imagen ESC/POS. En Fase 6 NO implementamos esa lectura — queda como path persistido para que una iteración futura lo incorpore al template sin tocar el flujo de upload. Extensiones aceptadas: `.png`, `.jpg`, `.jpeg`.

---

## D-038 ⚠️ Excepción — 22 vulnerabilidades en dev-only deps aceptadas (Fase 6 Task 5)

**Decisión:** `npm audit` reporta 22 vulnerabilidades (2 low, 6 moderate, 13 high, 1 critical) en cadenas de dependencias dev-only: `tar`, `@mapbox/node-pre-gyp`, `cacache` — todas tránsito a través de `@electron/rebuild`, `app-builder-lib`, `node-gyp`. NO se aplica `npm audit fix --force` porque requiere bumpear `vitest` a 4.x, `electron-builder` a 26.x y `@vitest/coverage-v8` a 4.x — major versions con potencial breaking del test suite (49 archivos, 266 tests) y del pipeline NSIS recién estabilizado.

**Why:** las vulnerabilidades son todas en build tooling (path traversal en tar extraction). Vector requiere alimentar tar files maliciosos al entorno dev — no aplicable porque `npm install` descarga del registry oficial. Ningún componente vulnerable shipea al `.exe` final (es asar empacado).

**Impacto:** la cadena de build queda con vulns conocidas pero sin exposición operativa. Re-evaluar en v2 cuando vitest 4 y electron-builder 26 sean LTS y el upgrade sea trivial. El `.exe` distribuido al cliente NO contiene `tar`, `node-gyp`, `cacache` ni `@mapbox/node-pre-gyp`.

**Mitigación:** los runners de CI (GitHub Actions) se actualizan automáticamente; un eventual exploit en una herramienta dev se detectaría rápido. Localmente, `npm ci` usa lockfile + integrity hashes.

---

## Excepciones registradas

- **D-038** — 22 vulns de `npm audit` aceptadas en dev-only deps (path traversal de tar). Reasignar en v2.
