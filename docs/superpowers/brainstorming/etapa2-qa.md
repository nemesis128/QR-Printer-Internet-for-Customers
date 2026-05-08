Tengo suficiente contexto. Ahora produzco el output completo.

# QA + Empaquetado + Seguridad — Etapa 2 (Specialist Output)

## 1. Resoluciones a las 5 cuestiones abiertas

### Q13. CSP estricta vs Vite dev — **DOS CSP (relajada en dev, estricta en prod)**

**Decisión.** Mantener dos meta-tags de CSP, distinguidos por el flag `import.meta.env.PROD` que Vite inyecta en build y que el `index.html` no puede leer directamente — por lo que la estrategia real es:

- **`index.html` en repo** lleva CSP estricta (la de producción).
- **Plugin de Vite** (`transformIndexHtml` configurado en `vite.config.ts`) **reemplaza** el meta tag por la versión relajada cuando `mode === 'development'`. El bundle prod sale tal cual.
- **El main process** además inyecta una CSP redundante por `session.defaultSession.webRequest.onHeadersReceived` para producción (defensa en profundidad — si alguien edita el HTML, el header gana).

**CSP de producción (la que va en `index.html` y en el header HTTP del main process):**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self'
```

Justificación token a token:
- `style-src 'unsafe-inline'`: Tailwind genera CSS estático, pero React injerta `style=` inline en algunos componentes (recharts en concreto). Sin esto los gráficos rompen.
- `img-src data: blob:`: el QR PNG se renderiza a `data:image/png;base64,...` para preview en WaiterView; sin `data:` no se ve.
- `connect-src 'self'`: no hay XHR a internet desde el renderer. El TPLinkArcher HTTP vive en main process — el renderer nunca hace fetch al router.
- `frame-ancestors 'none'` + `object-src 'none'`: bloquea clickjacking y plugins.

**CSP de desarrollo** (la que el plugin sustituye cuando `mode === 'development'`):

```
default-src 'self' http://localhost:5173 ws://localhost:5173;
script-src 'self' http://localhost:5173 'unsafe-inline' 'unsafe-eval';
style-src 'self' http://localhost:5173 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' http://localhost:5173 ws://localhost:5173
```

`'unsafe-eval'` es lo que Vite HMR exige (su runtime usa `Function()`). Solo dev.

**Validación post-build (Fase 6):** un script `scripts/verify-csp.mjs` que abre el `dist/index.html` empaquetado, parsea el meta tag y revienta si encuentra `unsafe-eval` o `localhost`. Corre en `predist`.

### Q14. Coverage thresholds — **Thresholds duros que rompen build, escalonados por carpeta y por fase**

**Decisión.** Vitest con `coverage.thresholds` que falla `npm run test:coverage` (y por tanto el job de CI). Pero los umbrales **no son uniformes** y **escalan por fase** para no bloquear desde Fase 0.

| Carpeta | Fase 0-1 | Fase 2-3 | Fase 4-5 | Fase 6+ |
|---|---|---|---|---|
| `src/main/services/` | desactivado | 70% | 80% | **80%** |
| `src/main/services/QRService.ts` | 85% | 85% | 85% | **85%** |
| `src/main/adapters/` | desactivado | 70% | 80% | **80%** |
| `src/main/db/repositories/` | desactivado | 60% | 70% | **70%** |
| `src/renderer/components/` | desactivado | 50% | 60% | **60%** |
| `src/renderer/hooks/` | desactivado | 60% | 70% | **70%** |

`src/main/ipc/` **se excluye** de coverage (handlers thin que delegan a servicios; cubrirlos sería duplicación). `src/main/index.ts` se excluye (bootstrap). Tests E2E no aportan a coverage (otro pipeline). El gating es solo unit/integration.

Plan v1.1 dice ≥80% services y ≥85% QRService — esto los cumple desde Fase 2 sin asfixiar Fase 0.

### Q15. `safeStorage` en mac dev — **Wrapper `CredentialStorage` con DI explícita y `MockCredentialStorage` para tests**

**Decisión.** Contrato exacto y mecanismo de inyección:

```typescript
// src/main/services/CredentialStorage.ts
export interface CredentialStorage {
  isAvailable(): boolean;
  encrypt(plaintext: string): string;   // base64 del cipherbuffer
  decrypt(ciphertext: string): string;  // throws si la llave cambió
}

export class SafeStorageCredentialStorage implements CredentialStorage { /* envuelve electron.safeStorage */ }
export class MockCredentialStorage implements CredentialStorage {
  private store = new Map<string, string>();
  isAvailable() { return true; }
  encrypt(p: string) { const id = crypto.randomBytes(8).toString('hex'); this.store.set(id, p); return `mock:${id}`; }
  decrypt(c: string) { const id = c.slice(5); const v = this.store.get(id); if (!v) throw new Error('mock key not found'); return v; }
}
```

**Inyección.** En `src/main/index.ts` durante `app.whenReady()`:

```typescript
const credentialStorage: CredentialStorage =
  process.env.NODE_ENV === 'test' || process.env.WIFI_VOUCHER_USE_MOCK_STORAGE === '1'
    ? new MockCredentialStorage()
    : new SafeStorageCredentialStorage();

