# WiFi Voucher Manager — Spec de diseño

**Fecha:** 2026-05-07
**Owner:** Okuni Solutions
**Versión:** 1.0 (consolidación de Etapa 1 + Etapa 2 del brainstorming multi-agente)
**Estado:** pendiente de revisión por el usuario antes de pasar a `writing-plans`

---

## 1. Visión y alcance

App **Electron de escritorio para Windows 11** que vive en la laptop POS de un restaurante mexicano. Cumple dos funciones operativas:

1. **Imprime QR de WiFi** (formato IEEE 802.11u `WIFI:T:WPA;S:...;P:...;;`) en una impresora térmica con un solo click del mesero. Vista sin login.
2. **Rota cada noche la contraseña del SSID guest** de un router TP-Link Archer secundario, para aislar la red de clientes de la red interna del POS Soft Restaurant. Vista admin protegida por PIN.

Owner técnico: Okuni Solutions. Cliente final: restaurante con 5 mesas. Hardware actual disponible: laptop Dell Win11 (RDP desde Mac), impresora **Aomus My A1 (Bluetooth BLE)**, red Wi-Fi del cliente. Hardware aún no comprado: TP-Link Archer C24/A6 v3.

**No es** un monorepo. Repo independiente en `wifi-voucher-manager/`. Stack heredado parcialmente del proyecto hermano `maragon_pdv` (mismo dueño) que ya validó en producción interna varios módulos críticos.

---

## 2. Decisiones consolidadas (DECISIONS.md draft)

15 decisiones de Etapa 1 + 4 de chat con el usuario + 2 nuevas de Etapa 2. Total: **21 decisiones** que parten o complementan el plan v1.1.

| ID | Decisión | Resumen | Fuente |
|---|---|---|---|
| D-001 | Hash PIN admin | **argon2id** (timeCost=3, memoryCost=2^16) — no bcrypt | Arquitecto |
| D-002 | Drivers de impresora | 3 concretos (`UsbDriver`, `BluetoothDriver`, `BleDriver`) detrás de `PrinterDriver` interface — no `node-thermal-printer` solo | Arquitecto |
| D-003 | Paquete `usb` | OPCIONAL (no obligatorio); CUPS/wmic + serialport + noble cubren | Arquitecto |
| D-004 | Discovery cross-platform | mac/linux: `lpstat -p` + `lpinfo -v`; Win: `Get-Printer` (PowerShell) primario + `wmic` fallback; SerialPort.list + noble | Arquitecto + Hardware specialist Q12 |
| D-005 | DB layer | **Knex 3.1** sobre better-sqlite3; migraciones `.ts` append-only e idempotentes | Arquitecto + chat |
| D-006 | Estructura repo | Repo independiente `wifi-voucher-manager/`; sin pnpm workspace; sin `@maragon/shared` | Arquitecto + chat |
| D-007 | ESC/POS rendering | Builder propio (`EscPosBuilder`) portado de maragon, extendido con `image()` (raster `GS v 0`) | Arquitecto + Backend Q1.2 |
| D-008 | Identifier de impresora | Format canónico: USB → `printer:<NAME>`; BT-SPP → puerto serial; BLE → `<peripheralId>\|<svcUuid>\|<charUuid>` | Arquitecto |
| D-009 | Cola de impresión | SQLite-persistida; sin auto-retry (admin re-encola desde Logs) | Arquitecto + Backend Q1.1 |
| D-010 | Empaquetado nativo | electron-builder con `asarUnpack` explícito + `predist` con `electron-rebuild -f -w <list>` | Arquitecto |
| D-011 | Versión Electron | **39.x** mantener plan v1.1; downgrade a 30.x con excepción documentada SI Hardware Q9 falla | Arquitecto + Hardware Q9 |
| D-012 | Comandos package.json | npm (no pnpm) | Arquitecto |
| D-013 | PIN inicial | Default `0000` hardcoded; AdminView fuerza wizard de cambio en primer login | chat |
| D-014 | Code signing v1 | NO firmar; manual de instalación incluye Apéndice C con 3 procedimientos de whitelist Win Defender | chat + QA Q16 |
| D-015 | Smoke test piloto | Self-check interno diario a las 03:00 con 6 probes; solo registra en `audit_log`, NO auto-fix | chat + QA Q17 |
| D-016 | Testing visual | Testing Library snapshots (CI) + Playwright visual regression contra `.exe` empaquetado (local pre-release). NO Storybook | Frontend Q1.1 |
| D-017 | AppConfig partition | electron-store para settings simples; SQLite para datos relacionales; `safeStorage` solo para `router.password` | Backend Q1.3 + chat |
| D-018 | Validación PIN nuevo | 7 reglas en orden: longitud 4, solo dígitos, no `0000`, no repetidos, no asc, no desc, confirmación coincide | Frontend Q1.4 |
| D-019 | Modal de discovery | Lista única vertical con badges de tipo de conexión a la izquierda; sin tabs | Frontend Q1.3 |
| D-020 | CSP estricta | Doble CSP: dev permite `unsafe-eval` + Vite HMR; prod estricta `default-src 'self'`. Plugin Vite intercambia. Defensa-en-profundidad con header HTTP en main process | QA Q13 |
| D-021 | Coverage thresholds | Thresholds duros que rompen build, escalonados por carpeta y por fase. QRService 85% desde Fase 1; services 80% desde Fase 2; renderer 60% desde Fase 2 | QA Q14 |

