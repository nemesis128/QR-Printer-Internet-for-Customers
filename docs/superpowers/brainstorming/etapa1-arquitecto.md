# Etapa 1 — Arquitecto de Soluciones

Output producido por el agente Arquitecto durante el brainstorming del WiFi Voucher Manager (2026-05-07). Es la base sobre la que los 4 especialistas de Etapa 2 producen el detalle de implementación por fase.

---

## Sección A — Resumen ejecutivo de la arquitectura corregida

El plan v1.1 fue diseñado en abstracto: asume `node-thermal-printer` como única ruta de impresión, `bcrypt` para PIN, paquete `usb` directo y enumeración USB nativa. El proyecto hermano `maragon_pdv` ya implementó y validó en Windows un sistema de impresión de tres carriles (USB vía CUPS/spooler, Bluetooth Classic vía SerialPort, BLE vía `@abandonware/noble`) que cubre exactamente el hardware disponible hoy (Aomus My A1 BLE) y todo el rango previsible (EPSON USB, COM virtual de BT pareado en Windows). Reusarlo recorta semanas de Fase 2 y elimina riesgo R2.

**Cambios principales respecto al v1.1:**

1. **Adapter de impresora multi-driver**: tres drivers concretos (`UsbDriver`, `BluetoothDriver`, `BleDriver`) detrás de una interfaz `PrinterDriver`, en lugar de un único `ThermalPrinterAdapter`. Esto es lo que ya funciona en `apps/pos/electron/services/printing/` de maragon_pdv.
2. **Hash con argon2id** en lugar de bcrypt — alineado con `nip-crypto.ts` de maragon_pdv. Más moderno, sin warnings de mantenimiento, mismo costo de implementación.
3. **Discovery cross-platform** vía CUPS (`lpstat -p`, `lpinfo -v`) en mac/linux y `wmic printer` en Windows, complementado con `SerialPort.list()` para BT-SPP y `noble` scan para BLE. El paquete `usb` queda como **opcional** (no obligatorio).
4. **Repo independiente** en `/Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/`, sin pnpm workspace; las utilidades necesarias de `@maragon/shared` (escpos builder, modelos Printer) se copian/vendorizan al repo nuevo.
5. **Build pipeline** con `electron-rebuild` para módulos nativos (`better-sqlite3`, `@abandonware/noble`, `@thiagoelg/node-printer`, `serialport`, `argon2`) y `asarUnpack` para empaquetarlos correctamente — patrón ya validado en `apps/pos/package.json`.
6. **Knex + better-sqlite3 + migraciones tipadas** en lugar de SQL crudo en repositorios. Maragon usa este patrón con éxito; copiar `connection.ts` + `run-migrations.ts` ahorra tiempo y da `ON DELETE CASCADE`, FK enforcement y WAL desde el día 1.

**Lo que se mantiene del v1.1 sin cambios**: paleta UX 5.6, contrato IPC base, generación de password (`crypto.randomInt` + charset filtrado), QR `errorCorrectionLevel: 'M'`, separación main/renderer/preload con `contextIsolation`, fallback manual de TP-Link, scheduler con backoff, modelo de 4 tablas (`passwords`, `print_log`, `config`, `audit_log`), Tailwind + Zustand + Vitest + Playwright, idioma producto en español.

---

## Sección B — DECISIONS.md draft