const routerService = new RouterService(routerAdapter, credentialStorage, configRepo);
```

Por qué dos triggers (`NODE_ENV` + env var explícita): vitest con `environment: 'node'` setea `NODE_ENV=test` automáticamente. La env var es para el caso de Mac dev local donde el dueño quiere correr `npm run dev` sin que Keychain le abra prompt — exporta `WIFI_VOUCHER_USE_MOCK_STORAGE=1` y listo.

**Reglas duras:**
- `RouterService` recibe `CredentialStorage` por constructor — nunca llama a `safeStorage` directo.
- En tests unit/integration de `RouterService`, **siempre** se inyecta `MockCredentialStorage`.
- En tests E2E con Playwright se exporta `WIFI_VOUCHER_USE_MOCK_STORAGE=1` antes de lanzar Electron.
- El `MockCredentialStorage` **no** persiste entre runs (in-memory) — esto es correcto porque tests son herméticos.

### Q16. Manual de whitelist Win Defender (D-014) — **3 procedimientos documentados con pasos exactos**

**Decisión.** El manual de instalación incluye Apéndice "C — Habilitar instalación en Windows" con tres procedimientos, en orden de menor a mayor invasividad. El instalador del cliente debe ejecutar **al menos uno**.

**Procedimiento A — Unblock del archivo descargado** (más fácil, primer recurso):

1. Click derecho en `WiFi Voucher Manager Setup 1.0.0.exe`. *(Screenshot: menú contextual de Windows con "Properties" resaltado.)*
2. Seleccionar "Properties".
3. En la pestaña "General", al final, marcar la casilla "Unblock". *(Screenshot: pestaña General con la línea "This file came from another computer..." y la casilla Unblock subrayada en rojo.)*
4. Click "Apply" → "OK".
5. Doble-click al `.exe` para iniciar la instalación.

**Procedimiento B — SmartScreen "Run anyway"** (cuando A no es suficiente):

1. Si Windows muestra pantalla azul "Windows protected your PC", **NO** clickear "Don't run". *(Screenshot: pantalla SmartScreen completa.)*
2. Click en "More info". *(Screenshot: "More info" resaltado con flecha roja.)*
3. Aparecerá el botón "Run anyway". Click. *(Screenshot: botón nuevo visible, resaltado.)*
4. La instalación procede normalmente.

**Procedimiento C — Excluir carpeta de Windows Security** (solo si A y B fallan, requiere admin Windows):

1. Abrir "Windows Security" desde el menú Inicio. *(Screenshot: menú Inicio con Windows Security tipeado.)*
2. Click "Virus & threat protection" en el panel izquierdo. *(Screenshot.)*
3. En "Virus & threat protection settings", click "Manage settings". *(Screenshot.)*
4. Hacer scroll hasta "Exclusions". Click "Add or remove exclusions". *(Screenshot.)*
5. Aprobar el prompt UAC.
6. Click "+ Add an exclusion" → "Folder". *(Screenshot del menú desplegable.)*
7. Navegar a `C:\Users\<usuario>\AppData\Local\Programs\WiFi Voucher Manager\` y seleccionarla. *(Screenshot: diálogo de carpeta.)*
8. Confirmar. La carpeta queda excluida.
9. Reintentar instalación.

**Notas críticas que aparecen en el manual:**
- "Estos pasos son **temporales** y solo se necesitan en la primera instalación. Las actualizaciones futuras heredarán la confianza."
- "Si Windows Defender pone el `.exe` en cuarentena, restaurar desde 'Protection history' antes del Procedimiento A."
- "Nunca aplicar el procedimiento C a la carpeta de Descargas o al disco entero — solo a la carpeta de instalación específica."

Cada screenshot va capturado en Win11 22H2 en español (laptop del cliente) durante la instalación inicial de Fase 7. El manual queda en español + screenshots inline (12 imágenes total).

### Q17. Self-check de Fase 7 (D-015) — **6 probes diarios a las 03:00, payload JSON en `audit_log`, solo registra**

**Decisión final.**

**Lista exhaustiva de 6 probes** (orden = orden de ejecución):

| # | Probe | Implementación | Pass criterion | Timeout |
|---|---|---|---|---|
| 1 | `db_integrity` | `SELECT 1 FROM passwords LIMIT 1;` + `PRAGMA integrity_check;` | resultado = `'ok'` | 5s |
| 2 | `disk_free` | `fs.statfs(userDataDir)` | `bavail * bsize > 1 GiB` | 1s |
| 3 | `log_size` | `fs.stat(logFilePath)` | `size < 100 MiB` | 1s |
| 4 | `last_rotation_recent` | `SELECT MAX(created_at) FROM passwords;` | delta vs ahora `< 25h` | 1s |
| 5 | `printer_reach` | `printerService.testConnection()` con printer activo | `success === true` | 8s |
| 6 | `router_reach` | `routerService.pingRouter()` (sin login) | `reachable === true` | 5s |

Total worst-case: 21s — totalmente dentro de los 30s razonables.

**Cron:** `0 3 * * *` (timezone `America/Mexico_City`). Razón de las 03:00: la rotación es a las 23:00; le damos 4h por si hubo retries (15m + 1h + 5h = peor caso 06:15, pero 95% terminan en < 30 min). Si hubo failure de rotación, el self-check lo detecta vía probe #4.

**Payload exacto en `audit_log`:**

```json
{
  "event_type": "health_check",
  "payload": {
    "schema_version": 1,
    "ran_at": "2026-05-08T03:00:01.234Z",
    "duration_ms": 6234,
    "all_passed": false,
    "probes": [
      { "name": "db_integrity", "passed": true,  "duration_ms": 12,   "detail": null },
      { "name": "disk_free",    "passed": true,  "duration_ms": 8,    "detail": { "bytes_free": 184230498304 } },
      { "name": "log_size",     "passed": true,  "duration_ms": 3,    "detail": { "bytes": 4720128 } },
      { "name": "last_rotation_recent", "passed": true, "duration_ms": 5, "detail": { "hours_since": 4.0 } },
      { "name": "printer_reach", "passed": false, "duration_ms": 8001, "detail": { "error": "BLE peripheral not found", "errorStep": "scan" } },
      { "name": "router_reach",  "passed": true,  "duration_ms": 145,  "detail": { "latencyMs": 12 } }
    ]
  }
}
```

**Decisión "registrar vs auto-fix":** **solo registra**. Razones:

1. Auto-fix de printer no tiene sentido — si BLE no responde, no hay acción remota válida.
2. Auto-fix de router (forzar nueva rotación) podría causar duplicados o desincronización con el cliente que ya tiene un voucher impreso.
3. Auto-fix de DB (vacuum, repair) es destructivo y debe ser decisión humana.
4. El monitoreo es vía RDP por Okuni Solutions — el operador humano lee el `audit_log` y decide.

**Lo que sí se hace automáticamente:** si `all_passed === false`, además del `audit_log`, se setea un flag persistente `lastHealthCheckFailed = true` en `electron-store`. La WaiterView muestra el indicador ámbar (en lugar de verde) hasta el siguiente health-check pasado. No bloquea operación — el mesero puede seguir imprimiendo.

---

## 2. Detalle de Fase 0 — Scaffolding del repo

### 2.1 Estructura de directorios completa

```
wifi-voucher-manager/
├── package.json                  # única raíz; sin pnpm workspace
├── package-lock.json
├── tsconfig.json                 # composite con references
├── tsconfig.electron.json        # para src/main + src/preload
├── tsconfig.renderer.json        # para src/renderer
├── tsconfig.shared.json          # para src/shared (referenciado por ambos)
├── vite.config.ts
├── electron-builder.yml          # separado del package.json para legibilidad
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.mjs
├── .prettierrc.json
├── .prettierignore
├── .editorconfig
├── .nvmrc                        # "22"
├── .gitignore
├── .env.example
├── README.md
├── DECISIONS.md                  # 15 decisiones del Arquitecto + las que se acumulen
├── CLAUDE.md                     # ya existe; se hereda
├── PLAN-TECNICO-WIFI-MANAGER_2.md
│
├── .context/                     # contexto para agentes futuros
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACTS.md
│   └── DEPENDENCIES.md
│
├── .github/
│   └── workflows/
│       └── ci.yml                # lint + type-check + test (matriz mac/linux/win)
│
├── build/                        # recursos para electron-builder
│   ├── icon.ico                  # Windows (256x256 multi-res)
│   ├── icon.icns                 # macOS dev
│   ├── icon.png                  # fallback Linux dev
│   └── installer/
│       ├── header.bmp            # banner NSIS
│       └── license_es.txt        # MIT en español
│
├── resources/                    # assets empaquetados con la app
│   ├── fonts/                    # woff2 self-hosted (Inter, JetBrains Mono)
│   └── logo-default.png          # logo placeholder
│
├── src/
│   ├── main/                     # proceso principal Electron (Node)
│   │   ├── index.ts              # entry point — bootstrap + DI
│   │   ├── ipc/                  # handlers IPC (thin, validan + delegan)
│   │   │   ├── waiter.ts
│   │   │   ├── admin.ts
│   │   │   ├── printer.ts
│   │   │   ├── router.ts
│   │   │   └── stats.ts
│   │   ├── services/             # lógica de negocio
│   │   │   ├── QRService.ts
│   │   │   ├── PasswordService.ts
│   │   │   ├── PinCrypto.ts
│   │   │   ├── LockoutTracker.ts
│   │   │   ├── PrinterService.ts
│   │   │   ├── PrintQueue.ts
│   │   │   ├── RouterService.ts
│   │   │   ├── SchedulerService.ts
│   │   │   ├── HealthCheckService.ts   # D-015
│   │   │   ├── CredentialStorage.ts    # Q15
│   │   │   ├── AuditService.ts
│   │   │   └── render.ts               # composición voucher
│   │   ├── adapters/
│   │   │   ├── routers/
│   │   │   │   ├── IRouterAdapter.ts
│   │   │   │   ├── TPLinkArcherAdapter.ts
│   │   │   │   └── MockRouterAdapter.ts
│   │   │   └── printers/
│   │   │       ├── driver-types.ts
│   │   │       ├── usb-driver.ts
│   │   │       ├── bluetooth-driver.ts
│   │   │       ├── ble-driver.ts
│   │   │       ├── mock-driver.ts
│   │   │       └── detect.ts
│   │   ├── escpos/
│   │   │   ├── commands.ts
│   │   │   ├── builder.ts
│   │   │   └── index.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── run-migrations.ts
│   │   │   ├── migrations/
│   │   │   │   ├── 20260507_000000_init.ts
│   │   │   │   └── 20260507_000001_printers.ts
│   │   │   ├── repositories/
│   │   │   │   ├── PasswordRepository.ts
│   │   │   │   ├── PrinterRepository.ts
│   │   │   │   ├── ConfigRepository.ts
│   │   │   │   ├── PrintLogRepository.ts
│   │   │   │   └── AuditLogRepository.ts
│   │   │   └── cli/
│   │   │       └── migrate.ts
│   │   ├── security/
│   │   │   ├── csp.ts             # construye headers CSP
│   │   │   └── sanitize-logs.ts   # regex passwords/tokens out
│   │   └── utils/
│   │       └── timeout.ts
│   │
│   ├── preload/
│   │   └── index.ts               # contextBridge + IpcAPI tipado
│   │
│   ├── renderer/                  # React + Vite
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── WaiterView.tsx
│   │   │   └── AdminView.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/                 # Zustand
│   │   ├── styles/
│   │   │   ├── tokens.ts          # paleta UX 5.6
│   │   │   └── globals.css        # @import "@fontsource/..."
│   │   └── types/
│   │
│   └── shared/
│       └── types.ts               # IpcAPI + DTOs
│
├── tests/
│   ├── unit/                      # mirrors src/
│   ├── integration/
│   │   ├── db/
│   │   ├── ipc/
│   │   └── services/
│   ├── e2e/
│   │   ├── waiter.spec.ts
│   │   ├── admin.spec.ts
│   │   └── helpers/
│   └── fixtures/
│       ├── tplink/                # HTTP fixtures (Hardware specialist)
│       ├── ble/                   # byte traces Aomus (opcional)
│       ├── escpos/                # snapshots
│       └── seed/                  # JSON seeds
│
├── scripts/
│   ├── verify-csp.mjs             # post-build CSP sanity check
│   ├── verify-asar-unpack.mjs     # confirma native deps unpacked
│   ├── sanitize-build.mjs         # check no console.log en dist
│   └── generate-icons.sh
│
└── dist/                          # output vite (renderer)
    dist-electron/                 # output tsc (main + preload)
    dist-installer/                # output electron-builder (.exe, .dmg)
    coverage/                      # vitest coverage html