**Cuestiones técnicas resueltas (no son decisiones nuevas, pero quedan documentadas):**
- Render del QR: extender `EscPosBuilder` con `image()` y comando ESC/POS `GS v 0` desde día 1; validar contra Aomus en Fase 2 día 1.
- Política de migraciones: append-only, idempotentes (`createTableIfNotExists`), backups defensivos antes de `migrate.latest()` si `schema_version` cambia.
- Re-asignación de impresora BLE: si `peripheralId` queda stale, evento `printer:identifier-stale` → banner inline + botón "Re-detectar" en WaiterView.
- Sesión admin: token de 32 bytes generado tras `validatePin` exitoso, TTL 30 min con refresh, validado en cada handler admin.

---

## 3. Stack tecnológico final

### Runtime
- **Electron** 39.x (con plan B 30.x si noble no compila)
- **Node** 22.20.x LTS (incluido en Electron 39)
- **Windows target**: Win11 22H2+ (Win10 22H2 mínimo)

### Frontend (renderer)
- React 18.3.1 + react-dom 18.3.1
- Vite 5.4 + @vitejs/plugin-react 4.3
- TypeScript 5.6.3 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- Tailwind 3.4 + autoprefixer + postcss
- Zustand 5.0 (4 slices: auth, print, adminNav, health)
- Recharts 2.13 (BarChart en Estadísticas)
- lucide-react 0.460 (iconos, stroke 1.5)
- @fontsource/inter 5.1 + @fontsource/jetbrains-mono 5.1 (self-hosted, 3 weights cada uno: 400/500/600 inter, 400/500 mono)

### Backend (main + preload)
- Knex 3.1 + better-sqlite3 11.5
- argon2 0.44 (no bcrypt)
- @abandonware/noble 1.9.2-25 (BLE)
- serialport 13 (BT-SPP)
- @thiagoelg/node-printer 0.6.2 (USB / spooler / CUPS)
- node-thermal-printer 4.6 (queda como dependencia indirecta para algunos comandos USB; el rendering principal lo hace el builder propio)
- axios 1.7 (TP-Link adapter)
- node-cron 3.0.3
- electron-store 10
- electron-log 5
- zod 3.23 (validación IPC en main)

### Dev
- electron-builder 25 + @electron/rebuild 3.6
- vitest 2.1 + @testing-library/react 16 + happy-dom (jsdom alternative, más rápido)
- playwright 1.48
- eslint 9 + typescript-eslint 8 + plugins react/react-hooks/import + prettier
- esbuild 0.24 (preload bundle)
- concurrently 9 + wait-on 7 + cross-env 7 + tsx 4 (dev workflow)
- nock 13 (TP-Link fixtures)

### Excluidas explícitamente
- **bcrypt** → reemplazado por argon2 (D-001)
- **usb** package directo → opcional (D-003)
- **Storybook** → reemplazado por Testing Library + Playwright visual (D-016)
- **Material UI / Ant Design / styled-components / Redux** → ver plan v1.1 sección 9.2
- **escpos** (npm) → abandonado desde 2020
- **bonjour-service / socket.io / express / nodemailer** → POS-only, no aplican aquí
- **Webpack / Jest / spectron** → ver plan v1.1 sección 2.6

---

## 4. Arquitectura de alto nivel

### Modelo de procesos
- **main** (Node 22.20) — DB, hardware (BLE/USB/serial), cliente HTTP al router, scheduler, IPC handlers.
- **preload** — único puente seguro main↔renderer; expone `window.api` con tipos de `src/shared/types.ts`.
- **renderer** (Chromium M142) — React + Vite + Tailwind + Zustand. Cero acceso a Node APIs ni hardware.

**Reglas duras de seguridad** (en `src/main/index.ts` `BrowserWindow`): `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`, `experimentalFeatures: false`. Plus `setWindowOpenHandler({ action: 'deny' })` y `will-navigate` blocker.

### Capas en main process
```
renderer → preload (IPC) → ipc/handlers (validación zod + auth) → services (lógica) → adapters (hw) | repositories (DB)
```

Servicios = clases con dependencias inyectadas por constructor. Composition root en `src/main/index.ts`.

### Adapter pattern
Dos interfaces clave para abstraer hardware:
- **`PrinterDriver`** — implementaciones: `UsbDriver`, `BluetoothDriver`, `BleDriver`, `MockPrinterDriver`. Despachados por `printer.connection`.
- **`IRouterAdapter`** — implementaciones: `TPLinkArcherAdapter`, `MockRouterAdapter`.

### IPC tipado por dominio
Namespacing en 5 dominios (vs flat list del plan v1.1 sección 4):
- `window.api.waiter.*` — `printVoucher`, `getCurrentSSID`, `getSystemHealth`
- `window.api.admin.*` — `validatePin`, `changePin`, `getConfig`, `updateConfig`, `rotatePasswordNow`
- `window.api.printer.*` — `discover`, `testConnection`, CRUD, `printTestVoucher`, `getJobStatus`, `retryJob`, `installCupsQueue`
- `window.api.router.*` — `pingRouter`, `testConnection`, `markPasswordAppliedManually`
- `window.api.stats.*` — `getStats`, `getRecentEvents`, `exportLogs`