| ID | Decisión | Contexto del plan v1.1 | Nueva decisión | Justificación |
|---|---|---|---|---|
| D-001 | Hash de PIN admin | bcrypt ^5.1.1 | argon2 ^0.44 (argon2id, timeCost=3, memoryCost=2^16) | maragon_pdv ya lo usa (`nip-crypto.ts`) en producción interna. argon2id es el ganador de PHC y resistente a GPU/ASIC; bcrypt sigue OK pero argon2 es el estándar de facto post-2020. Mismo `electron-rebuild` ya configurado. |
| D-002 | Adapter de impresora | Único `ThermalPrinterAdapter` con `node-thermal-printer` (USB/network) | Tres drivers concretos (`UsbDriver`, `BluetoothDriver`, `BleDriver`) detrás de `PrinterDriver` interface, despachados según `printer.connection: 'usb' \| 'bluetooth' \| 'bluetooth-ble'` | `node-thermal-printer` no soporta BLE ni Bluetooth Classic-SPP. La impresora disponible HOY (Aomus My A1) es BLE. maragon_pdv ya tiene los tres drivers funcionando contra hardware real. |
| D-003 | Librería USB | `usb@^2.14.0` obligatoria (npm) para enumeración directa | `@thiagoelg/node-printer` (vía `node-thermal-printer.driver`) + CUPS/wmic para discovery; `usb` queda OPCIONAL para casos avanzados | En macOS, libusb directo no funciona sin root (kernel claim de IOUSBMassStorageClass — comentado en `detect.ts`). En Windows, el spooler (`wmic printer`) es la ruta confiable. Eliminar `usb` como dependencia obligatoria reduce superficie de instalación. |
| D-004 | Discovery cross-platform | Solo Windows: `wmic` + USB enumeration | Cross-platform: `lpstat -p` + `lpinfo -v` (mac/linux), `wmic printer get name` (Windows), `SerialPort.list()` (Bluetooth-SPP), `noble` scan (BLE) | Permite dev en Mac (laptop del owner) y validación periódica en Win11 vía RDP. Patrón ya implementado y probado en maragon_pdv `detect.ts`. |
| D-005 | DB access layer | `better-sqlite3` directo + queries SQL crudas en `repositories/` | `knex@^3.1.0` (query builder) sobre `better-sqlite3` driver, migraciones `.ts` versionadas con `db.migrate.latest()` | maragon usa este stack y le da migraciones idempotentes, type-safe queries y FK enforcement out of the box (`afterCreate` con `pragma foreign_keys = ON; journal_mode = WAL`). Queries SQL crudas en SQLite a mano es propenso a errores. |
| D-006 | Estructura del repo | Implícita (parece app standalone en plan) | Repo INDEPENDIENTE en `/Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/`, sin pnpm workspace, sin `@maragon/shared` | Producto de cliente final distinto, ciclo de release independiente, no se comparten entidades de dominio (POS vs vouchers). El código a reusar se copia/vendoriza, no se enlaza. |
| D-007 | ESC/POS rendering | Implícito vía `node-thermal-printer.printQR()` | Builder propio (`EscPosBuilder` portado de `packages/shared/src/escpos/`) que produce `Uint8Array`; el QR se renderiza a PNG con `qrcode` y se imprime como imagen raster con bytes ESC/POS GS v 0 | maragon ya tiene un builder limpio y testeado. Da control total sobre alineación, codepage (CP858 para acentos) y permite el mismo template en los tres drivers (USB, BT, BLE) sin acoplarse a node-thermal-printer. |
| D-008 | Identifier de impresora | `string` ad-hoc (`'usb'`, `'tcp://...'`, `'printer:NAME'`) | Formato canónico documentado: USB → `printer:<NAME>`, BT-SPP → ruta puerto serial (`COM4`, `/dev/cu.AOMU-MY-A1`), BLE → `<peripheralId>\|<serviceUuid>\|<charUuid>` | Patrón pipe-delimitado de maragon (`ble-driver.ts`) cubre el caso BLE de forma autodescriptiva. Persiste a través de reboots si el peripheralId es estable (en Windows lo es). |
| D-009 | Cola de impresión | "Cola con prioridad baja" (vago en plan v1.1) | `PrintQueue` persistida en SQLite con estados `pending\|printed\|failed`, procesamiento serializado, sin auto-retry (el usuario re-encola desde diagnostics) | Patrón validado en `print-queue.ts` de maragon. La razón de NO auto-retry: con CUPS, un fallo del driver puede ocurrir DESPUÉS de que el papel salió — auto-retry imprimiría duplicado. |
| D-010 | Empaquetado nativo | Implícito | `electron-builder` con `asarUnpack` explícito para `better-sqlite3`, `@abandonware/noble`, `@thiagoelg/node-printer`, `serialport`, `argon2`. `predist` script con `electron-rebuild -f -w <list>` | Sin esto, los módulos nativos no cargan desde el `.exe` empaquetado. Patrón ya en producción en `apps/pos/package.json`. |
| D-011 | Versión de Electron | Plan v1.1 dice 39.x | **Mantener 39.x** (NO bajar a 30 que usa maragon). Validar antes que `@abandonware/noble` y `@thiagoelg/node-printer` compilan contra ABI de Node 22.20 (Electron 39 trae Node 22) | maragon está en Electron 30 + Node 20. WiFi Voucher es greenfield → quedarse con 39 según plan v1.1 a menos que `electron-rebuild` falle, en cuyo caso se documenta excepción. |
| D-012 | Idioma de comandos en package.json | npm | `npm` (mantener plan v1.1 — NO heredar `pnpm` de maragon). Repo independiente sin workspace. | Plan v1.1 ya define scripts `npm run *`. CLAUDE.md base lo asume. Sin necesidad de pnpm fuera del monorepo. |

### Decisiones adicionales tomadas con el usuario en chat

| ID | Decisión |
|---|---|
| D-013 | PIN inicial: default `0000` hardcoded; AdminView fuerza cambio antes de mostrar contenido en primer login. |
| D-014 | Code signing: NO en v1; manual de instalación incluye instrucciones para que el cliente haga right-click → Properties → Unblock en el `.exe`. |
| D-015 | Smoke test diario en piloto (Fase 7): self-check interno (impresora ping, router reach, DB integrity) registrado en `audit_log`; lectura vía RDP por Okuni Solutions. Sin webhooks externos en v1. |

---

## Sección C — Lista exacta de módulos a portar de maragon_pdv

Ruta destino base: `/Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/`.