```

### 2.2 `package.json` final

```jsonc
{
  "name": "wifi-voucher-manager",
  "version": "1.0.0",
  "private": true,
  "description": "Sistema de generación e impresión de QR para WiFi de clientes - Okuni Solutions",
  "author": "Okuni Solutions",
  "license": "UNLICENSED",
  "type": "module",
  "main": "dist-electron/main/index.js",
  "engines": {
    "node": ">=22.20.0 <23",
    "npm": ">=10"
  },
  "scripts": {
    "predev": "electron-rebuild -f -w better-sqlite3,@abandonware/noble,@thiagoelg/node-printer,serialport,argon2 && npm run build:preload",
    "build:preload": "esbuild src/preload/index.ts --bundle --platform=node --external:electron --format=cjs --outfile=dist-electron/preload/index.js",
    "dev": "concurrently -k -n vite,electron -c blue,green \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron": "wait-on http://localhost:5173 && cross-env NODE_ENV=development NODE_OPTIONS=\"--import tsx/esm\" electron src/main/index.ts",
    "build": "npm run build:renderer && npm run build:electron && npm run build:preload",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint . --max-warnings=0",
    "type-check": "tsc -p tsconfig.electron.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
    "format": "prettier --write .",
    "db:migrate": "tsx src/main/db/cli/migrate.ts",
    "predist": "electron-rebuild -f -w better-sqlite3,@abandonware/noble,@thiagoelg/node-printer,serialport,argon2 && npm run build && node scripts/verify-csp.mjs && node scripts/sanitize-build.mjs",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win nsis",
    "dist:mac": "electron-builder --mac dmg",
    "postdist": "node scripts/verify-asar-unpack.mjs"
  },
  "dependencies": {
    "@abandonware/noble": "^1.9.2-25",
    "@thiagoelg/node-printer": "^0.6.2",
    "argon2": "^0.44.0",
    "axios": "^1.7.7",
    "better-sqlite3": "^11.5.0",
    "electron-log": "^5.2.0",
    "electron-store": "^10.0.0",
    "knex": "^3.1.0",
    "lucide-react": "^0.460.0",
    "node-cron": "^3.0.3",
    "node-thermal-printer": "^4.6.0",
    "qrcode": "^1.5.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.13.0",
    "serialport": "^13.0.0",
    "zod": "^3.23.8",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@eslint/js": "^9.0.0",
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "@playwright/test": "^1.48.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitest/coverage-v8": "^2.1.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^9.0.0",
    "cross-env": "^7.0.3",
    "electron": "^39.0.0",
    "electron-builder": "^25.1.0",
    "esbuild": "^0.24.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "happy-dom": "^15.0.0",
    "nock": "^13.5.0",
    "postcss": "^8.4.0",
    "prettier": "^3.3.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.16.0",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "wait-on": "^7.2.0"
  }
}
```

**Notas:**
- `bcrypt` y `usb` quedan **fuera** (D-001 y D-003).
- `argon2` reemplaza bcrypt; nativo, requiere rebuild.
- `zod` agregado para validación IPC en main (regla del Arquitecto).
- `happy-dom` en lugar de `jsdom` — más rápido, suficiente para tests de React de esta app.
- `concurrently` y `wait-on` heredados de maragon para `dev`.
- `bonjour-service`, `socket.io`, `express`, `nodemailer` **no aparecen** — son POS-only (línea explícita del Arquitecto).

### 2.3 Configs TypeScript

**`tsconfig.json` (raíz, composite):**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "declaration": false,
    "sourceMap": true
  },
  "exclude": ["**/node_modules", "**/dist", "**/dist-electron", "**/build"],
  "include": [],
  "references": [
    { "path": "./tsconfig.electron.json" },
    { "path": "./tsconfig.renderer.json" },
    { "path": "./tsconfig.shared.json" }
  ]
}
```

**`tsconfig.electron.json`:**

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "target": "ES2022",
    "outDir": "./dist-electron",
    "rootDir": "./src",
    "noEmit": false,
    "types": ["node"],
    "composite": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

**`tsconfig.renderer.json`:**

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "rootDir": "./src",
    "noEmit": true,
    "types": ["vite/client"],
    "composite": true,
    "paths": {
      "@/*": ["./src/renderer/*"],
      "@shared/*": ["./src/shared/*"]
    }
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