Contrato completo en `etapa1-arquitecto.md` Sección E (TypeScript válido con DELTAs marcadas vs plan v1.1).

### Persistencia: tres lugares
| Dónde | Qué | Cómo |
|---|---|---|
| SQLite (`%APPDATA%/wifi-voucher-manager/data.db`) | `passwords`, `print_log`, `audit_log`, `printer`, `print_job`, `system_info`, `config` (k-v fallback) | Knex + better-sqlite3, migraciones `.ts` |
| electron-store (`config.json` mismo dir) | AppConfig (router.host/user, schedule, business, admin.pinHash, admin.pinIsDefault) | sync, plain JSON |
| safeStorage (DPAPI Win / Keychain Mac) | `router.password` cifrada | wrapper `CredentialStorage` con `MockCredentialStorage` para tests |

### Schema SQLite
7 tablas, 5 archivos de migración. DDL completo en `etapa2-backend.md` Sección 6. Resumen:
- `system_info` — kv para `schema_version` y `app_version_last_run`
- `passwords` — histórico (1 row con `active=1`, invariante enforced en repo)
- `print_log` — registro por intento de impresión + FK a `passwords` y `print_job`
- `config` — kv fallback (la mayoría va en electron-store)
- `audit_log` — eventos `password_rotation | print | config_change | error | health_check`
- `printer` — catálogo de impresoras configuradas
- `print_job` — cola persistida con `pending|printed|failed` (D-009)

### Scheduler con recovery
`SchedulerService` con `node-cron` y timezone explícito. Al startup verifica `last_rotation > 24h` y dispara catch-up. Backoff exponencial 1m/5m/15m con 3 intentos. Falla persistente → banner inline persistente borde 3px rojo (NO toast). Transacción atomic: insert con `active=0` → router HTTP call → update `active=1` solo si HTTP OK.

### UX/UI 5.6 — adherencia estricta
- Tokens en `src/renderer/styles/tokens.ts` consumidos por `tailwind.config.ts`. Hex literales de plan v1.1 sección 5.6 — sin tonos nuevos.
- Inter (UI) + JetBrains Mono (passwords/IDs/identifiers BLE), self-hosted vía `@fontsource/*`. Pesos 400/500/600 únicamente.
- Iconos lucide-react stroke 1.5.
- Sombras: solo `0 1px 2px rgba(0,0,0,0.04)` (`shadow-card`). Cero coloreadas, cero blur > 8px.
- Errores: banner inline persistente borde 3px rojo. Cero toasts efímeros.
- Animaciones: solo `150ms ease-out` en hover/focus, `200ms` fade en modales. Excepción justificada en DECISIONS.md: shake de 200ms ±4px en PinModal post-failure (feedback funcional standard iOS/macOS).
- Paleta validada WCAG AA: `textMuted` queda restringido a texto ≥14px peso 500+ o ≥18px peso 400+ (ratio 2.99 sobre `surface`).

Detalle completo en `etapa2-frontend.md` Sección 2 (tokens) + Sección 4 (cada panel admin).

---

## 5. Plan detallado de las 7 fases

Cada fase termina con: PR + code review + tests + actualización de DECISIONS.md si hay desviaciones.

### Fase 0 — Setup del repositorio (0.5 días)

**Lead:** QA/Empaquetado. **Apoyo:** Backend (deps).

**Goal:** repo `wifi-voucher-manager` inicializado, módulos nativos compilando contra Electron 39, `npm run dev` levanta Electron + Vite + React.

**Deliverables:**
- Estructura de directorios completa (ver `etapa2-qa.md` Sección 2.1 — incluye `src/{main,preload,renderer,shared}/`, `tests/{unit,integration,e2e,fixtures}/`, `.context/`, `scripts/`, `build/`).
- `package.json` con deps exactas (D-001 a D-010), scripts npm (incluyendo `predev`/`predist` con `electron-rebuild`), sección `build` separada en `electron-builder.yml`.
- 4 tsconfigs (raíz composite + electron + renderer + shared).
- `vite.config.ts` con plugin custom `csp-swap` (D-020).
- `electron-builder.yml` con `asarUnpack` explícito (D-010), NSIS oneclick=false, language Spanish (3082).
- `vitest.config.ts` con coverage thresholds escalonados (D-021).
- `playwright.config.ts` lanzando Electron empaquetado.
- `eslint.config.mjs` flat config con react/react-hooks/import/typescript-eslint, `no-console` error, `no-explicit-any` error.
- `.github/workflows/ci.yml` con matriz mac/linux/win, env vars `WIFI_VOUCHER_USE_MOCK_STORAGE=1` y `WIFI_VOUCHER_SKIP_BLE=1`.
- `.context/{PROJECT,ARCHITECTURE,API_CONTRACTS,DEPENDENCIES}.md` con contenido inicial.
- `DECISIONS.md` con las 21 decisiones de Sección 2 de este spec.