| # | Origen (maragon_pdv) | Destino (wifi-voucher-manager) | Estrategia | Notas de adaptación |
|---|---|---|---|---|
| 1 | `apps/pos/electron/services/printing/driver-types.ts` | `src/main/adapters/printers/driver-types.ts` | Copiar literal | Cambiar `import type { Printer } from '@maragon/shared'` por `import type { Printer } from '../../db/repositories/printer-repo'` (modelo local). |
| 2 | `apps/pos/electron/services/printing/ble-driver.ts` | `src/main/adapters/printers/ble-driver.ts` | Copiar literal | Misma adaptación de import de `Printer`. Path principal para Aomus My A1. Verificar que `@abandonware/noble` ^1.9 funciona en Electron 39. |
| 3 | `apps/pos/electron/services/printing/bluetooth-driver.ts` | `src/main/adapters/printers/bluetooth-driver.ts` | Copiar literal | Mismo cambio de import. Sirve como fallback si la Aomus se reconfigura como BT-SPP en lugar de BLE. |
| 4 | `apps/pos/electron/services/printing/usb-driver.ts` | `src/main/adapters/printers/usb-driver.ts` | Copiar literal | Mismo cambio de import. Mantener para EPSON TM-T20 baseline si el cliente decide migrar de BLE a USB. |
| 5 | `apps/pos/electron/services/printing/detect.ts` | `src/main/adapters/printers/detect.ts` | Copiar literal | No depende de `@maragon/shared`. Reusable tal cual. |
| 6 | `apps/pos/electron/services/printing/print-queue.ts` | `src/main/services/PrintQueue.ts` | Adaptar | Cambiar tabla `printer` por la del nuevo schema (sin `print_cancellations`, sin `printer_use_case`). Use cases reducen a uno solo (`'voucher'`), simplificar `renderBytes`. |
| 7 | `apps/pos/electron/services/printing/render.ts` | `src/main/services/render.ts` | Reescribir mínimo | En wifi-voucher hay un solo template (`renderVoucher`). Eliminar dispatch a kitchen/precheck/receipt/z-report. |
| 8 | `apps/pos/electron/services/printing/templates/receipt.ts` | `src/main/services/templates/voucher.ts` | Referencia conceptual | No copiar literal — el ticket es muy distinto (logo + SSID + QR raster + footer). Reusar funciones helper (`formatRow`, `formatTime`, alineación con `EscPosBuilder`). |
| 9 | `packages/shared/src/escpos/commands.ts` | `src/main/escpos/commands.ts` | Copiar literal | Solo bytes ESC/POS estándar. Sin dependencias. |
| 10 | `packages/shared/src/escpos/builder.ts` | `src/main/escpos/builder.ts` | Copiar literal | Cambiar `import * as cmd from './commands.js'` queda igual. Agregar método `image(pngBuffer)` para imprimir el QR raster (no existe aún en maragon — extender). |
| 11 | `packages/shared/src/escpos/index.ts` | `src/main/escpos/index.ts` | Copiar literal | Re-export. |
| 12 | `apps/pos/electron/services/nip-crypto.ts` | `src/main/services/PinCrypto.ts` | Adaptar (renombrar) | Renombrar `hashNip`/`verifyNip` a `hashPin`/`verifyPin`. Misma config argon2id. |
| 13 | `apps/pos/electron/services/lockout-tracker.ts` | `src/main/services/LockoutTracker.ts` | Adaptar (parámetros) | Cambiar `MAX_FAILED_ATTEMPTS` de 5 a **3** (regla del plan v1.1). Mantener 5 min de bloqueo. |
| 14 | `apps/pos/electron/db/connection.ts` | `src/main/db/connection.ts` | Copiar literal | Cambiar `migrations.directory` si la ruta varía. Mantener pragmas `foreign_keys = ON; journal_mode = WAL`. |
| 15 | `apps/pos/electron/db/run-migrations.ts` | `src/main/db/run-migrations.ts` | Copiar literal | Sin cambios. |
| 16 | `apps/pos/electron/db/migrations/20260501_000000_init_system.ts` | `src/main/db/migrations/<datetime>_init_system.ts` | Adaptar (renombrar) | Tabla `system_info` para `schema_version`. Útil para evolución del schema. |
| 17 | `apps/pos/electron/db/migrations/20260505_000000_printers.ts` | `src/main/db/migrations/<datetime>_printers.ts` | Adaptar | Quitar `printer_use_case` (no aplica) y `print_cancellations`. La tabla `printer` queda con: `id, name, connection, identifier, width_chars, active, notes`. Tabla `print_job` se mantiene para la cola. |
| 18 | `apps/pos/electron/main.ts` (estructura) | `src/main/index.ts` | Referencia conceptual | Tomar el patrón de `app.whenReady().then(async () => { db = createConnection; await runMigrations; instanciar servicios; registrar handlers; createWindow })`. NO copiar handlers POS. |
| 19 | `apps/pos/electron/preload.ts` | `src/preload/index.ts` | Referencia conceptual | Mismo patrón `contextBridge.exposeInMainWorld('api', { ... })`. Reescribir el árbol de namespaces para los del plan v1.1 (`waiter`, `admin`, `printer`, `router`). |
| 20 | `apps/pos/package.json` (sección `build`) | `wifi-voucher-manager/package.json` | Adaptar | Cambiar `appId` a `com.okuni.wifi-voucher-manager`, `productName` a `WiFi Voucher Manager`. Mantener `asarUnpack` con la lista de módulos nativos. Agregar `argon2` y mantener `@abandonware/noble`, `serialport`, `@thiagoelg/node-printer`, `better-sqlite3`. |
| 21 | `apps/pos/package.json` (sección `scripts`) | `wifi-voucher-manager/package.json` | Adaptar | Mantener `predev` con `electron-rebuild -f -w better-sqlite3,@abandonware/noble,argon2`. Mantener `dist:win` con `electron-builder --win nsis`. Renombrar a npm scripts (`pnpm build` → `npm run build`). |
| 22 | `.context/architecture.md` (estructura) | `.context/ARCHITECTURE.md` | Referencia conceptual | Sirve de plantilla del archivo de contexto requerido por el plan v1.1 sección 3.1. |
| 23 | `apps/pos/electron/db/cli/migrate.ts` | `src/main/db/cli/migrate.ts` | Copiar literal | Permite `npm run db:migrate` para correr migraciones sin levantar Electron (útil en CI). |
| 24 | `apps/pos/electron/services/audit-service.ts` | `src/main/services/AuditService.ts` | Referencia conceptual | Mismo patrón pero contra tabla `audit_log` del plan v1.1 (sección 3.3), con `event_type` y `payload` JSON. |