**`tsconfig.shared.json`** (las cosas que ambos usan, sin DOM):

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src/shared",
    "outDir": "./dist-electron/shared",
    "noEmit": false,
    "composite": true,
    "lib": ["ES2022"]
  },
  "include": ["src/shared/**/*"]
}
```

### 2.4 `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const PROD_CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
const DEV_CSP = `default-src 'self' http://localhost:5173 ws://localhost:5173; script-src 'self' http://localhost:5173 'unsafe-inline' 'unsafe-eval'; style-src 'self' http://localhost:5173 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:5173 ws://localhost:5173`;

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'csp-swap',
      transformIndexHtml(html) {
        const csp = mode === 'development' ? DEV_CSP : PROD_CSP;
        return html.replace(/__CSP__/, csp);
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { input: path.resolve(__dirname, 'index.html') },
  },
  optimizeDeps: { exclude: ['electron'] },
}));
```

`index.html` (raíz) lleva `<meta http-equiv="Content-Security-Policy" content="__CSP__">` que el plugin reemplaza.

### 2.5 `electron-builder.yml`

```yaml
appId: com.okuni.wifi-voucher-manager
productName: WiFi Voucher Manager
copyright: Copyright © 2026 Okuni Solutions

directories:
  output: dist-installer
  buildResources: build

files:
  - dist-electron/**/*
  - dist/**/*
  - resources/**/*
  - package.json
  - "!**/*.test.*"
  - "!**/*.test.d.ts"
  - "!**/__mocks__/**"
  - "!tests/**"

asarUnpack:
  - "**/node_modules/better-sqlite3/**"
  - "**/node_modules/@abandonware/noble/**"
  - "**/node_modules/@thiagoelg/node-printer/**"
  - "**/node_modules/serialport/**"
  - "**/node_modules/argon2/**"

extraResources:
  - from: resources/fonts
    to: fonts

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
  executableName: WiFiVoucherManager
  artifactName: "${productName} Setup ${version}.${ext}"
  publisherName: Okuni Solutions
  # Sin code signing en v1 (D-014).

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: WiFi Voucher Manager
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerHeader: build/installer/header.bmp
  license: build/installer/license_es.txt
  language: "3082" # Spanish
  runAfterFinish: true

mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  icon: build/icon.icns
  category: public.app-category.business
  darkModeSupport: false