**Validación bloqueante (Hardware Q9):**
1. `npm install` + `npx electron-rebuild -f -w @abandonware/noble` → exit 0.
2. Script `scripts/smoke-noble.ts` corrido en main process: `noble.state` llega a `'poweredOn'` en ≤ 5s en macOS y ≤ 8s en Win11 RDP. **Si falla, activar Plan B (Electron 30) y documentar excepción D-011 en DECISIONS.md.**

**Criterios de aceptación duros:**
- `npm run dev` abre ventana Electron con React "Hello World" sin errores.
- `npm run build` produce `.exe` o `.dmg` sin errores.
- `npm run lint` y `npm run type-check` exit 0.
- `electron-rebuild` corre limpio para los 5 nativos (better-sqlite3, @abandonware/noble, @thiagoelg/node-printer, serialport, argon2).

### Fase 1 — QRService + WaiterView básica + DB scaffolding (1.5 días)

**Lead:** Backend (services, repos) + Frontend (UI, tokens) en paralelo.

**Goal:** vista mesero abre lista al startup; click muestra preview del QR; paleta UX 5.6 aplicada; DB migra OK.

**Deliverables Backend:**
- `QRService.generate()` con escape correcto del payload + PNG buffer 384×384 + dataUrl. Tests ≥10 casos en `formatPayload` + ≥85% coverage (D-021).
- `PasswordService.generate()` con `crypto.randomInt`, charset filtrado, 10 chars. Test 10000 iteraciones.
- 5 migraciones knex: `init_system`, `passwords`, `print_log`, `config_audit`, `printers`. Política append-only + idempotente.
- `PasswordRepository`, `PrinterRepository` (inyección Knex en constructor).
- `connection.ts` y `run-migrations.ts` portados literal de maragon (con `loadExtensions: ['.ts','.js']`).
- IPC handlers `waiter.getCurrentSSID`, `waiter.getSystemHealth` (con stubs para Fase 1), `waiter.printVoucher` (modo preview, retorna dataUrl).

**Deliverables Frontend:**
- `src/renderer/styles/tokens.ts` exportando palette + typography + spacing + radii + shadows + transitions + iconSizes + zIndex.
- `tailwind.config.ts` consumiendo tokens vía `theme.extend`. `corePlugins` restringe a tokens (no exposición de Tailwind defaults agresivos).
- `src/renderer/styles/fonts.ts` con imports CSS de @fontsource (3 weights inter + 2 weights mono).
- `WaiterView.tsx` con 5 estados visuales (idle/degraded/error/printing/print_failed/printed-transient).
- Componentes primitivos: `PrintButton`, `HealthIndicator`, `SettingsGearButton`, `Banner`, `Spinner` (3 puntos animados — única animación permitida fuera de hover/modal-fade).
- Hook `useSystemHealth` (poll 30s).
- Store `printStore` (zustand: idle/printing/success/failed).

**Criterios de aceptación:**
- Component tests con snapshots de los 5 estados de WaiterView.
- Test unit `formatPayload` ≥10 casos, `generate()` 10000 iteraciones sin colisiones ni chars prohibidos.
- Visual review por orquestador: paleta 5.6 cumplida, sin emojis, sin gradientes.
- Validación manual: escanear QR del preview con celular → conecta a red dummy.
- `document.fonts.check('500 14px Inter')` y JetBrains Mono devuelven `true` en `npm run dev`.

### Fase 2 — PrinterService + impresión real + Discovery (2 días)

**Lead:** Hardware/Red (drivers + discovery + RDP) + Backend (queue + render + IPC) coordinados.

**Goal:** imprimir voucher real en Aomus My A1 BLE desde Win11 ≤ 4s; admin descubre y selecciona impresora.

**Deliverables Hardware/Red:**
- Port literal de maragon: `driver-types.ts`, `ble-driver.ts`, `bluetooth-driver.ts`, `usb-driver.ts`, `detect.ts` con cambio único de import (`@maragon/shared` → repo local).
- Modificación a `detect.ts` para Q12: `Get-Printer` PowerShell primario en Windows, `wmic` fallback.
- `MockPrinterDriver` con modos `'success' | 'always-fail' | 'fail-after-n'` para tests.
- `discoverAll()` con `Promise.allSettled` + timeout 10s + fail-fast por canal.
- Inferencia de marca por VID/nombre (tabla `epson|star|aomus|tanca|daruma|brother`).
- Plan de validación contra Aomus real vía RDP: setup git remote + Build Tools VC++ 2022 + Python 3.11 + 5 prints seguidos con métricas click→papel ≤ 4s, scan QR en iOS+Android.
- Árbol de decisión de diagnóstico (BT off, peripheral no encontrado, char no escribible, MTU error).
- Instrumentación con `electron-log` time/timeEnd para `connect/discover/chunks/total`.

**Deliverables Backend:**
- `EscPosBuilder.image(pngBuffer)` con `GS v 0` raster, dithering threshold simple. Pngjs para parsear PNG → bits.
- `templates/voucher.ts` con layout: business_name + "WiFi GRATIS" + "Red: SSID" + QR raster 384px + footer + timestamp + opcional "PRUEBA".
- `render.ts` dispatch `useCase = 'voucher'` (extensible a 'diagnostic' futuro).
- `PrintQueue` SQLite-persistida con DI de drivers, `bootstrap()` re-procesa pending al startup, sin auto-retry, serialización 1-en-1.
- IPC handlers `printer.*` con validación zod (`discover`, `testConnection`, `list`, `create`, `update`, `setActive`, `delete`, `printTestVoucher`, `printDiagnosticPage`, `getJobStatus`, `retryJob`, `listRecentJobs`, `installCupsQueue`).