**No portar**: `accounts-service`, `payments-service`, `tables-service`, `categories-service`, `modifiers-service`, `products-service`, `shifts-service`, `mdns`, `socket.io`, `express` (servidor HTTP de waiter móvil), `nodemailer`, `bonjour-service`. Todo eso es POS-específico.

---

## Sección D — Esqueleto del plan de 7 fases

### Fase 0 — Setup del repositorio (estimación 0.5 días)
- **Goal**: repo `wifi-voucher-manager` inicializado con stack del plan v1.1, módulos nativos compilando contra Electron 39, `npm run dev` levanta Electron con renderer Vite/React.
- **Deliverables clave**:
  - Estructura de directorios sección 3.1 del plan v1.1.
  - `package.json` con dependencias actualizadas (D-001/D-002/D-003/D-005), scripts portados de maragon (D-010), `electron-builder.build.asarUnpack`.
  - `tsconfig.electron.json`, `tsconfig.renderer.json`, `tsconfig.json` raíz; `vite.config.ts`; `electron-builder.yml`.
  - `.context/PROJECT.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DEPENDENCIES.md` con contenido inicial.
  - `DECISIONS.md` con las 15 decisiones de Sección B de este documento (12 del Arquitecto + 3 del usuario en chat).
  - GitHub Actions: `lint + type-check + test` en push.
- **Bloqueadores externos**: ninguno.
- **Criterios de aceptación duros**:
  - `npm run dev` abre ventana Electron con React "Hello World" sin errores.
  - `npm run build` produce `.exe` (o `.dmg` en Mac dev) sin errores.
  - `npm run lint` y `npm run type-check` exit 0.
  - `electron-rebuild` corre limpio para los 5 módulos nativos.
  - `.context/ARCHITECTURE.md` describe la separación main/renderer/preload + adapter pattern.
- **Asignación a especialistas**: **QA/Empaquetado/Seguridad specialist** (lead, owner del scaffolding), **Backend specialist** (consulting on dependencies + tsconfigs).

### Fase 1 — QRService + WaiterView básica + DB scaffolding (estimación 1 día)
- **Goal**: vista de mesero abre lista al startup con un botón gigante; al click muestra preview del QR (sin imprimir aún); paleta UX 5.6 aplicada.
- **Deliverables clave**:
  - `QRService` (genera payload `WIFI:T:WPA;S:...;P:...;;` con escape correcto + PNG buffer 200×200).
  - `PasswordService` (charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 10 chars, `crypto.randomInt`).
  - Migraciones knex iniciales: `passwords`, `print_log`, `config`, `audit_log`, `printer`, `print_job`.
  - Repository pattern (`PasswordRepository`, `PrinterRepository`).
  - `WaiterView.tsx` con botón centrado + indicador de estado (verde/ámbar/rojo) + icono engrane esquina inferior derecha.
  - IPC `getCurrentSSID`, `getSystemHealth`, `printVoucher` (devuelve preview data URL en esta fase).
  - Tokens UX 5.6 en `src/renderer/styles/tokens.ts` consumidos por `tailwind.config.ts`.
  - Self-host de Inter + JetBrains Mono.
- **Bloqueadores externos**: ninguno.
- **Criterios de aceptación duros**:
  - Test unit: `QRService.formatPayload()` ≥ 10 casos (chars especiales, longitud, hidden flag).
  - Test unit: `PasswordService.generate()` 10000 iteraciones — todas matchean charset, sin chars prohibidos.
  - Component test (Testing Library): WaiterView renderiza los 3 estados.
  - Visual review por orquestador (paleta 5.6 cumplida, sin emojis, sin gradientes).
  - Escanear QR del preview con celular real conecta a una red dummy (validación manual).
- **Asignación a especialistas**: **Backend specialist** (QRService, PasswordService, repos), **Frontend+UI/UX specialist** (WaiterView, tokens, fonts, paleta). En paralelo.

### Fase 2 — PrinterService + impresión real + Discovery (estimación 2 días)
- **Goal**: imprimir voucher real en Aomus My A1 (BLE) desde Win11; admin puede descubrir, probar y seleccionar impresora.
- **Deliverables clave**:
  - Interfaz `PrinterDriver` + drivers `UsbDriver`, `BluetoothDriver`, `BleDriver` portados de maragon.
  - `PrintQueue` (SQLite-persistida, serialización 1-en-1, sin auto-retry).
  - `MockPrinterDriver` (driver en memoria que produce y descarta bytes — para dev offline).
  - `discover()` cross-platform (CUPS + wmic + SerialPort.list + noble scan).
  - Template `voucher.ts` con `EscPosBuilder` (logo opcional, SSID, QR raster GS v 0, footer).
  - IPC `discoverPrinters`, `testPrinterConnection`, `printTestVoucher`, `printDiagnosticPage`.
  - Modal de discovery en AdminView (preview de Fase 3).