```

Razones de divergencia con maragon: `oneClick: false` para que el cliente vea el wizard y elija carpeta. `runAfterFinish: true` para que la primera vez se vea la app sin que tengan que buscarla en el menú. `language: "3082"` → instalador NSIS en español.

### 2.6 ESLint flat config

```javascript
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/dist-installer/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      'src/preload/index.js',
      'scripts/**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.electron.json', './tsconfig.renderer.json', './tsconfig.shared.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { react, 'react-hooks': reactHooks, import: importPlugin },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],  // electron-log, no console.log en prod
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' }
      }],
    },
    settings: { react: { version: 'detect' } },
  },
  {
    // Tests pueden usar console.log, any, etc.
    files: ['tests/**/*', '**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier
);
```

### 2.7 Prettier y EditorConfig

**`.prettierrc.json`** (heredado de maragon):
```json
{ "semi": true, "singleQuote": true, "trailingComma": "es5", "tabWidth": 2, "printWidth": 100, "arrowParens": "always", "endOfLine": "lf" }
```

**`.editorconfig`** (heredado de maragon):
```
root = true
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
[*.md]
trim_trailing_whitespace = false
```

**`.prettierignore`**: `dist`, `dist-electron`, `dist-installer`, `coverage`, `build`, `*.lock`, `package-lock.json`.

**`.nvmrc`**: `22`.

### 2.8 GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck:
    name: Lint + Type-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22.20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    name: Test (${{ matrix.os }})
    needs: lint-typecheck
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    env:
      WIFI_VOUCHER_USE_MOCK_STORAGE: '1'
      WIFI_VOUCHER_SKIP_BLE: '1'   # noble no funciona en runners
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22.20', cache: 'npm' }
      - name: Install Linux deps
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y libcups2-dev libudev-dev
      - run: npm ci
      - name: Rebuild native modules
        run: npm rebuild better-sqlite3 argon2
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        if: matrix.os == 'ubuntu-latest'
        with: { name: coverage, path: coverage/ }

  build:
    name: Build (${{ matrix.os }})
    needs: test
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22.20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - name: Build installer (Windows only)
        if: runner.os == 'Windows'
        run: npm run dist:win
      - uses: actions/upload-artifact@v4
        if: runner.os == 'Windows'
        with: { name: installer-win, path: dist-installer/*.exe, retention-days: 14 }
```

Notas:
- `lint-typecheck` corre solo en Linux (más rápido) → si pasa, lanza `test` en matriz.
- `test` corre en las 3 OS porque hay tests cross-platform (CUPS, wmic, mocks).
- `build` solo en push a main; el `.exe` queda como artifact para el cliente.
- `WIFI_VOUCHER_SKIP_BLE=1` y `WIFI_VOUCHER_USE_MOCK_STORAGE=1` evitan que tests intenten BLE real / Keychain prompt en CI.

### 2.9 Patrón de seguridad de BrowserWindow

```typescript
// src/main/index.ts (snippet de createWindow)
const win = new BrowserWindow({
  width: 1366,
  height: 768,
  minWidth: 1024,
  minHeight: 720,
  show: false,                 // se muestra tras 'ready-to-show' (sin flash blanco)
  autoHideMenuBar: true,
  backgroundColor: '#FAFAFA',  // matches paleta UX 5.6
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,        // OBLIGATORIO
    nodeIntegration: false,        // OBLIGATORIO
    sandbox: true,                 // OBLIGATORIO
    webSecurity: true,             // OBLIGATORIO
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    // enableRemoteModule está deprecated en Electron 39 — no se setea (false implícito).
    spellcheck: false,
  },
});

// Bloquea apertura de ventanas externas
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

// Bloquea navegación a URLs externas
win.webContents.on('will-navigate', (e, url) => {
  if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) e.preventDefault();
});

// DevTools solo en dev
if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });

// CSP defensa-en-profundidad: header HTTP además del meta tag.
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
```

### 2.10 `.context/` initial files

**`PROJECT.md`** (≈40 líneas):

```markdown
# WiFi Voucher Manager — proyecto

## Qué es esto, en una frase
App Electron de escritorio para Windows que vive en la laptop POS de un restaurante mexicano y resuelve dos problemas: (1) imprime QR de WiFi escaneable en la impresora térmica con un click del mesero, (2) rota la contraseña del SSID guest del router secundario cada noche.

## Para quién
- Cliente final: restaurante/taquería con 5 mesas. Usuario operativo = mesero. Usuario admin = dueño/encargado.
- Owner técnico: Okuni Solutions. Soporte: 30 días post-go-live.

## Estado del proyecto
Greenfield, mayo 2026. Plan v1.1 firme. Stack heredado parcialmente de `maragon_pdv` (otro proyecto Okuni — ver lista en DECISIONS.md). Repo independiente — NO es monorepo.

## Vistas principales
- WaiterView: pantalla única, sin login, un botón. Lo que el mesero ve siempre.
- AdminView: oculta detrás de icono de engrane. PIN argon2id, 4 dígitos, bloqueo tras 3 fallos. PIN inicial '0000' (cambio forzado en primer login).

## Hardware esperado
- Impresora: Aomus My A1 (BLE) en producción inicial. Soporta también EPSON TM-T20 (USB) y cualquier ESC/POS-compatible vía discovery.
- Router secundario: TP-Link Archer C24 o A6 v3 (cliente lo compra en Fase 4).
- Laptop: Win11 22H2 mínimo, 8GB RAM, x64.

## Cómo arrancar (post Fase 0)
- `npm install` (Windows requiere Build Tools VC++ para native deps)
- `npm run dev`
Para reset DB: borrar `%APPDATA%/wifi-voucher-manager/data.db`.

## Bloqueadores externos activos
- Fase 4 (router) bloqueada hasta que cliente compre TP-Link.
- Fase 7 (piloto) bloqueada hasta Fase 4 + impresora confirmada.

## Documentos a leer en orden
1. CLAUDE.md (raíz)
2. PLAN-TECNICO-WIFI-MANAGER_2.md (raíz)
3. DECISIONS.md (raíz)
4. .context/ARCHITECTURE.md (este folder)
```

**`ARCHITECTURE.md`** (≈80 líneas):

```markdown
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

Drivers de impresora son tres concretos: `UsbDriver`, `BluetoothDriver` (SerialPort), `BleDriver` (noble). Despachados por `printer.connection`.

## Persistencia: tres lugares

| Dónde | Qué | Cómo |
|---|---|---|
| SQLite (`%APPDATA%/wifi-voucher-manager/data.db`) | passwords, print_log, audit_log, printer, print_job | knex + better-sqlite3, migraciones .ts |
| electron-store (`config.json` mismo dir) | AppConfig general (SSID, cron, business name, pinHash) | sync, plain JSON |
| safeStorage (DPAPI Win / Keychain Mac) | router password (cifrada) | wrapper `CredentialStorage` para mockear en tests |

## Scheduler con recovery

`SchedulerService` usa `node-cron` con timezone explícito. Al startup verifica `last_rotation > 24h` y dispara catch-up. Backoff exponencial 1m/5m/15m, 3 intentos. Falla persistente → banner inline en UI (NO toast).

## Threat model resumido

Ver sección 6 de etapa2-qa-empaquetado-seguridad.md (este especialista).

## Sistema de tests

- Unit (vitest): services + adapters + escpos builder.
- Integration (vitest + better-sqlite3 in-memory + nock + MockRouterAdapter): flujos main process.
- E2E (Playwright + Electron headless): 3+ escenarios.
- Coverage gates: ver vitest.config.ts.

## Estilo de código y UX

- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- Sin `any`. Sin `console.log` en prod (electron-log).
- Tokens UX 5.6 en `src/renderer/styles/tokens.ts` consumidos por tailwind.config.
```

**`API_CONTRACTS.md`** (≈30 líneas): copia textual del `IpcAPI` del Arquitecto Sección E + reglas IPC + ejemplo de cómo el renderer lo usa (`window.api.waiter.printVoucher()`).

**`DEPENDENCIES.md`** (≈40 líneas): tabla de las dependencias críticas con versión, propósito, alternativas rechazadas, y nota de "rebuild requerido" para nativas.

---

## 3. Pirámide de tests cross-platform

### 3.1 `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist*'],
    workspace: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/unit/main/**/*.test.ts', 'tests/integration/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['tests/unit/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup-renderer.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/main/ipc/**',
        'src/preload/**',
        'src/renderer/main.tsx',
        'src/renderer/App.tsx',
        'src/shared/types.ts',
        '**/*.d.ts',
        '**/__mocks__/**',
      ],
      thresholds: {
        // Globales bajos; los específicos son más altos.
        lines: 60, functions: 60, branches: 50, statements: 60,
        'src/main/services/**': { lines: 80, functions: 80, branches: 70, statements: 80 },
        'src/main/services/QRService.ts': { lines: 85, functions: 90, branches: 80, statements: 85 },
        'src/main/adapters/**': { lines: 80, functions: 80, branches: 70, statements: 80 },
        'src/main/db/repositories/**': { lines: 70, functions: 70, branches: 60, statements: 70 },
        'src/renderer/components/**': { lines: 60, functions: 60, branches: 50, statements: 60 },
        'src/renderer/hooks/**': { lines: 70, functions: 70, branches: 60, statements: 70 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

`tests/setup.ts` carga `dotenv` test-only y silencia `electron-log`. `tests/setup-renderer.ts` importa `@testing-library/jest-dom/vitest`.

### 3.2 Strategy por capa

**Unit (services, adapters, utils):**

| Qué se testea | Qué se mockea |
|---|---|
| `QRService.formatPayload()` | nada — función pura |
| `QRService.toPng()` | nada — `qrcode` real, snapshot del PNG |
| `PasswordService.generate()` | `crypto.randomInt` parcialmente para distribución |
| `PinCrypto.hash`/`verify` | argon2 real (cost reducido en tests) |
| `LockoutTracker` | `Date.now` con vi.useFakeTimers |
| `EscPosBuilder` | nada — bytes deterministas + snapshot |
| `MockRouterAdapter` | propio mock con secuencias deterministas |
| `SchedulerService` | `node-cron` mockeado + clock mock |
| `HealthCheckService` | inyecta probes mock individuales |
| Drivers BLE/USB/BT reales | tests `.skip` con `// TODO requiere hardware` |

**Integration:**

- Stack: `better-sqlite3` con `:memory:` + knex + migraciones reales + repositorios reales + servicios reales + IPC handlers.
- `nock` para TPLinkArcherAdapter (lee fixtures de `tests/fixtures/tplink/`).
- `MockPrinterDriver` para PrintQueue/PrinterService.
- Escenarios obligatorios: rotación end-to-end (gen password → mock router → commit DB → audit_log), recovery on startup (last rotation > 24h dispara catchup).

**Component (renderer):**

- `@testing-library/react` + `happy-dom` + `@testing-library/jest-dom`.
- Mock global de `window.api` en `setup-renderer.ts` con un fake configurable por test.
- Snapshots solo de DOM mínimo (no de pixels). Los visual tests reales son E2E con Playwright.

**E2E (Playwright + Electron):**

- `@playwright/test` con `electron` runner.
- App lanzada con `WIFI_VOUCHER_USE_MOCK_STORAGE=1 WIFI_VOUCHER_SKIP_BLE=1 WIFI_VOUCHER_USE_MOCK_ROUTER=1`.
- DB temporal por test (`--dir` con `os.tmpdir()`).
- Headless en CI mediante `xvfb-run` en Linux. En Windows runner, headed por defecto (Playwright Electron lo soporta).

3 escenarios mínimos del plan v1.1:
1. WaiterView → click botón → preview QR aparece (con MockPrinterDriver).
2. AdminView → PIN '0000' → wizard cambia PIN → rotate password manual → DB tiene nueva.
3. Scheduler con cron `* * * * *` → 2 rotaciones consecutivas pasan → audit_log tiene 2 entries.

### 3.3 Fixtures

```
tests/fixtures/
├── tplink/
│   ├── archer-c24/
│   │   ├── login-success.json     # { token: '...', cookies: [...] }
│   │   ├── login-failure.json
│   │   ├── read-guest-ssid.json
│   │   ├── change-password-success.json
│   │   └── logout.json
│   └── archer-a6-v3/             # idem cuando se valide modelo
├── ble/
│   └── aomus-my-a1-receipt-trace.bin   # snapshot de bytes ESC/POS enviados
├── escpos/
│   └── voucher-50char-200x200qr.snap   # buffer esperado para snapshot test
└── seed/
    ├── empty-db.sql
    ├── one-printer.sql
    └── 30-days-prints.sql
```

Hardware specialist provee los fixtures TP-Link en su entrega. Backend specialist consume los de printers/escpos.

### 3.4 Cross-platform CI matrix

| Test | Linux | macOS | Windows |
|---|---|---|---|
| Unit (puros, sin hardware) | ✓ | ✓ | ✓ |
| Integration DB + services | ✓ | ✓ | ✓ |
| Discovery CUPS (`lpstat`) | ✓ (cups instalado en setup-step) | ✓ | skip |
| Discovery `wmic printer` | skip | skip | ✓ |
| Discovery `SerialPort.list()` | skip (no devices virtuales) | skip | skip — solo manual |
| Discovery `noble` BLE | **skip** (no BT en runners) | **skip** | **skip** — `WIFI_VOUCHER_SKIP_BLE=1` |
| Drivers UsbDriver real | skip | skip | manual (RDP) |
| TPLinkArcherAdapter (con nock) | ✓ | ✓ | ✓ |
| safeStorage real | skip — usa Mock | skip — usa Mock | skip — usa Mock |
| E2E Playwright Electron | ✓ via xvfb | ✓ | ✓ |

Tests que requieren hardware se marcan con `it.skipIf(!process.env.WIFI_VOUCHER_HARDWARE_BLE)` para que el dueño los corra manualmente vía RDP cuando proceda.

---

## 4. Detalle de Fase 6 — Empaquetado y seguridad final

### 4.1 Pipeline de build Win

Secuencia exacta cuando se ejecuta `npm run dist:win`:

1. **`predist`:**
   - `electron-rebuild -f -w better-sqlite3,@abandonware/noble,@thiagoelg/node-printer,serialport,argon2` — recompila contra ABI de Electron 39.
   - `npm run build:renderer` → vite genera `dist/index.html` + assets.
   - `npm run build:electron` → tsc compila main + shared a `dist-electron/`.
   - `npm run build:preload` → esbuild bundle preload a `dist-electron/preload/index.js` (CJS).
   - `node scripts/verify-csp.mjs` — abre `dist/index.html`, parsea meta CSP, falla si encuentra `unsafe-eval`, `localhost`, o `*`.
   - `node scripts/sanitize-build.mjs` — grep recursivo en `dist-electron/**/*.js` por `console.log(`; falla si encuentra ≥1 ocurrencia (excepción: `console.warn`/`console.error` permitidos).
2. **`dist:win`:**
   - `electron-builder --win nsis` — empaqueta `.exe`. Output: `dist-installer/WiFi Voucher Manager Setup 1.0.0.exe`.
3. **`postdist`:**
   - `node scripts/verify-asar-unpack.mjs` — verifica que `dist-installer/win-unpacked/resources/app.asar.unpacked/node_modules/` contiene `better-sqlite3`, `@abandonware/noble`, `argon2`, `serialport`, `@thiagoelg/node-printer`. Falla si falta cualquiera.

### 4.2 Auto-arranque Win

Implementación en `src/main/services/AutoStartService.ts`, llamado desde `src/main/index.ts` después del wizard de cambio de PIN inicial (no antes, para no autoarrancar una app aún no configurada):

```typescript
// llamado tras pinIsDefault === false (PIN cambiado del default)
import { app } from 'electron';

class AutoStartService {
  enable() {
    if (process.platform !== 'win32') return;
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,    // queremos que el mesero la vea al boot
      path: app.getPath('exe'),
      args: ['--auto-start'],
    });
  }
  disable() {
    if (process.platform !== 'win32') return;
    app.setLoginItemSettings({ openAtLogin: false });
  }
  isEnabled() {
    return app.getLoginItemSettings().openAtLogin;
  }
}
```

Toggle en AdminView → Negocio → "Iniciar al encender la computadora" (default ON).

### 4.3 CSP estricta validada

Meta tag final en `dist/index.html` (post-build):

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'">
```

`scripts/verify-csp.mjs` lo valida con un parser de JSDOM-like simple (regex sobre el meta tag).

### 4.4 Audit de seguridad final — checklist

Cada item se chequea manualmente o automáticamente antes de release:

- [ ] `contextIsolation: true` en BrowserWindow (grep `contextIsolation: true` en `src/main/index.ts`).
- [ ] `sandbox: true` (idem grep).
- [ ] `nodeIntegration: false` (idem grep).
- [ ] `webSecurity: true` (idem grep).
- [ ] `enableRemoteModule` no aparece en código (deprecated, false implícito).
- [ ] `safeStorage` cifra `passwordEncrypted` del router (revisión manual de `RouterService`).
- [ ] `argon2` se usa en `PinCrypto`; `bcrypt` no aparece en `package.json` ni en código.
- [ ] `npm audit --omit=dev` sale `0 vulnerabilities` con severity ≥ moderate. Si no, justificar excepción en DECISIONS.md.
- [ ] `scripts/sanitize-build.mjs` pasa (no `console.log` en `dist-electron/`).
- [ ] `electron-log` configurado con regex sanitizer:
  ```typescript
  log.hooks.push((message) => {
    message.data = message.data.map(d => typeof d === 'string'
      ? d.replace(/("password"\s*:\s*")[^"]+(")/g, '$1***$2')
           .replace(/(token=)[^&\s]+/g, '$1***')
      : d);
    return message;
  });
  ```
- [ ] CSP estricta verificada con `verify-csp.mjs` (sin `unsafe-eval`, sin `localhost`).
- [ ] DevTools cerrados en build packaged: revisar que `app.isPackaged` gatekeeper la apertura.
- [ ] Protocol handler `file://` no permite navegación arbitraria — el `will-navigate` listener bloquea fuera de localhost+file.
- [ ] Validación zod en TODOS los handlers IPC (revisión manual, lista en `src/main/ipc/`).
- [ ] Handlers IPC no devuelven stack traces — solo mensajes legibles vía `errorMessage`.

### 4.5 Manuales

#### 4.5.1 Manual del mesero (1 página)

Sección única, una sola página A4, español, fuente legible (Inter 12pt cuerpo, 16pt títulos).

Contenido:
- Título: "Cómo entregar el WiFi a un cliente" + logo Okuni.
- Foto 1: pantalla de la app con el botón "Imprimir QR" (75% de la página).
- 3 pasos numerados:
  1. Presiona el botón **Imprimir QR**.
  2. Espera 4 segundos a que salga el papel.
  3. Entrega el papel al cliente.
- Sección "Si algo no funciona": "Si la luz inferior está roja o ámbar, avisa al encargado. NO presiones el botón repetidamente."
- Footer: "Soporte: WhatsApp +52 XXX XXX XXXX (Okuni Solutions)".

PDF generado vía pandoc desde un markdown simple. Imágenes capturadas durante Fase 6 con app real funcionando.

#### 4.5.2 Manual del admin (5-8 páginas)

Tabla de contenidos:

1. **Introducción** (1 párrafo) — qué es el sistema, dos vistas.
2. **Acceso a la configuración** — engrane esquina inferior derecha, PIN inicial 0000, cambio forzado.
3. **Sección Inicio** — qué significa cada indicador (verde/ámbar/rojo).
4. **Sección Impresora** — probar conexión, cambiar impresora vía discovery, screenshots del modal.
5. **Sección Router** — datos del TP-Link, prueba de conexión, qué hacer si falla (modo manual con la nueva password).
6. **Sección Programación** — cambiar hora de rotación, recomendación 23:00.
7. **Sección Negocio** — nombre del restaurante, mensaje del ticket, logo opcional.
8. **Sección Estadísticas** — leer la gráfica.
9. **Sección Logs** — exportar CSV cuando se pide soporte.
10. **Bloqueo de PIN** — qué hacer si bloqueas (esperar 5 min, NO reiniciar).
11. **Apéndice — qué hacer si el WiFi no funciona** (5 pasos de troubleshooting básico antes de llamar a soporte).

#### 4.5.3 Manual de instalación / troubleshooting (Okuni Solutions)

Tabla de contenidos:

1. **Pre-requisitos** — Win10 22H2 o Win11, 8GB RAM, USB libre o BT habilitado.
2. **Instalación de la impresora** — driver del fabricante (BLE: pareo en Windows; USB: instalar driver fabricante o usar genérico ESC/POS).
3. **Instalación del router** — conectar al módem Telmex en cascada, configurar SSID guest, anotar IP/admin/password.
4. **Instalación de la app** — descargar `.exe` → **Apéndice C** (whitelist Win Defender, ver Q16) → ejecutar wizard.
5. **Primer arranque** — cambio forzado de PIN, configuración de SSID, prueba de impresora, prueba de router.
6. **Auto-arranque** — verificar que la app aparece al boot.
7. **Backup de DB** — ubicación `%APPDATA%/wifi-voucher-manager/data.db`, copiar manualmente cada 30 días.
8. **Troubleshooting**:
   - "App no abre" → revisar Event Viewer Windows.
   - "Impresora no responde" → discovery → re-pareo BLE.
   - "Router no responde" → ping manual desde cmd.
   - "Rotación falla" → ver `audit_log` exportado.
9. **Apéndice A — Estructura de archivos** del install dir.
10. **Apéndice B — Logs** — ubicación, formato, cómo enviarlos.
11. **Apéndice C — Whitelist Win Defender** (Q16, los 3 procedimientos exactos).
12. **Apéndice D — Acceso por RDP** para Okuni Solutions.

#### 4.5.4 Video Loom 5 min — storyboard

| Tiempo | Escena | Voice-over (es-MX) |
|---|---|---|
| 0:00-0:20 | Logo Okuni + título | "WiFi Voucher Manager — guía rápida del mesero, en cinco minutos." |
| 0:20-0:50 | Pantalla mesero (cámara fija) | "Esta es la única pantalla que vas a usar. Ves un botón grande, eso es todo." |
| 0:50-1:30 | Click al botón + papel sale | "Cuando un cliente te pida WiFi, presionas una vez. En cuatro segundos sale el papel con el código." |
| 1:30-2:20 | Cliente escanea QR con celular real | "El cliente abre la cámara, apunta al código, y se conecta solo. No hay que escribir contraseñas." |
| 2:20-3:10 | Indicador de estado verde/ámbar/rojo | "Debajo del botón hay una luz. Verde está todo bien. Ámbar hay un aviso, llamas al encargado. Rojo no funciona, llamas a Okuni." |
| 3:10-4:00 | Engrane → modal de PIN (sin entrar) | "Aquí en la esquina hay un engrane. Eso es solo para el dueño. No lo toques." |
| 4:00-4:40 | Caso de error: impresora desconectada | "Si la luz está ámbar y aún así presionas, te aparece un mensaje fijo. No le sigas presionando, espera o llama." |
| 4:40-5:00 | Cierre + contacto | "Eso es todo. Soporte WhatsApp + número. Gracias." |

Grabación con Loom o ScreenStudio, voz over de Okuni Solutions, sin música.

---

## 5. Detalle de Fase 7 — Piloto y monitoreo

### 5.1 Plan de despliegue

**Día 0 — Instalación + capacitación (4h presencial):**

- 09:00 Llegada a restaurante.
- 09:00-10:00 Verificar conexión Telmex, instalar router secundario en cascada, configurar SSID guest (`Restaurante-Clientes`), anotar credenciales.
- 10:00-10:30 Conectar impresora Aomus por BLE (pareo Win11).
- 10:30-11:30 Instalar `.exe` (con Apéndice C whitelist), primer arranque, cambio de PIN, config inicial (nombre, mensaje, hora de rotación 23:00).
- 11:30-12:30 Pruebas: 5 impresiones consecutivas, escaneo con iOS y Android del dueño, prueba manual de rotación.
- 12:30-13:00 Capacitación al mesero (15 min: ver el botón, presionar, entregar; qué significa cada luz; cuándo llamar). Entregar manual del mesero impreso.
- 13:00 Salida. RDP habilitado y verificado.

**Día 1-7 — Monitoreo intensivo vía RDP (15-30 min/día):**

Lo que se revisa cada día (checklist en `audit_log` exportado):
- ¿Hubo `health_check` a las 03:00? ¿`all_passed: true`?
- ¿Cuántas impresiones (`event_type='print'`)? ¿Tasa de éxito?
- ¿Hubo rotación a las 23:00? ¿`payload.success: true`? ¿Cuántos retries?
- ¿Tamaño del log file? (alerta si > 50 MB en 7 días).
- ¿Espacio en disco?

Día 1 y 2 también revisión a las 23:30 (en vivo, ver rotación de la noche).

**Día 8-14 — Monitoreo pasivo:**

Solo revisar si el mesero o el dueño llaman, y un check cada 3 días del `audit_log`.

### 5.2 Smoke test diario (D-015 — Q17 resuelto)

Ya cubierto en Q17 (sección 1). Resumen:
- 6 probes (DB integrity, disk free, log size, last rotation < 25h, printer reach, router reach).
- Cron `0 3 * * *` America/Mexico_City.
- Payload JSON estructurado en `audit_log`.
- Solo registra, no auto-fix.
- Si algún probe falla, indicador WaiterView pasa a ámbar persistente hasta el próximo health-check exitoso.

### 5.3 Métricas de éxito (KPIs) — cómo se calculan

**KPI 1: 0 días sin servicio en 7 días.**
Definición operativa: "no hay 24h consecutivas sin al menos 1 print exitoso O 1 rotation exitosa". Query:
```sql
WITH eventos AS (
  SELECT printed_at AS ts FROM print_log WHERE success=1
  UNION ALL
  SELECT created_at FROM audit_log
    WHERE event_type='password_rotation'
    AND json_extract(payload,'$.success')=1
)
SELECT COUNT(*) AS gaps FROM (
  SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM eventos
) WHERE (julianday(ts) - julianday(prev)) > 1.0;
```
Pasa si `gaps == 0` durante los 7 días.

**KPI 2: ≥ 95% impresiones exitosas.**
```sql
SELECT
  100.0 * SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) / COUNT(*) AS success_rate
FROM print_log
WHERE printed_at >= datetime('now','-7 days');
```
Pasa si `success_rate >= 95.0`.

**KPI 3: ≥ 95% rotaciones exitosas.**
```sql
SELECT
  100.0 * SUM(CASE WHEN json_extract(payload,'$.success')=1 THEN 1 ELSE 0 END) / COUNT(*) AS rotation_rate
FROM audit_log
WHERE event_type='password_rotation'
  AND created_at >= datetime('now','-7 days');
```
Pasa si `rotation_rate >= 95.0` y `COUNT(*) >= 7` (debe haber al menos 7 rotaciones programadas en 7 días).

Script `scripts/kpi-report.mjs` ejecuta los tres queries vía RDP y produce un reporte semanal.

### 5.4 Plan de hotfix

| Severidad | Ejemplos | SLA fix | SLA deploy | Test obligatorio |
|---|---|---|---|---|
| **Crítico** | App no abre; no imprime; scheduler no rota; pierde DB | Mismo día | Mismo día (instalador parche enviado por email/WhatsApp) | Test de regresión escrito ANTES del fix; merge bloquea sin él |
| **Medio** | UI glitch; log spam; discovery lento | Misma semana | Junto con el siguiente release rolling | Test agregado al fix |
| **Menor** | Estética; copy; alineación | Backlog v2 | Sin urgencia | Opcional |

Política de hotfix:
1. Repro local con MockRouterAdapter / MockPrinterDriver.
2. Test de regresión escrito que falla con el bug.
3. Fix mínimo + test pasa.
4. Code review (orquestador).
5. Build con bump de patch (`1.0.0 → 1.0.1`).
6. Cliente recibe `.exe` con cambelog corto en español.
7. Instalación remota vía RDP (mismo wizard, mantiene config).

---

## 6. Threat model actualizado

| # | Amenaza | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| T1 | Atacante físico accede a la laptop fuera de horario | Media | Alto | Cuenta Windows con password fuerte (responsabilidad cliente); DPAPI cifra credenciales router por cuenta; argon2id PIN admin con bloqueo. |
| T2 | Mesero curioso intenta entrar a AdminView | Alta | Bajo | PIN argon2id 4 dígitos; bloqueo 5 min tras 3 fallos; PIN inicial 0000 OBLIGA cambio en primer arranque. |
| T3 | Cliente WiFi escanea red interna | Alta | Crítico (red POS expuesta) | **Mitigación de capa de red**: router secundario aislado del módem. La app NO controla esta capa — Okuni Solutions lo configura en Día 0 y lo verifica con `nmap` antes de cerrar Fase 7. |
| T4 | MITM en cambio de password router | Baja | Medio | Comunicación local LAN; ataque requiere acceso físico a la red. Aceptable en threat model. |
| T5 | Inyección en formato `WIFI:T:WPA;...` | Baja | Medio | Charset password excluye `\;,:"`; QRService.formatPayload escapa explícitamente; tests unit ≥10 casos especiales. |
| T6 | **BT spoofing** — alguien cerca con dispositivo del mismo nombre que la Aomus | Baja | Medio | El `identifier` BLE incluye `peripheralId` (no solo nombre); driver verifica match exacto antes de imprimir. Si peripheralId no responde, falla limpio sin caer en otro device. |
| T7 | **USB drive attack** — alguien inserta USB malicioso en la laptop | Baja | Bajo (la app no monta auto USB) | App no escanea unidades USB; discovery solo enumera printers vía CUPS/wmic, no monta filesystems. Responsabilidad de Windows / antivirus. |
| T8 | **Phishing al mesero pidiendo el PIN admin** | Media | Medio | Capacitación: "el PIN solo lo conoce el dueño, NUNCA lo des aunque digan ser de Okuni". Manual del mesero lo dice explícito. Okuni nunca pide PIN — usa RDP. |
| T9 | **Restauración de DB desde backup malicioso** | Muy baja | Crítico | DB no tiene formato firmado (limitación SQLite). Mitigación: backups solo los hace Okuni vía RDP a `%APPDATA%`; el cliente no maneja backups manualmente; documentado en manual instalación. |
| T10 | XSS en business name / footer message guardado por admin | Baja | Medio | React escapa por defecto (`{name}` en JSX no es HTML injection). Renderer NUNCA usa `dangerouslySetInnerHTML`. Test unit que valida que `<script>alert(1)</script>` se renderiza como texto. |
| T11 | Path traversal en `exportLogs(path)` | Baja | Medio | `dialog.showSaveDialog` controla la ruta (no input crudo del renderer); validar que `path` resuelto está fuera de `app.getPath('userData')`. |
| T12 | Credenciales router en logs si error es verboso | Media | Medio | Sanitizer regex en electron-log (sección 4.4) tacha `password=` y `token=`. Test unit con 5 patrones de ataque. |

---

## 7. Riesgos específicos QA / Empaquetado / Seguridad

| # | Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|---|
| QR1 | CI flaky cross-platform — tests pasan local fallan en runners | Alta | Medio | Matriz separada lint→test; tests con dependencias OS marcados con `it.skipIf`; cache de node_modules; reintentos automáticos solo en E2E. |
| QR2 | `electron-rebuild` falla en CI runners (especial macOS arm64 vs x64) | Alta | Alto | Usar `actions/setup-node@v4` con cache; correr `npm rebuild better-sqlite3 argon2` explícito antes de tests; documentar excepción si argon2 no compila en algún runner. |
| QR3 | `asarUnpack` no incluye un native dep nuevo y crashea en runtime | Media | Crítico | `verify-asar-unpack.mjs` post-build chequea presencia explícita de los 5 módulos; CI artifact analizable. |
| QR4 | Win Defender bloquea `.exe` en máquinas distintas a la del cliente | Alta | Medio | Apéndice C del manual con 3 procedimientos (Q16); en Fase 7 se valida en máquina del cliente y se documenta cuál procedimiento funcionó. |
| QR5 | Fonts Inter/JetBrains Mono no cargan desde `.exe` empaquetado | Media | Medio | `extraResources` incluye `resources/fonts/`; CSS usa `url('../resources/fonts/...')` con path relativo válido en empaquetado; test E2E captura screenshot y valida fuente vía heurística (medida de width de un string conocido). |
| QR6 | Coverage threshold rompe build en Fase 0-1 sin código real | Media | Bajo | Thresholds escalonados por fase (Q14); Fase 0-1 sin gates fuertes. |
| QR7 | `noble` en CI requiere BT adapter — falla siempre | Alta | Bajo | `WIFI_VOUCHER_SKIP_BLE=1` en jobs; tests BLE con `it.skipIf`; validación BLE solo manual via RDP. |
| QR8 | `safeStorage` prompt de Keychain en Mac dev bloquea dev | Media | Bajo | Wrapper `CredentialStorage` + env `WIFI_VOUCHER_USE_MOCK_STORAGE=1` (Q15). |
| QR9 | Electron 39 + Node 22.20 incompatible con `@thiagoelg/node-printer` (mantenido por una persona) | Baja | Alto | Validar compilación en Fase 0; si falla, documentar excepción y bajar a Electron 30 (Maragon path), o reemplazar por `node-thermal-printer.driver`. |
| QR10 | Cliente desactiva auto-arranque sin avisar y app no levanta tras reboot | Media | Medio | AdminView tiene toggle visible "Iniciar al encender la computadora"; manual del admin lo documenta; smoke test no detecta esto (la app no corre para ejecutarlo) — Okuni lo nota cuando RDP falla y verifica. |
| QR11 | NSIS instalador parche sobreescribe DB del cliente | Baja | Crítico | `electron-builder` con `oneClick: false` no toca `%APPDATA%` por defecto; test manual de upgrade en Día 0 (instalar 1.0.0, configurar, instalar 1.0.1, validar config persiste). |
| QR12 | `argon2` con cost alto bloquea main process > 100ms | Baja | Bajo | Cost `timeCost=3, memoryCost=2^16` está calibrado en maragon; medido < 80ms en laptop estándar. Si CI runners son lentos, reducir cost solo en `NODE_ENV=test`. |

---

## 8. Estimación realista

Comparada con plan v1.1:

| Fase | Plan v1.1 | Mi estimación QA-realista | Δ | Justificación |
|---|---|---|---|---|
| Fase 0 (lead) | 0.5 d | **1.0 d** | +0.5 | Heredar bien de maragon + 4 tsconfigs + CI matrix + .context completo lleva más tiempo del estimado. Una sola persona, día completo. |
| Fase 6 (lead) | 1.5 d | **2.5 d** | +1.0 | 4 manuales + video Loom + audit checklist + 3 procedimientos Defender + screenshots reales + verify scripts + DB upgrade test. Plan v1.1 subestima. |
| Fase 7 (lead, calendario) | 1-2 sem | **2 sem firmes** + buffer 1 sem | +0-1 sem | Día 0 (4h) + 7 días monitoreo activo + 7 días pasivo + 1 sem buffer hotfix. Realista para piloto único. |

**Total específico QA/Empaquetado/Seguridad:** ~3.5 días-persona de desarrollo concentrado (Fase 0 + Fase 6) + 2-3 semanas calendario en Fase 7 (con dedicación parcial). Esto solapa con las otras fases lead de los demás especialistas.

Para las fases donde soy **consulting** (1, 2, 3, 4, 5): 0.5 días-persona total acumulado en code reviews, ajustes de configs, y soporte a tests de los demás.

---

QA/Empaquetado/Seguridad specialist — listo para consolidación.