**Criterios de aceptación:**
- 5/5 voucher prints reales en Aomus vía RDP, escaneables en iOS+Android.
- Tiempo click→papel ≤ 4s.
- `discover()` devuelve la Aomus en ≤ 5s (BLE scan 6s configurado).
- Snapshot test del buffer ESC/POS generado por `voucher.ts` con payload conocido.
- `MockPrinterDriver` permite tests E2E en CI sin hardware.

### Fase 3 — AdminView + PIN + configuración persistente (2 días)

**Lead:** Frontend (todas las pantallas). **Apoyo:** Backend (PinCrypto, electron-store, safeStorage wrapping).

**Goal:** admin configura todo desde UI; PIN protege; configuración sobrevive a restart; wizard de cambio forzado funciona.

**Deliverables Backend:**
- `PinCrypto.hashPin/verifyPin/isAcceptablePin` con argon2id. Las 7 reglas de validación de D-018.
- `LockoutTracker` (3 fallos × 5 min, in-memory).
- `CredentialStorage` interface + `SafeStorageCredentialStorage` + `MockCredentialStorage` (auto en `NODE_ENV=test` o env var explícita) con DI en `src/main/index.ts`.
- `AppConfigStore` wrapper sobre electron-store con tipos fuertes + migrations field.
- IPC handlers `admin.*` con session token (32 bytes randomBytes, TTL 30 min, refresh por llamada).

**Deliverables Frontend:**
- `AdminView.tsx` layout 2-cols (nav 240px + contenido).
- `PinModal.tsx` con 4 inputs JetBrains Mono, lockout countdown, shake post-failure (excepción animación documentada).
- `ChangePinWizard.tsx` 3 pasos (bienvenida + nuevo PIN + confirmación). Las 7 reglas D-018 evaluadas onChange + onBlur.
- 7 paneles admin: HomePanel (dashboard salud + acciones rápidas), PrinterPanel (card actual + DiscoveryModal launcher), RouterPanel (placeholder Fase 3, contenido en Fase 4), SchedulePanel (HH/MM picker + timezone), BusinessPanel (nombre + mensaje + drag-drop logo), StatsPanel (Recharts BarChart), LogsPanel (tabla + exportación CSV).
- `DiscoveryModal.tsx` lista única vertical con badges (D-019), click en item → testConnection automático, "Imprimir prueba" inline, "Usar esta impresora" deshabilitado hasta éxito.

**Criterios de aceptación:**
- PIN bloquea tras 3 fallos × 5 min, countdown visible.
- Cambio forzado de PIN en primer login funciona; rechaza `0000` como nuevo + las otras 6 reglas D-018.
- Cambio de SSID/business name persiste tras `app.quit()` + relaunch.
- Visual review por orquestador en cada panel (tokens 5.6, sin Material patterns, accent solo en CTA primary).
- DiscoveryModal: tras seleccionar item ejecuta `testConnection()` automáticamente, habilita "Usar esta impresora" solo tras éxito.

### Fase 4 — RouterService + TPLinkArcherAdapter (2-3 días, 70% sin hardware)

**Lead:** Hardware/Red (adapter + fixtures + fallback). **Apoyo:** Frontend (RouterPanel detallado).

**Goal:** rotación automática en TP-Link Archer; modo fallback manual cuando falla.

🔴 **Bloqueador externo:** cliente NO ha comprado el TP-Link Archer C24/A6 v3. Esta fase queda al 70% (interfaz + Mock + UI + fallback manual + tests con `nock` contra fixtures sintéticos). El 30% restante (validación contra hardware real + grabación de fixtures con `nock.recorder`) se desbloquea cuando llegue.

**Deliverables Hardware/Red:**
- `IRouterAdapter` interface (firmas exactas: `ping`, `login`, `logout`, `getGuestSsid`, `setGuestPassword`, `setGuestEnabled`, `dispose`).
- `TPLinkArcherAdapter` con cliente HTTP propio (axios), detección automática de variant en login (regex sobre HTML `<title>` y `<meta>`), timeouts por step (5s reach, 10s login, 5s update), re-login automático si cookie expira, sanitización de logs (regex passwords/keys → `***REDACTED***`).
- `MockRouterAdapter` con state machine (`success | always-fail | fail-on-step`), latencia simulada, persistencia opcional in-memory.
- 5 fixtures sintéticos en `tests/fixtures/tplink/`: `archer-c24-v1.2_login-success.json`, `_login-wrong-password.json`, `_get-guest-ssid.json`, `_set-password-success.json`, `_set-password-rejected-weak.json`. Basados en docs públicas (referencias en `etapa2-hardware.md` Q11).
- Modo fallback manual: trigger tras 3 reintentos consecutivos fallidos del scheduler, guarda `passwords.applied=0, applied_method='manual_pending'`, banner persistente con la nueva password en JetBrains Mono 24px y botón "He aplicado la contraseña" → `router.markPasswordAppliedManually(pwd)` con re-input anti-typo.