- **Bloqueadores externos**: ninguno (Aomus disponible HOY). El driver soporta TM-T20 baseline si el cliente decide migrar.
- **Criterios de aceptación duros**:
  - Imprimir en hardware real Aomus My A1 vía RDP a Win11 al menos 5 veces seguidas, escanear QR e iOS/Android conectan.
  - `discover()` devuelve la Aomus en ≤ 5s (BLE scan 6s configurado).
  - Tiempo click-a-papel ≤ 4s.
  - Test integration: snapshot del buffer ESC/POS generado por `voucher.ts` con payload conocido.
  - `MockPrinterDriver` permite tests E2E en CI sin hardware.
- **Asignación a especialistas**: **Hardware/Red specialist** (port de drivers, discovery, validación RDP), **Backend specialist** (PrintQueue, render, IPC handlers). Coordinación cercana.

### Fase 3 — AdminView + PIN + configuración persistente (estimación 2 días)
- **Goal**: admin puede configurar todo desde UI; PIN protege acceso; configuración sobrevive a restart.
- **Deliverables clave**:
  - `AdminView.tsx` con layout 2-columnas (nav 240px + contenido) según UX 5.6.
  - Modal de PIN con 4 inputs monoespaciados, bloqueo tras 3 fallos × 5 min vía `LockoutTracker`.
  - `PinCrypto` con argon2id (D-001).
  - **PIN inicial default `0000`** (D-013); primer login a AdminView fuerza wizard de cambio antes de mostrar contenido.
  - Secciones: Inicio, Impresora (con discovery modal de Fase 2), Router (placeholder), Programación, Negocio, Estadísticas, Logs.
  - Persistencia config: `electron-store` para `AppConfig` general, `safeStorage.encryptString()` para credenciales router (preparado aunque router no llegue).
  - Recharts: gráfico de impresiones por día/semana/mes leyendo `print_log`.
  - Exportación CSV de `audit_log`.
- **Bloqueadores externos**: ninguno.
- **Criterios de aceptación duros**:
  - PIN bloquea correctamente tras 3 fallos, countdown visible, desbloquea pasados 5 min.
  - Cambio forzado de PIN en primer login funciona; rechaza `0000` como nuevo PIN.
  - Cambio de SSID/business name persiste tras `app.quit()` + relaunch.
  - Visual review por orquestador en cada sección (tokens 5.6, sin Material patterns).
  - Discovery modal: tras seleccionar item ejecuta `testConnection()` automáticamente, habilita "Usar esta impresora" solo tras éxito.
- **Asignación a especialistas**: **Frontend+UI/UX specialist** (lead — todas las pantallas), **Backend specialist** (PinCrypto, electron-store, safeStorage wrapping). En paralelo.

### Fase 4 — RouterService + TPLinkArcherAdapter (estimación 2-3 días)
- **Goal**: rotación automática de password en TP-Link Archer real; modo fallback manual cuando el adapter falla.
- **Deliverables clave**:
  - Interfaz `IRouterAdapter`.
  - `TPLinkArcherAdapter` (cliente HTTP propio, axios, login + leer SSID guest + cambiar password + logout).
  - `MockRouterAdapter` (para dev y CI).
  - Sección Router en AdminView completa: inputs IP/user/pass/modelo/SSID guest, botones `pingRouter` y `testRouterConnection`.
  - Modo fallback manual: si adapter falla, banner persistente con la nueva password en monoespaciada para que el admin la copie y pegue en la UI web del router.
  - Cifrado de credenciales con `safeStorage` (DPAPI en Win).
- **Bloqueadores externos**: 🔴 **CRÍTICO — el cliente NO ha comprado el TP-Link Archer C24/A6 v3 todavía.** Esta fase queda en 70% (interfaz + Mock + UI + fallback manual + tests con `nock` contra fixtures grabados de comunidad). El 30% restante (validación contra hardware real) se desbloquea cuando llegue el router.
- **Criterios de aceptación duros**:
  - Tests con `nock`: simular login, leer SSID, cambiar password, logout — pass.
  - `MockRouterAdapter` permite ejecutar Fase 5 sin hardware.
  - Visual review de la sección Router (5.6).
  - Modo fallback manual probado: desconectar router físicamente → app muestra banner persistente con la password.
- **Asignación a especialistas**: **Hardware/Red specialist** (lead — adapter HTTP, fixtures, fallback), **Frontend specialist** (sección Router en AdminView).

### Fase 5 — SchedulerService + rotación automática (estimación 1 día)
- **Goal**: rotación nocturna automática a la hora configurada; recovery on startup; backoff exponencial; commit DB sólo tras confirmación HTTP.
- **Deliverables clave**:
  - `SchedulerService` con `node-cron` y timezone explícito.
  - Verificación al startup: si `last_rotation > 24h` ejecutar inmediatamente.
  - Backoff exponencial 1m / 5m / 15m, máx 3 reintentos.
  - Notificación visual persistente (banner inline con borde 3px rojo, NO toast) si los 3 fallan.
  - Transacción DB en `passwords` se commitea solo después de que `routerAdapter.changeGuestPassword()` resuelve.
  - Integración con `audit_log`.
