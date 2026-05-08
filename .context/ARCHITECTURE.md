# Arquitectura

## Modelo de procesos Electron

Tres procesos:
- **main** (Node 22.20) — DB, hardware (BLE/USB/serial), HTTP cliente al router, scheduler, IPC handlers.
- **preload** — único puente seguro main↔renderer; expone `window.api` con tipos de `src/shared/types.ts`.
- **renderer** (Chromium M142) — React 18.3 + Vite 5.4 + Tailwind 3.4 + Zustand 5.

Reglas duras de seguridad: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. El renderer NUNCA toca Node APIs ni hardware directamente.

## Capas en main process

renderer → preload (IPC) → ipc/handlers (validación zod) → services (lógica de negocio, DI) → adapters (hardware) | repositories (DB)

Servicios son clases con dependencias inyectadas por constructor. Discoverable en `src/main/index.ts` (composition root).

## Patrón Adapter

`IRouterAdapter` y `PrinterDriver` son las dos interfaces que abstraen hardware. Razón:
1. Permite `MockRouterAdapter` y `MockPrinterDriver` para dev offline y CI sin hardware.
2. Aísla cambio cuando TP-Link rompe firmware (riesgo R1, alto en plan v1.1).

Drivers de impresora son tres concretos: `BleDriver` (noble — driver de producción para Aomus My A1), `BluetoothDriver` (SerialPort, BT-SPP fallback), `UsbDriver` (vía `lp`/`Out-Printer` por shell command — D-023). Despachados por `printer.connection`.

## Persistencia: tres lugares

| Dónde | Qué | Cómo |
|---|---|---|
| SQLite (`%APPDATA%/wifi-voucher-manager/data.db`) | passwords, print_log, audit_log, printer, print_job | knex + better-sqlite3, migraciones .ts |
| electron-store (`config.json` mismo dir) | AppConfig general (SSID, cron, business name, pinHash, pinIsDefault) | sync, plain JSON |
| safeStorage (DPAPI Win / Keychain Mac) | router password (cifrada) | wrapper `CredentialStorage` para mockear en tests |

## Scheduler con recovery

`SchedulerService` usa `node-cron` con timezone explícito. Al startup verifica `last_rotation > 24h` y dispara catch-up. Backoff exponencial 1m/5m/15m, 3 intentos. Falla persistente → banner inline en UI (NO toast). Transacción atomic: insert con `active=0` → router HTTP call → update `active=1` solo si HTTP OK.

## Pipeline de build

`npm run dev`: Vite (renderer en localhost:5173) + Electron concurrentes con `concurrently`. `predev` compila preload con esbuild + electron-rebuild de los 4 nativos.

`npm run dist:win`: vite build + tsc + esbuild + electron-builder NSIS. `predist` valida CSP + sanitize console.log. `postdist` valida asarUnpack.

CSP doble (D-020): plugin Vite `csp-swap` reemplaza `__CSP__` placeholder en index.html con DEV_CSP (HMR + unsafe-eval) o PROD_CSP (estricta) según `mode`. Defensa-en-profundidad: header HTTP también seteado en main process.

## Sistema de tests

- Unit (vitest + happy-dom): services, adapters, utils, escpos builder.
- Integration (vitest + better-sqlite3 in-memory + nock + MockRouterAdapter): flujos main process.
- E2E (Playwright + Electron empaquetado): 3+ escenarios. Skipped por env var sin un .exe presente.
- Coverage gates escalonados por carpeta y fase (D-021).

## Estilo de código y UX

- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- Sin `any`. Sin `console.log` en prod (electron-log).
- Tokens UX 5.6 en `src/renderer/styles/tokens.ts` consumidos por tailwind.config.

## Threat model resumido

Detalle en docs/superpowers/brainstorming/etapa2-qa.md Sección 6.
- Atacante físico → DPAPI cifra credenciales con cuenta Windows del usuario.
- Mesero curioso → PIN argon2id + bloqueo 3 fallos × 5 min.
- Cliente WiFi escanea red interna → aislado por router secundario (capa de red).
- MITM en cambio password router → comunicación local LAN, requiere acceso físico.
- Inyección WIFI:T:... → escape estricto en QRService.
