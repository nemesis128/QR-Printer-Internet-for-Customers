# WiFi Voucher Manager

App Electron de escritorio para Windows que imprime QR de WiFi en impresora térmica para clientes de un restaurante, y rota automáticamente la contraseña del SSID guest del router secundario.

**Owner:** Okuni Solutions
**Stack:** Electron 39 + React 18 + TypeScript 5.6 + Knex/SQLite + argon2 + drivers BLE/USB/Serial propios
**Estado:** En desarrollo (Fase 0 — scaffolding completo, BLE validado)

## Documentos clave

- `../PLAN-TECNICO-WIFI-MANAGER_2.md` — plan técnico v1.1 (raíz parent)
- `DECISIONS.md` — bitácora de 23 decisiones (D-001 a D-023)
- `.context/PROJECT.md` — overview del proyecto
- `.context/ARCHITECTURE.md` — arquitectura Electron + capas + patrón Adapter
- `.context/API_CONTRACTS.md` — contratos IPC main↔renderer
- `.context/DEPENDENCIES.md` — dependencias críticas y alternativas rechazadas
- `../docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md` — spec consolidado

## Setup

### Prerrequisitos

- **Node 22.20+** (`.nvmrc` lo declara — usa `nvm use`)
- **npm 10+**
- En **Windows**: Visual Studio Build Tools 2022 con workload "Desktop development with C++" + Python 3.11. Necesario para compilar nativos (better-sqlite3, argon2, noble, serialport).
- En **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **No usar paths con espacios** — node-gyp/clang++ no los soporta. El proyecto vive en `qr-clientes/` (sin espacios) por esta razón.

### Install

```bash
npm install
```

`predev` corre `electron-rebuild` automáticamente para los 4 nativos contra Electron 39 ABI 127.

### Dev

```bash
npm run dev
```

Levanta Vite (renderer en `localhost:5173`) + Electron (main + preload). DevTools se abre en panel separado.

### Validación BLE (Fase 0 bloqueante — ya pasada)

```bash
npm run smoke:noble
```

Confirma que `@abandonware/noble` compila contra ABI de Electron 39 y que el adaptador BT del SO funciona. Detecta peripherals BLE en el rango.

### Tests

- Unit + integration: `npm run test`
- Watch: `npm run test:watch`
- Coverage: `npm run test:coverage`
- E2E (Playwright contra `.exe` empaquetado): `npm run test:e2e` (skipped sin `WIFI_VOUCHER_TEST_BUILD_PATH`)

**Operational note:** después de `electron-rebuild` o `npm run predev` (que recompila los nativos contra Electron ABI), correr `npm rebuild better-sqlite3 argon2` para volver al Node ABI que vitest necesita. CI lo hace automáticamente en el job `test`.

### Lint + Type-check

```bash
npm run lint
npm run type-check
```

### Build production (Windows installer)

```bash
npm run dist:win
```

Output: `dist-installer/WiFi Voucher Manager Setup x.y.z.exe`. Sin code signing en v1 (D-014) — el cliente sigue Apéndice C del manual de instalación para whitelistar Win Defender.

## Estructura

```
src/
├── main/        # Electron main process (Node)
├── preload/     # contextBridge IPC
├── renderer/    # React + Vite
└── shared/      # tipos compartidos main↔renderer
```

Detalle exhaustivo: `.context/ARCHITECTURE.md`.

## Variables de entorno

| Variable | Uso |
|---|---|
| `NODE_ENV=test` | activa `MockCredentialStorage` automático (en Fase 3+) |
| `WIFI_VOUCHER_USE_MOCK_STORAGE=1` | fuerza `MockCredentialStorage` (útil dev en Mac sin prompt Keychain) |
| `WIFI_VOUCHER_SKIP_BLE=1` | salta tests que requieren BT adapter (CI) |
| `WIFI_VOUCHER_SKIP_E2E=1` | salta Playwright E2E (CI) |
| `WIFI_VOUCHER_DB_PATH` | override path de DB (default `data.db` en cwd para CLI; en runtime `userData/data.db`) |

## Hardware

- **Impresora**: Aomus My A1 (BLE) en producción inicial. Identifier `<peripheralId>|<svcUuid>|<charUuid>`. Soporta también EPSON TM-T20 (USB vía spooler) y cualquier ESC/POS-compatible vía discovery.
- **Router secundario**: TP-Link Archer C24 o A6 v3 (cliente lo compra en Fase 4). Adapter HTTP propio porque librerías npm están abandonadas.

## Decisiones críticas (resumen)

- argon2id (no bcrypt) — D-001
- 3 drivers de impresora (USB / BT-SPP / BLE) — D-002
- Knex sobre better-sqlite3 12.x — D-005, D-022
- Electron 39 mantenido (BLE validado) — D-011
- Sin code signing v1 — D-014
- @thiagoelg/node-printer eliminado (v8 13 incompat) — D-023

Detalle completo: `DECISIONS.md`.

## Soporte

30 días post-go-live. Reportar issues a Okuni Solutions.