- **Bloqueadores externos**: depende de `MockRouterAdapter` (Fase 4) — no necesita hardware real.
- **Criterios de aceptación duros**:
  - Test integration con tiempo mockeado (`vi.useFakeTimers`): startup-recovery + cron fire + retry chain + final fail.
  - Manual: dejar app corriendo con cron `* * * * *` (cada minuto) usando MockRouter, verificar 10 ejecuciones limpias.
  - DB nunca tiene `passwords.active=1` para una password sin entrada en `audit_log` con éxito.
- **Asignación a especialistas**: **Backend specialist** (lead).

### Fase 6 — Pulido + Empaquetado + Documentación (estimación 1.5 días)
- **Goal**: instalable `.exe` listo para deploy en Win11 del cliente; auto-arranque; manuales.
- **Deliverables clave**:
  - Auto-arranque al iniciar Windows (registry o `app.setLoginItemSettings`).
  - Icono `.ico` y branding final.
  - `npm run dist:win` produce `.exe` NSIS oneclick=false con shortcut de escritorio.
  - **Sin code signing en v1** (D-014); manual de instalación incluye instrucciones de whitelist Win Defender.
  - Manual de usuario (PDF) para mesero (1 página) y admin (5-8 páginas).
  - Manual de instalación para Okuni Solutions (deploy + troubleshooting).
  - Video Loom 5 min de operación del mesero.
  - `npm audit` con severidad ≥ moderate resuelto.
  - CSP estricta `default-src 'self'` validada en index.html.
- **Bloqueadores externos**: ninguno.
- **Criterios de aceptación duros**:
  - Instalación limpia en Win11 nuevo (laptop dev sin deps): doble click `.exe` → instala → primer arranque pide PIN inicial → vista mesero → imprime QR funcional.
  - Audit final de seguridad (sandbox, contextIsolation, no remote, safeStorage credenciales).
- **Asignación a especialistas**: **QA/Empaquetado/Seguridad specialist** (lead — packaging, security audit, manuales, video).

### Fase 7 — Piloto en producción (estimación 1-2 semanas en operación)
- **Goal**: 0 días sin servicio WiFi en la primera semana; ≥ 95% impresiones exitosas; ≥ 95% rotaciones exitosas.
- **Deliverables clave**:
  - Despliegue en restaurante (instalación + config + capacitación 15 min al mesero).
  - Monitoreo diario de `audit_log` y `print_log` los primeros 7 días vía RDP.
  - Hotfixes según incidencias (cada bug se convierte en test de regresión antes del fix).
  - **Smoke test diario automatizado** (D-015): self-check interno (impresora ping, router reach, DB integrity) registrado en `audit_log`. Sin webhooks externos en v1.
- **Bloqueadores externos**: 🔴 cliente compra TP-Link Archer (Fase 4 cierre). 🟡 confirmación de qué impresora queda en producción (Aomus pareada en BLE o impresora térmica adicional).
- **Criterios de aceptación duros**:
  - Métricas del plan v1.1 sección 1.3 cumplidas tras 7 días.
  - Mesero opera sin asistencia tras una sola capacitación.
- **Asignación a especialistas**: **QA/Empaquetado/Seguridad specialist** (lead — monitoreo, smoke tests, fixes); todos los demás reactivos según incidencias.

---

## Sección E — Contratos IPC actualizados

