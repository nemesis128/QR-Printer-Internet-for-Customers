# Dependencias críticas

## Runtime nativas (requieren rebuild por plataforma)

| Paquete | Versión | Propósito | Rebuild |
|---|---|---|---|
| better-sqlite3 | ^12.9.0 | DB local sincrónica (D-022 — upgrade desde 11.5 por v8 13 ABI breakage) | Sí — Electron 39 ABI 127 |
| @abandonware/noble | ^1.9.2-25 | BLE para Aomus My A1 — VALIDADO contra Electron 39 (Q9 / D-011) | Sí |
| serialport | ^13.0.0 | BT-SPP fallback | Sí |
| argon2 | ^0.44.0 | Hash PIN admin (D-001) | Sí |

Rebuild se hace con `electron-rebuild -f -w <list>` (script `predev` y `predist`). asarUnpack en `electron-builder.yml` empaqueta los `.node` correctamente.

**Operational note:** después de `electron-rebuild` (que compila contra Electron ABI), correr unit tests requiere `npm rebuild better-sqlite3 argon2` para volver al Node ABI que vitest necesita. CI hace este rebuild en el job `test`.

## Eliminadas vs el spec original (D-023)

- **`@thiagoelg/node-printer` (era ^0.6.2)**: dropped en Task 7. Depende de `nan` que usa APIs v8 12.x removidas en v8 13 (Electron 39). No hay upgrade path. Reemplazo: el `UsbDriver` (Task 14+ de Fase 2) usará `lp`/`lpr` (mac/linux) y PowerShell `Out-Printer` (Win) vía child_process.

## Runtime puras (puro JS/TS)

| Paquete | Versión | Propósito |
|---|---|---|
| knex | ^3.1.0 | Query builder + migraciones (D-005) |
| axios | ^1.7.7 | Cliente HTTP para TP-Link Archer |
| electron-store | ^10.0.0 | AppConfig persistente |
| electron-log | ^5.2.0 | Logging robusto + sanitize tokens |
| node-cron | ^3.0.3 | Scheduler rotación |
| qrcode | ^1.5.4 | Generación QR PNG |
| zod | ^3.23.8 | Validación IPC en main |
| zustand | ^5.0.0 | Estado global renderer |
| react / react-dom | ^18.3.1 | UI |
| recharts | ^2.13.0 | Gráficos Estadísticas |
| lucide-react | ^0.460.0 | Iconos stroke 1.5 |
| @fontsource/inter, @fontsource/jetbrains-mono | ^5.1.0 | Fonts self-hosted |

## Dev

Vitest 2 (no Jest), Playwright 1.48 (no spectron — deprecated), electron-builder 25, ESLint 9 flat, Prettier 3.3, TypeScript 5.6, happy-dom 15 (no jsdom).

## Alternativas rechazadas (con razón)

- bcrypt → argon2id (D-001).
- usb npm package directo → CUPS/wmic + serialport + noble (D-003).
- node-thermal-printer como driver único → 3 drivers propios (D-002).
- Storybook → Testing Library + Playwright visual (D-016).
- pnpm → npm (D-012, no monorepo).
- Material UI / Ant / styled-components / Redux → Tailwind + Zustand + componentes propios.
- Webpack → Vite. Jest → Vitest. Spectron → Playwright.
- @thiagoelg/node-printer → shell commands para spooler (D-023).

## Política de upgrade

Cualquier cambio de versión major requiere entrada en DECISIONS.md con justificación. Versiones del plan v1.1 son las verificadas estables a mayo 2026; D-022 actualizó better-sqlite3 12 y D-023 eliminó node-printer porque ambos eran incompatibles con Electron 39 v8 13.