**Deliverables Frontend:**
- RouterPanel completo: inputs IP/usuario/contraseña/modelo/SSID guest con validaciones, password mascarado con reveal Eye lucide en JetBrains Mono.
- Botones "Probar alcanzabilidad" (HEAD/GET sin login) y "Probar conexión" (login + read SSID).
- Indicador del último resultado: card persistente con border-left 3px (success/warning/failed) y desglose por paso.
- Banner de fallback manual con instrucciones paso-a-paso en español + "Copiar al portapapeles" + "He aplicado la contraseña".

**Criterios de aceptación:**
- Tests con `nock`: simular login OK, login wrong-password, leer SSID, cambiar password, logout — pass.
- `MockRouterAdapter` permite ejecutar Fase 5 sin hardware.
- Visual review RouterPanel.
- Modo fallback manual probado: desconectar router físicamente del MockAdapter (modo always-fail) → banner persistente aparece, copia funciona, "Ya lo cambié" lo cierra.

### Fase 5 — SchedulerService + rotación automática (1.5 días)

**Lead:** Backend.

**Goal:** rotación nocturna automática a la hora configurada; recovery on startup; backoff; commit DB solo tras HTTP OK.

**Deliverables:**
- `SchedulerService` con `node-cron` y timezone explícito.
- Recovery: si `passwords.getActive() === null || ageHours > 24`, ejecutar inmediato.
- Backoff exponencial 1m / 5m / 15m, máx 3 reintentos.
- Algoritmo atomic: trx insert `active=0` → `routerAdapter.changeGuestPassword()` → trx2 update `active=1` solo si HTTP OK + audit_log.
- Notificación visual persistente (banner inline borde 3px rojo, NO toast) si los 3 fallan.
- IPC handler `admin.rotatePasswordNow` delega aquí.
- Cleanup mensual: `DELETE FROM print_job WHERE created_at < datetime('now', '-90 days') AND status='printed'`.
- `HealthCheckService` (D-015) con su propio cron `0 3 * * *` (3 AM, post-rotación).

**Criterios de aceptación:**
- Test integration con `vi.useFakeTimers()`: 5 escenarios cubiertos (rotación normal, recovery, backoff completo fallando 3, éxito en retry 2, crash mid-rotation invariante).
- Property test: invariante "nunca hay > 1 row con `active=1`".
- Manual: cron `* * * * *` cada minuto con MockRouter, 10 ejecuciones limpias en `audit_log`.

### Fase 6 — Pulido + Empaquetado + Documentación (1.5 días)

**Lead:** QA/Empaquetado.

**Goal:** instalable `.exe` listo para deploy; auto-arranque; manuales y video.

**Deliverables:**
- Auto-arranque: `app.setLoginItemSettings({ openAtLogin: true })` activado tras onboarding (PIN ya cambiado del default).
- Icono `.ico` (256x256 multi-res) y branding final.
- `npm run dist:win` produce `WiFi Voucher Manager Setup x.y.z.exe` NSIS oneclick=false con shortcut de escritorio.
- Sin code signing (D-014). Manual de instalación incluye Apéndice C con 3 procedimientos: A (Unblock), B (SmartScreen Run anyway), C (Excluir carpeta de Windows Security). Cada uno con screenshots paso a paso en español.
- Audit final de seguridad — checklist en `etapa2-qa.md` Sección 4.4.
- `npm audit` con severidad ≥ moderate resuelto.
- Validación CSP con `scripts/verify-csp.mjs` (predist).
- `scripts/sanitize-build.mjs` (no `console.log` en `dist`).
- `scripts/verify-asar-unpack.mjs` (postdist) confirma native deps unpacked.

**Manuales en español:**
- **Mesero (1 página)**: cómo presionar el botón, qué hacer si falla.
- **Admin (5-8 páginas)**: PIN, secciones AdminView, troubleshooting básico.
- **Instalación (Okuni Solutions, 10-15 páginas)**: deploy + Apéndice C whitelist + troubleshooting + conexión BLE Aomus + setup TP-Link cuando llegue.

**Video Loom 5 min**: storyboard del mesero (abrir app, pulsar botón, cliente escanea QR).

**Criterios de aceptación:**
- Instalación limpia en Win11 nuevo (laptop dev sin deps): doble-click `.exe` → instala → primer arranque pide cambio de PIN → vista mesero → imprime QR funcional.
- Audit security: contextIsolation, sandbox, nodeIntegration false, webSecurity, no remote, safeStorage para router credenciales — todos pass.

### Fase 7 — Piloto en producción (1-2 semanas operación)

**Lead:** QA/Empaquetado. **Apoyo:** todos reactivos según incidencias.

**Goal:** 0 días sin servicio en primera semana; ≥95% impresiones exitosas; ≥95% rotaciones exitosas.

**Bloqueadores externos activos:** 🔴 cliente compra TP-Link → cierre Fase 4. 🟡 confirmación impresora producción.