```typescript
// src/shared/types.ts

// ============================================================================
// MODELOS LOCALES (sin dependencia de @maragon/shared)
// ============================================================================

export type PrinterConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

// DELTA D-002: tipos de impresora ahora reflejan los 3 carriles concretos.
export interface Printer {
  id: string;              // uuid
  name: string;            // editable por admin
  connection: PrinterConnection;
  identifier: string;      // formato canónico D-008
  width_chars: 32 | 48;
  active: boolean;
  notes: string | null;
}

// DELTA D-008: identifier ahora es self-describing por connection type.
export interface DiscoveredPrinter {
  identifier: string;            // formato canónico D-008 (puede estar vacío si requiere instalación CUPS)
  label: string;                 // legible para humanos
  connection: PrinterConnection; // ahora obligatorio (antes era 'system'|'usb'|'network')
  discoveredUri?: string;        // DELTA: URI CUPS si la impresora fue descubierta pero NO instalada (mac/linux)
  // Heurística: si lo detectamos como ESC/POS-compatible (BLE con char writable, USB con VID conocido).
  likelyEscPosCompatible: boolean;
  suggestedType?: 'epson' | 'star' | 'aomus' | 'tanca' | 'daruma' | 'brother';
}

// ============================================================================
// HEALTH / CONFIG
// ============================================================================

export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;
  schedulerRunning: boolean;
  lastRotation: string | null;
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
}

export interface AppConfig {
  router: {
    host: string;
    username: string;
    passwordEncrypted: string; // safeStorage DPAPI
    model: 'archer-c24' | 'archer-a6' | 'mock';
    guestSSID: string;
  };
  printer: {
    activePrinterId: string | null; // FK a tabla printer
    // DELTA D-002: encoding y type ya no son globales — viven por driver/template.
  };
  schedule: {
    rotationCron: string;
    timezone: string;
  };
  business: {
    name: string;
    logoPath?: string;
    footerMessage: string;
  };
  admin: {
    pinHash: string;            // DELTA D-001: argon2id en lugar de bcrypt
    pinIsDefault: boolean;      // DELTA D-013: true mientras siga siendo '0000'; bloquea AdminView hasta cambiarlo
  };
}

export interface PrinterTestResult {
  success: boolean;
  online: boolean;
  latencyMs: number;
  errorMessage?: string;
  // DELTA D-002: paper status no se reporta vía BLE/SerialPort (sólo USB con node-thermal-printer).
  hasPaper?: boolean | null;
  hasError?: boolean | null;
}

export interface RouterTestResult {
  success: boolean;
  reachable: boolean;
  authenticated: boolean;
  guestSsidFound: boolean;
  guestSsidName?: string;
  guestEnabled?: boolean;
  errorStep?: 'reach' | 'login' | 'read' | 'parse';
  errorMessage?: string;
}

export interface PrintStats {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  byDay: Array<{ date: string; count: number }>;
}

export interface AuditEvent {
  id: number;
  eventType: 'password_rotation' | 'print' | 'config_change' | 'error';
  payload: unknown;
  createdAt: string;
}

// ============================================================================
// CONTRATO IPC
// ============================================================================
// DELTA: namespacing por dominio (waiter / admin / printer / router / stats),
// alineado con el patrón `api.printing.*` de maragon_pdv.
// El renderer accede como window.api.<namespace>.<method>(...).

export interface IpcAPI {
  waiter: {
    printVoucher: () => Promise<{ success: boolean; jobId?: string; error?: string }>;
    getCurrentSSID: () => Promise<string>;
    getSystemHealth: () => Promise<SystemHealth>;
  };

  admin: {
    // DELTA D-001: validatePin usa argon2id en main.
    validatePin: (pin: string) => Promise<{ ok: true } | { ok: false; lockedUntilMs?: number; remainingAttempts?: number }>;
    // DELTA D-013: cambio forzado de PIN en primer login.
    changePin: (oldPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
    getConfig: () => Promise<AppConfig>;
    updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
    rotatePasswordNow: () => Promise<{ success: boolean; newPassword: string; error?: string }>;
  };

  printer: {
    // DELTA D-004: discovery cross-platform; devuelve por connection type.
    discover: () => Promise<DiscoveredPrinter[]>;
    // DELTA D-002: testConnection toma connection+identifier explícitos.
    testConnection: (input: { connection: PrinterConnection; identifier: string; width_chars: 32 | 48 }) => Promise<PrinterTestResult>;
    list: () => Promise<Printer[]>;
    create: (input: Omit<Printer, 'id'>) => Promise<Printer>;
    update: (input: Partial<Printer> & { id: string }) => Promise<Printer>;
    setActive: (id: string) => Promise<void>;
    delete: (id: string) => Promise<void>;
    printTestVoucher: () => Promise<{ jobId: string }>;
    printDiagnosticPage: () => Promise<{ jobId: string }>;
    // DELTA D-009: jobs en cola, sin auto-retry.
    getJobStatus: (jobId: string) => Promise<{ status: 'pending' | 'printed' | 'failed'; lastError: string | null } | null>;
    retryJob: (jobId: string) => Promise<void>;
    listRecentJobs: (limit?: number) => Promise<Array<{ id: string; status: string; createdAt: string; lastError: string | null }>>;
    installCupsQueue: (input: { uri: string; name: string }) => Promise<{ identifier: string }>;
  };

  router: {
    pingRouter: () => Promise<{ reachable: boolean; latencyMs?: number; error?: string }>;
    testConnection: () => Promise<RouterTestResult>;
    // DELTA D-006 (fallback manual): si la app no puede automatizar, permite marcar manualmente.
    markPasswordAppliedManually: (password: string) => Promise<void>;
  };

  stats: {
    getStats: (range: 'today' | 'week' | 'month') => Promise<PrintStats>;
    getRecentEvents: (limit: number) => Promise<AuditEvent[]>;
    exportLogs: (path: string) => Promise<void>;
  };
}

// Reglas IPC (heredadas de plan v1.1, refinadas):
// - contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true.
// - Exposición vía contextBridge en preload (patrón window.api.<ns>.<method>).
// - Validar TODO input con zod en main antes de procesar.
// - Errores nunca exponen stack traces al renderer; mensajes legibles.
// - Operaciones de descubrimiento/prueba con timeout máx 10s; nunca bloquear UI.
// - Las llamadas que disparan impresión devuelven jobId, no esperan al print real (queue async).
```

---

## Sección F — Cuestiones abiertas / asunciones para los 4 especialistas