**Deliverables:**
- Día 0: instalación + config + capacitación 15 min al mesero.
- Día 1-7: monitoreo intensivo vía RDP (revisar `audit_log` + `print_log` cada día).
- Día 8-14: monitoreo pasivo + standby.
- Smoke test diario D-015: 6 probes a las 03:00 con payload JSON en `audit_log` (db_integrity, disk_free, log_size, last_rotation_recent, printer_reach, router_reach). Solo registra. Si `all_passed === false`, flag `lastHealthCheckFailed = true` en electron-store → WaiterView muestra dot ámbar hasta próximo check OK.
- Política de hotfix: crítico (no abre/no imprime/no rota) → mismo día instalador parche; medio → semanal; menor → backlog v2. Cada bug → test de regresión antes del fix.

**KPIs:**
- 0 días sin servicio = audit_log no tiene 24h consecutivas sin print exitoso ni rotation exitosa.
- ≥95% impresiones = `print_log.success=1` count / total.
- ≥95% rotaciones = `audit_log.event_type='password_rotation' AND payload.success=true` count / total.

---

## 6. Estructura del repositorio

Detalle completo en `etapa2-qa.md` Sección 2.1. Resumen del árbol:

```
wifi-voucher-manager/
├── package.json              # raíz, sin pnpm workspace
├── electron-builder.yml      # separado del package.json
├── 4 tsconfigs (raíz + electron + renderer + shared)
├── vite.config.ts            # con plugin csp-swap
├── vitest.config.ts          # coverage thresholds escalonados
├── playwright.config.ts
├── eslint.config.mjs         # flat config v9
├── DECISIONS.md              # 21 decisiones
├── CLAUDE.md                 # ya existe en raíz parent
├── PLAN-TECNICO-WIFI-MANAGER_2.md
├── .context/{PROJECT,ARCHITECTURE,API_CONTRACTS,DEPENDENCIES}.md
├── .github/workflows/ci.yml  # mac/linux/win matriz
├── build/{icon.ico,icon.icns,installer/}
├── resources/{fonts/,logo-default.png}
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # composition root
│   │   ├── ipc/{waiter,admin,printer,router,stats}.ts
│   │   ├── services/         # 12 servicios (QR, Password, PinCrypto, Lockout, Printer, PrintQueue, Router, Scheduler, HealthCheck, CredentialStorage, Audit, render)
│   │   ├── adapters/{routers,printers}/  # IRouterAdapter + 4 PrinterDriver
│   │   ├── escpos/{commands,builder,index}.ts
│   │   ├── db/{connection,run-migrations,migrations,repositories,cli}/
│   │   ├── security/{csp,sanitize-logs}.ts
│   │   └── utils/timeout.ts
│   ├── preload/index.ts      # contextBridge
│   ├── renderer/             # ~40 archivos
│   │   ├── pages/{WaiterView, AdminView, admin/{Home,Printer,Router,Schedule,Business,Stats,Logs}Panel}.tsx
│   │   ├── components/       # 17 primitivos
│   │   ├── hooks/            # 6 hooks (useSystemHealth, useAdminConfig, useDiscoverPrinters, usePinLockout, useFormDirty, usePollPrintJob)
│   │   ├── store/            # 4 stores zustand
│   │   ├── styles/{tokens.ts, fonts.ts, global.css}
│   │   └── types/window.d.ts
│   └── shared/types.ts       # IpcAPI + DTOs
├── tests/{unit,integration,e2e,fixtures}/
└── scripts/{verify-csp,verify-asar-unpack,sanitize-build}.mjs
```

---

## 7. Pirámide de tests

Detalle en `etapa2-qa.md` Sección 3.

| Capa | Herramienta | Qué prueba | Coverage gate |
|---|---|---|---|
| Unit | vitest + happy-dom | Services, adapters, repositorios, EscPos builder, utils | Escalonado por carpeta y fase (D-021): QRService 85% desde Fase 1; services 80% desde Fase 2; adapters 80%; repositories 70%; renderer/components 60%; renderer/hooks 70%. `src/main/ipc/` y `src/main/index.ts` excluidos |
| Integration | vitest + sqlite `:memory:` + nock + MockRouterAdapter | DB + services + IPC handlers (excepto los thin) | Incluido en gate de carpeta correspondiente |
| Component | vitest + @testing-library/react | DOM snapshots de cada estado visual | Snapshot regression — fail si DOM cambia |
| E2E | Playwright + Electron empaquetado | 3 escenarios mínimo (mesero imprime mockeado, admin entra y persiste config, scheduler dispara con MockRouter) | No aporta a coverage |
| Visual | Playwright `toHaveScreenshot()` | PNG snapshots local pre-release Win11 | Tolerancia 1% (`maxDiffPixelRatio: 0.01`); regenera con `--update-snapshots` |

**Cross-platform CI matrix:**
- `lint-typecheck` solo Linux (rápido).
- `test` en Linux + macOS + Windows con env vars `WIFI_VOUCHER_USE_MOCK_STORAGE=1` y `WIFI_VOUCHER_SKIP_BLE=1` (noble no funciona en runners).
- `build` solo en push a main, Linux + Windows; `.exe` queda como artifact.

---

## 8. Riesgos consolidados

Compilación de los 4 specialists. Total **27 riesgos identificados**. Top 10 por probabilidad×impacto:

| ID | Riesgo | Prob | Impacto | Mitigación principal |
|---|---|---|---|---|
| **B1/H1** | `@abandonware/noble@1.9` no compila contra Electron 39 / ABI 127 | Media-Alta | Crítico | Validación bloqueante en Fase 0 (smoke-noble.ts). Plan B (Electron 30), Plan D (BT-SPP), Plan C (Web Bluetooth) en orden |
| **B4** | `GS v 0` raster rechazado por Aomus (BLE MTU bajo) | Media | Alto | Test temprano Fase 2 día 1. Plan B: comando `ESC *` column-mode |
| **H4** | TP-Link saca firmware que rompe adapter (R1 plan v1.1) | Media | Alto | Fallback manual diseñado. Detección automática de variant. Tests con fixtures multi-firmware |
| **B3** | Knex+migrations no resolvible dentro de asar | Media | Alto | `asarUnpack: ['**/migrations/**']`. Validar en Fase 0 con `npm run dist:win` |
| **F2** | CSP estricta vs Vite HMR | Alta | Medio | Doble CSP via plugin csp-swap (D-020). Defensa profundidad header HTTP en main |
| **B2** | argon2 requiere VC++ Build Tools en Win | Media | Medio | Documentar prerequisito en README. Plan B: `@node-rs/argon2` (Rust prebuilds) |
| **H2** | Aomus se desconecta espontáneamente entre prints | Media | Medio | Driver abre/cierra connection per-print (no pool). Próximo print re-conecta auto |
| **F1** | Empaquetado fonts woff2 en asar | Media | Medio | `document.fonts.check()` en smoke test Fase 1. Plan B: `asarUnpack: ['dist/assets/*.woff2']` |
| **F5** | IPC fallando silenciosamente (drift entre Backend y Frontend) | Alta | Alto | `IpcAPI` tipado en compile time. Wrapper `safeCall` con timeout 10s + banner. Catchall `ipcMain.handle('*')` para drift |
| **H8** | Aomus sin paper detection en BLE | Alta | Bajo | Limitación documentada. Usuario re-imprime desde diagnostics tras ver papel incompleto |

Lista completa de los 27 en cada documento de etapa intermedia.

---

## 9. Bloqueadores externos activos

1. 🔴 **Compra del TP-Link Archer** (C24/A6 v3) — bloquea cierre Fase 4 al 100% y Fase 7 (rotación real).
2. 🟡 **Confirmación de impresora final de producción** — Aomus disponible HOY pero podría cambiar; el sistema soporta migración via discovery.
3. 🟡 **Validación noble@1.9 vs Electron 39** — primer smoke test de Fase 0 lo determina.
4. 🟡 **Acceso RDP estable a Win11** — confirmar credenciales y conectividad antes de Fase 2.
5. 🟢 **Visual Studio Build Tools 2022 + Python 3.11 en Win11 dev** — solo si dev se hace en Win directamente; no bloqueante para flujo Mac→Win con `.exe` empaquetado.

---

## 10. Próximos pasos (post-aprobación de este spec)

1. **`writing-plans`** — invocar la skill para producir un plan de implementación ejecutable derivado de este spec, con tareas concretas, criterios de testing TDD por tarea, y review checkpoints. Output esperado: un plan ejecutable que se puede pasar a `executing-plans` o `subagent-driven-development`.

2. **`/init-context`** — después de tener el plan ejecutable, ejecutar la skill para inicializar la estructura `.context/` del proyecto con los 4 archivos definidos en Fase 0 (PROJECT.md, ARCHITECTURE.md, API_CONTRACTS.md, DEPENDENCIES.md) basados en el contenido de este spec.

3. **Ejecución Fase 0 inmediata** — tras los dos pasos anteriores, arrancar el scaffolding del repo. Validación bloqueante de noble es lo primero (Hardware Q9). Si pasa, Fase 1 puede paralelizarse Backend + Frontend.

---

## 11. Referencias a documentos detallados

Los outputs de cada agente están en `docs/superpowers/brainstorming/`. Léelos cuando necesites detalle granular más allá de este spec consolidado:

- `etapa1-arquitecto.md` — base arquitectónica, 12 decisiones originales, 24 módulos a portar de maragon_pdv con paths exactos, contratos IPC TypeScript completos.
- `etapa2-frontend.md` — sistema de tokens completo, ~40 archivos del renderer detallados, estrategia de testing visual, riesgos de UX con paleta WCAG AA.
- `etapa2-qa.md` — `package.json` completo, configs (tsconfig × 4, vite, electron-builder, eslint, prettier, vitest, playwright), CI matrix, pirámide de tests, threat model, hotfix policy, manuales storyboard.
- (Backend specialist y Hardware/Red specialist viven solo en el transcript de la conversación. Si necesitas regenerarlos como archivos, pedirlo explícitamente — el contenido fue producido pero superó el límite de tamaño de tool result en disco.)

**Plan v1.1 original**: `PLAN-TECNICO-WIFI-MANAGER_2.md` (raíz del proyecto). Sigue siendo la fuente de verdad para reglas que NO se sobrescribieron en estas decisiones (UX 5.6, threat model base, criterios de éxito del piloto).

**CLAUDE.md raíz**: resumen ejecutivo de restricciones inviolables. Mantener actualizado conforme decisiones evolucionen.