### Para Backend specialist
1. **Persistencia de la cola de impresión**: maragon usa SQLite-persistida (`print_job` table). El plan v1.1 dice "cola con prioridad baja" sin especificar. ¿Confirmamos persistencia en SQLite (sobrevive reinicios) o cola en memoria (pérdida en crash es aceptable porque el mesero re-imprime)? **Recomendación: SQLite, alineado con maragon.**
2. **Render del QR como imagen raster**: `EscPosBuilder` de maragon no tiene `image()` aún. Para imprimir el QR PNG hay que extender el builder con `GS v 0` (raster bit image). ¿Validar primero contra Aomus que el comando funciona, o usar `printQR()` de `node-thermal-printer` solo para USB y un raster manual para BLE?
3. **`AppConfig` partition**: el plan v1.1 mete TODO en `electron-store`, pero `printer.activePrinterId` apunta a una tabla SQLite. ¿Mantenemos esa partición (electron-store para "settings", SQLite para "data") o todo en SQLite via tabla `config` key-value? **Recomendación: partición — electron-store para config simple, SQLite solo para datos relacionales.**
4. **Migración de schema**: knex usa `db.migrate.latest()`. ¿Qué pasa si el cliente tiene un installer de v1.0 instalado y actualizamos? Diseñar política de migraciones idempotentes (las de maragon lo son porque usan `createTable` + check). Confirmar.

### Para Frontend+UI/UX specialist
5. **Testing visual**: el plan v1.1 menciona "snapshot de Storybook (o equivalente)". maragon no usa Storybook. ¿Adoptamos Storybook o usamos snapshots de Testing Library + Playwright para visual regression? Definir antes de Fase 1.
6. **Ruta de fonts en producción**: `@fontsource/inter` se importa en CSS, pero `electron-builder` con asar puede romper rutas de woff2. Validar empaquetado funciona desde el `.exe`.
7. **Modal de discovery**: en maragon hay 3 botones (USB / Bluetooth / BLE). En wifi-voucher con un solo modal full-screen, ¿muestra los 3 simultáneamente con badges de tipo, o tiene tabs? UX 5.6 dice "una sola jerarquía simultánea" — tabs no encajan. **Recomendación: lista única con badge de tipo de conexión (icono lucide).**
8. **Wizard de cambio de PIN forzado** (D-013): ¿qué validaciones aplican para el nuevo PIN? Mínimo 4 dígitos, no `0000`, no `1234`, no repeticiones (`1111`)? Definir reglas y mensajes de error.

### Para Hardware/Red specialist
9. **Versión de Electron y `@abandonware/noble`**: maragon usa Electron 30 + noble 1.9. wifi-voucher debe usar Electron 39 (plan v1.1). ¿`electron-rebuild` compila noble contra ABI de Electron 39? Validar en Fase 0 antes de pasar a Fase 2; si rompe, documentar excepción y bajar a Electron 30.
10. **Stability del peripheralId BLE en Windows**: el `identifier` BLE depende de `peripheralId` que en Win11 suele ser estable, pero NO en macOS (cambia por sesión). Para esta app que vive en Win11, asumir estable. Documentar la asunción y agregar manejo para "si el identifier no encuentra periférico, reescanear y permitir re-asignar al admin".
11. **Fixtures de TP-Link Archer**: ¿de dónde sacamos fixtures HTTP para Fase 4 sin tener el router? Opciones: (a) buscar en GitHub repos abandonados con responses grabadas, (b) usar TPLink Tether emulator si existe, (c) implementar contra spec del openwrt-style endpoint y validar con hardware al llegar. Decidir y documentar.
12. **Discovery en Windows**: `wmic printer get name` está deprecado en Win11 (PowerShell `Get-Printer` es el reemplazo). ¿Implementamos los dos en el `detect.ts` portado? maragon solo usa `wmic`. **Recomendación: portar como está y agregar fallback a `Get-Printer` solo si `wmic` falla.**

### Para QA/Empaquetado/Seguridad specialist
13. **CSP estricta vs Vite dev**: `default-src 'self'` rompe el HMR de Vite en dev. ¿CSP relajada en dev y estricta en prod (vía electron-builder build flag), o CSP única estricta y dev sin HMR? **Recomendación: dos CSP, igual que maragon.**
14. **Coverage threshold**: el plan dice ≥80% en services y ≥85% en QRService. ¿Configuramos `vitest.config.ts` con thresholds que rompen build, o solo reportes? maragon solo reporta. **Recomendación: thresholds en CI para Fase 2+.**
15. **`safeStorage` en mac dev**: `safeStorage.encryptString()` en macOS usa Keychain con prompt al usuario. En dev en Mac esto bloqueará tests E2E. ¿Mockeamos `safeStorage` en tests, o reemplazamos por implementación in-memory en `NODE_ENV=test`? **Recomendación: wrapper `CredentialStorage` con `MockCredentialStorage` en tests.**
16. **Manual de whitelist Win Defender** (D-014): ¿pasos exactos para el cliente? Right-click `.exe` → Properties → Unblock + agregar carpeta a exclusiones de Defender + permitir SmartScreen "Run anyway". Documentar con screenshots para el manual de instalación.
17. **Self-check de Fase 7** (D-015): ¿qué probes incluye exactamente? Pings: impresora (`testPrinterConnection`), router (`pingRouter`), DB (`SELECT 1`), última rotación < 25h. Frecuencia: diaria a las 03:00 (después de la rotación de 23:00). Output: nueva fila en `audit_log` con `event_type='health_check'` y payload con resultados.

---

**Estado**: arquitectura validada por usuario en chat con 4 ajustes (Knex, PIN default 0000, sin code signing, self-check interno). Lista para Etapa 2 (4 especialistas en paralelo).
