# Fase 0 — Scaffolding del repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inicializar el repo `wifi-voucher-manager/` con stack completo (Electron 39 + Vite 5 + React 18 + TypeScript 5.6 + Knex/SQLite + argon2 + drivers BLE/USB/Serial), módulos nativos compilando, CI listo, `.context/` documentation, y validación bloqueante de `@abandonware/noble` contra Electron 39 ABI.

**Architecture:** Repo independiente bajo `wifi-voucher-manager/` (hermano de `docs/`), tres procesos Electron (main + preload + renderer), 4 tsconfigs composite, electron-builder con `asarUnpack` para 5 nativos. La fase termina con `npm run dev` levantando "Hello World" funcional, todos los gates (lint/type-check/test) en verde, y un `.exe` empaquetable.

**Tech Stack:** Electron 39, Node 22.20 LTS, React 18.3.1, Vite 5.4, TypeScript 5.6.3, Tailwind 3.4, Knex 3.1, better-sqlite3 11.5, argon2 0.44, @abandonware/noble 1.9.2-25, serialport 13, @thiagoelg/node-printer 0.6.2, vitest 2.1, Playwright 1.48, electron-builder 25.1, ESLint 9 (flat), Prettier 3.3.

**Referencias:**
- Spec: `docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md`
- Detalle de configs y package.json final: `docs/superpowers/brainstorming/etapa2-qa.md` Sección 2
- Decisiones D-001 a D-021: spec Sección 2
- Validación bloqueante de noble: spec Sección 5 Fase 0 + `etapa2-qa.md`-equivalente (output del Hardware specialist Q9 en transcript)

**Working directory para este plan:** `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/`. Las rutas absolutas en cada Task asumen este parent. Repo nuevo se crea en subcarpeta `wifi-voucher-manager/`.

---

## File Structure (resumen — todas las rutas son relativas a `wifi-voucher-manager/`)

**Crear durante Fase 0:**

```
wifi-voucher-manager/
├── .editorconfig
├── .gitignore
├── .nvmrc                        # "22"
├── .prettierrc.json
├── .prettierignore
├── .env.example
├── README.md
├── DECISIONS.md                  # 21 decisiones de Sección 2 del spec
├── package.json
├── tsconfig.json                 # composite raíz
├── tsconfig.electron.json
├── tsconfig.renderer.json
├── tsconfig.shared.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.mjs             # flat config v9
├── electron-builder.yml
├── index.html                    # con meta CSP (__CSP__ swap por plugin Vite)
│
├── .context/
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACTS.md
│   └── DEPENDENCIES.md
│
├── .github/workflows/ci.yml
│
├── build/
│   ├── icon.ico                  # 256x256 multi-res — placeholder en Fase 0
│   ├── icon.icns                 # placeholder
│   ├── icon.png                  # placeholder
│   └── installer/
│       ├── header.bmp            # placeholder NSIS banner
│       └── license_es.txt        # MIT en español
│
├── resources/                    # vacío — se llena en fases siguientes
│   └── .gitkeep
│
├── src/
│   ├── main/
│   │   ├── index.ts              # entry point Electron — Hello World mínimo en Fase 0
│   │   ├── security/
│   │   │   └── csp.ts            # constantes PROD_CSP / DEV_CSP exportadas
│   │   ├── db/
│   │   │   ├── connection.ts     # Knex + better-sqlite3 + pragmas
│   │   │   ├── run-migrations.ts
│   │   │   └── cli/migrate.ts    # CLI standalone
│   │   └── utils/
│   │       └── timeout.ts        # helper utilitario; smoke test verifica que existe
│   ├── preload/
│   │   └── index.ts              # contextBridge stub vacío en Fase 0
│   ├── renderer/
│   │   ├── main.tsx              # bootstrap React Hello World
│   │   ├── App.tsx               # componente root mínimo
│   │   ├── styles/
│   │   │   ├── tokens.ts         # placeholder con palette mínima — completo en Fase 1
│   │   │   ├── fonts.ts          # imports @fontsource (no se renderizan en Fase 0)
│   │   │   └── global.css        # @tailwind directives
│   │   └── types/
│   │       └── window.d.ts       # augment Window con `api: unknown` (tipa real en Fase 1)
│   └── shared/
│       └── types.ts              # placeholder export {} — IpcAPI llega en Fase 1
│
├── tests/
│   ├── unit/
│   │   └── smoke.test.ts         # vitest funciona
│   ├── integration/
│   │   └── argon2-smoke.test.ts  # native rebuild verificado
│   ├── e2e/
│   │   └── smoke.spec.ts         # Playwright + Electron empaquetado funciona
│   └── fixtures/
│       └── .gitkeep
│
└── scripts/
    ├── smoke-noble.ts            # validación bloqueante BLE
    ├── verify-csp.mjs            # post-build CSP sanity check
    ├── verify-asar-unpack.mjs    # confirma native deps unpacked
    └── sanitize-build.mjs        # verifica no `console.log` en dist
```

**Tailwind config:** se crea en Fase 1 (cuando se construye `WaiterView`). En Fase 0 solo estructura de directorios + global.css con `@tailwind` directives funcionando.

---

## Tareas

### Task 1: Crear subdirectorio del repo

**Contexto:** el repo git ya existe en el directorio padre (`/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/`) con remote `git@github.com:nemesis128/QR-Printer-Internet-for-Customers.git` y un `.gitignore` raíz que cubre `**/node_modules/`, `**/dist*/`, etc. NO se hace `git init` interno en `wifi-voucher-manager/` — sería un sub-repo y crearía conflictos.

**Files:**
- Create: `wifi-voucher-manager/` (directorio)

- [ ] **Step 1: Verificar que estás en el repo del padre**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes"
git status
```

Expected: salida `On branch main` o equivalente. Sin errores. Si dice "not a git repository", DETENTE — el setup inicial no se hizo bien.

- [ ] **Step 2: Crear el subdirectorio**

```bash
mkdir -p wifi-voucher-manager
cd wifi-voucher-manager
pwd
```

Expected: `pwd` muestra `/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager`.

- [ ] **Step 3: Verificar que el `.gitignore` raíz cubre node_modules/dist desde aquí**

```bash
mkdir -p test-temp/node_modules
git status --short
rm -rf test-temp
```

Expected: `node_modules/` NO aparece en output (cubierto por `**/node_modules/` del raíz). Si aparece, revisar el `.gitignore` raíz.

**Sin commit en esta Task** — git no rastrea directorios vacíos. La Task 2 (`package.json`) será el primer archivo que se commitee dentro de `wifi-voucher-manager/`.

---

### Task 2: package.json con dependencias exactas

**Files:**
- Create: `wifi-voucher-manager/package.json`

- [ ] **Step 1: Crear `package.json` con el contenido completo**

Contenido exacto:

```json
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
    "smoke:noble": "cross-env NODE_OPTIONS=\"--import tsx/esm\" electron scripts/smoke-noble.ts",
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

- [ ] **Step 2: Instalar dependencias**

```bash
cd "/Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager"
npm install
```

Expected: `node_modules/` poblado, exit 0. Pueden aparecer warnings de peer dependencies pero NO errores. **Si falla** con error de `node-gyp` para `argon2`/`better-sqlite3`/`noble`: en Mac asegurar Xcode CLT con `xcode-select --install`. En Win11 instalar Visual Studio Build Tools 2022 con workload "Desktop development with C++" + Python 3.11. Documentar en `DECISIONS.md` cualquier excepción.

- [ ] **Step 3: Verificar Node version**

```bash
node --version
```

Expected: `v22.20.x` o superior dentro del rango `>=22.20.0 <23`. Si la versión local no matchea, instalar Node 22 LTS (vía nvm: `nvm install 22 && nvm use 22`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add package.json with full dependency list"
```

Expected: commit creado.

---

### Task 3: TypeScript configs (raíz + 3 referencias)

**Files:**
- Create: `wifi-voucher-manager/tsconfig.json`
- Create: `wifi-voucher-manager/tsconfig.electron.json`
- Create: `wifi-voucher-manager/tsconfig.renderer.json`
- Create: `wifi-voucher-manager/tsconfig.shared.json`

- [ ] **Step 1: Verificar comando type-check falla (sin configs)**

```bash
npm run type-check
```

Expected: FAIL con "error TS5057: Cannot find a tsconfig.json file" o equivalente. Esto valida que el script existe y reporta correctamente el problema.

- [ ] **Step 2: Crear `tsconfig.json` raíz (composite con references)**

Contenido completo:

```json
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

- [ ] **Step 3: Crear `tsconfig.electron.json`**

Contenido completo:

```json
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

- [ ] **Step 4: Crear `tsconfig.renderer.json`**

Contenido completo:

```json
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

- [ ] **Step 5: Crear `tsconfig.shared.json`**

Contenido completo:

```json
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

- [ ] **Step 6: Crear stubs mínimos para que tsc no falle por `include` vacío**

```bash
mkdir -p src/main src/preload src/renderer src/shared
echo "export {};" > src/main/_keep.ts
echo "export {};" > src/preload/_keep.ts
echo "export {};" > src/renderer/_keep.ts
echo "export {};" > src/shared/types.ts
```

- [ ] **Step 7: Verificar type-check pasa con stubs**

```bash
npm run type-check
```

Expected: exit 0, sin errores. Si aparece "TS6504: File '_keep.ts' is not under 'rootDir'" — verificar que `rootDir: "./src"` está correcto en cada tsconfig.

- [ ] **Step 8: Commit**

```bash
git add tsconfig*.json src/
git commit -m "chore: add 4 TypeScript configs (composite + electron + renderer + shared)"
```

Expected: commit creado.

---

### Task 4: ESLint flat config + Prettier + EditorConfig

**Files:**
- Create: `wifi-voucher-manager/eslint.config.mjs`
- Create: `wifi-voucher-manager/.prettierrc.json`
- Create: `wifi-voucher-manager/.prettierignore`
- Create: `wifi-voucher-manager/.editorconfig`
- Create: `wifi-voucher-manager/.nvmrc`

- [ ] **Step 1: Verificar lint falla sin config**

```bash
npm run lint
```

Expected: FAIL con "Could not find config file" o equivalente.

- [ ] **Step 2: Crear `eslint.config.mjs`**

Contenido completo:

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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['tests/**/*', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier
);
```

- [ ] **Step 3: Crear `.prettierrc.json`**

Contenido:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 4: Crear `.prettierignore`**

Contenido:

```
node_modules
dist
dist-electron
dist-installer
coverage
build
*.lock
package-lock.json
```

- [ ] **Step 5: Crear `.editorconfig`**

Contenido:

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

- [ ] **Step 6: Crear `.nvmrc`**

Contenido (un solo carácter de versión):

```
22
```

- [ ] **Step 7: Verificar lint pasa con stubs vacíos**

```bash
npm run lint
```

Expected: exit 0 sin errores ni warnings (los `_keep.ts` con `export {}` no violan reglas).

- [ ] **Step 8: Verificar prettier pasa**

```bash
npx prettier --check .
```

Expected: exit 0. Si reporta archivos mal formateados, correr `npm run format` y re-verificar.

- [ ] **Step 9: Commit**

```bash
git add eslint.config.mjs .prettierrc.json .prettierignore .editorconfig .nvmrc
git commit -m "chore: add eslint flat config + prettier + editorconfig + nvmrc"
```

---

### Task 5: Vite config con plugin csp-swap + index.html

**Files:**
- Create: `wifi-voucher-manager/vite.config.ts`
- Create: `wifi-voucher-manager/index.html`

- [ ] **Step 1: Crear `index.html` con marcador `__CSP__`**

Contenido completo:

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="__CSP__" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WiFi Voucher Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Crear `vite.config.ts`**

Contenido completo:

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
      transformIndexHtml(html: string) {
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

- [ ] **Step 3: Crear stub mínimo de `src/renderer/main.tsx`**

Reemplazar `src/renderer/_keep.ts` con:

```bash
rm src/renderer/_keep.ts
```

Crear `src/renderer/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<h1>WiFi Voucher Manager — Hello World</h1>);
```

- [ ] **Step 4: Verificar build:renderer funciona**

```bash
npm run build:renderer
```

Expected: exit 0. `dist/index.html` y `dist/assets/*.js` creados. Inspeccionar `dist/index.html`:

```bash
grep "Content-Security-Policy" dist/index.html
```

Expected: contiene la PROD_CSP completa (debe aparecer `default-src 'self'` y NO `unsafe-eval`).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts index.html src/renderer/main.tsx
rm -f src/renderer/_keep.ts
git add -u
git commit -m "feat: add vite config with CSP swap plugin + Hello World renderer"
```

---

### Task 6: Electron main minimal (Hello World con security flags)

**Files:**
- Create: `wifi-voucher-manager/src/main/index.ts`
- Create: `wifi-voucher-manager/src/main/security/csp.ts`
- Modify: `wifi-voucher-manager/src/main/_keep.ts` → eliminar
- Create: `wifi-voucher-manager/src/preload/index.ts`

- [ ] **Step 1: Crear `src/main/security/csp.ts`**

Contenido:

```typescript
export const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export const DEV_CSP =
  "default-src 'self' http://localhost:5173 ws://localhost:5173; script-src 'self' http://localhost:5173 'unsafe-inline' 'unsafe-eval'; style-src 'self' http://localhost:5173 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:5173 ws://localhost:5173";
```

- [ ] **Step 2: Crear `src/preload/index.ts` (stub vacío en Fase 0)**

Contenido:

```typescript
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // IpcAPI llega en Fase 1; por ahora exponemos namespace vacío para validar el patrón.
  hello: () => 'hello from preload',
});
```

- [ ] **Step 3: Crear `src/main/index.ts` con BrowserWindow + flags de seguridad**

Contenido completo:

```typescript
import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEV_CSP, PROD_CSP } from './security/csp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

app.whenReady().then(() => {
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

  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Eliminar el stub `_keep.ts`**

```bash
rm src/main/_keep.ts src/preload/_keep.ts
```

- [ ] **Step 5: Build el preload (necesario para que dev:electron lo encuentre)**

```bash
npm run build:preload
```

Expected: exit 0. Archivo `dist-electron/preload/index.js` existe.

- [ ] **Step 6: Verificar type-check pasa con el código real**

```bash
npm run type-check
```

Expected: exit 0. Si falla con "Cannot find module 'electron'" o similar, verificar que `electron` está instalado: `ls node_modules/electron`.

- [ ] **Step 7: Commit**

```bash
git add src/main/ src/preload/
git commit -m "feat: add Electron main process with security flags + preload stub"
```

---

### Task 7: Concurrent dev workflow funciona end-to-end

**Files:**
- (no nuevos archivos — usa scripts ya en `package.json`)

- [ ] **Step 1: Correr `npm run dev` y validar visualmente**

```bash
npm run dev
```

Expected:
- Terminal muestra dos prefijos coloreados: `[vite]` (azul) y `[electron]` (verde).
- Vite log: `VITE v5.x ready in Xms` con `Local: http://localhost:5173/`.
- Electron log: ventana abre.
- Se ve ventana "WiFi Voucher Manager — Hello World" con DevTools abierto en panel separado (modo `detach`).

- [ ] **Step 2: Verificar el preload está expuesto**

En la ventana abierta, abrir Console del DevTools y ejecutar:

```javascript
window.api.hello()
```

Expected: devuelve `"hello from preload"`. **Si aparece `undefined`** o `Cannot read properties of undefined`: el preload no se cargó. Verificar `dist-electron/preload/index.js` existe y la ruta en `webPreferences.preload` es correcta.

- [ ] **Step 3: Validar CSP en DevTools**

En el Console del DevTools:

```javascript
document.querySelector('meta[http-equiv="Content-Security-Policy"]').content
```

Expected: incluye `'unsafe-eval'` (es modo dev — DEV_CSP activo). Confirma que el plugin csp-swap aplicó la versión dev.

- [ ] **Step 4: Cerrar la app**

`Ctrl+C` en la terminal. Ambos procesos se cierran limpios.

- [ ] **Step 5: Commit (placeholder para tener un punto de ancla)**

No hay archivos nuevos. Solo hacer un commit vacío para marcar el milestone:

```bash
git commit --allow-empty -m "milestone: dev workflow funcional end-to-end (vite + electron + preload)"
```

---

### Task 8: Vitest config + smoke unit test

**Files:**
- Create: `wifi-voucher-manager/vitest.config.ts`
- Create: `wifi-voucher-manager/tests/unit/smoke.test.ts`

- [ ] **Step 1: Crear `vitest.config.ts` con coverage thresholds escalonados de Fase 0**

Contenido (Fase 0 = thresholds desactivados; suben en Fase 2 según D-021):

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/main/ipc/**',
        'src/preload/**',
        'src/renderer/main.tsx',
        '**/*.d.ts',
        '**/types.ts',
      ],
      // Fase 0: thresholds desactivados (D-021). Se activan en Fase 1+ por carpeta.
      thresholds: undefined,
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

- [ ] **Step 2: Verificar test command falla sin tests**

```bash
npm run test
```

Expected: FAIL con "No test files found, exiting with code 1" o equivalente.

- [ ] **Step 3: Crear `tests/unit/smoke.test.ts`**

Contenido:

```typescript
import { describe, expect, it } from 'vitest';

describe('smoke test — vitest se ejecuta correctamente', () => {
  it('matemática básica funciona', () => {
    expect(2 + 2).toBe(4);
  });

  it('happy-dom expone document', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement).toBeDefined();
  });
});
```

- [ ] **Step 4: Verificar test pasa**

```bash
npm run test
```

Expected: 2 tests passed, exit 0.

- [ ] **Step 5: Verificar coverage funciona**

```bash
npm run test:coverage
```

Expected: exit 0, output de coverage al final con tabla. `coverage/index.html` creado.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/unit/smoke.test.ts
git commit -m "feat: add vitest config + smoke test"
```

---

### Task 9: Playwright config + skeleton E2E

**Files:**
- Create: `wifi-voucher-manager/playwright.config.ts`
- Create: `wifi-voucher-manager/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Crear `playwright.config.ts`**

Contenido (configurado para correr Electron empaquetado):

```typescript
import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false, // Electron tests deben correr secuenciales (un solo .exe)
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  outputDir: path.resolve(__dirname, 'test-results'),
});
```

- [ ] **Step 2: Crear `tests/e2e/smoke.spec.ts` (skeleton)**

Contenido:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test.describe('Smoke — Electron app launches', () => {
  test.skip(
    process.env.WIFI_VOUCHER_SKIP_E2E === '1' || !process.env.WIFI_VOUCHER_TEST_BUILD_PATH,
    'E2E skipped: set WIFI_VOUCHER_TEST_BUILD_PATH to .exe path on Win11 to enable.'
  );

  test('main window loads with Hello World', async () => {
    const buildPath = process.env.WIFI_VOUCHER_TEST_BUILD_PATH!;
    const app = await electron.launch({
      args: [path.resolve(buildPath)],
      timeout: 15_000,
    });

    const page = await app.firstWindow();
    await expect(page.locator('h1')).toContainText('Hello World');

    await app.close();
  });
});
```

- [ ] **Step 3: Instalar browsers de Playwright (necesario aunque solo usamos Electron)**

```bash
npx playwright install chromium
```

Expected: descarga ~150MB. Exit 0.

- [ ] **Step 4: Verificar Playwright config carga sin errores**

```bash
npx playwright test --list
```

Expected: lista los tests definidos. El test "main window loads with Hello World" aparece pero marcado como skipped.

- [ ] **Step 5: Correr el test (debe pasar como skipped por env var)**

```bash
npm run test:e2e
```

Expected: 1 skipped, 0 failed, exit 0. El test no corre porque `WIFI_VOUCHER_TEST_BUILD_PATH` no está set.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts
git commit -m "feat: add Playwright config + skeleton E2E (skipped until packaged build)"
```

---

### Task 10: GitHub Actions CI workflow

**Files:**
- Create: `wifi-voucher-manager/.github/workflows/ci.yml`

- [ ] **Step 1: Crear el workflow**

```bash
mkdir -p .github/workflows
```

Contenido de `.github/workflows/ci.yml`:

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
        with:
          node-version: '22.20'
          cache: 'npm'
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
      WIFI_VOUCHER_SKIP_BLE: '1'
      WIFI_VOUCHER_SKIP_E2E: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.20'
          cache: 'npm'
      - name: Install Linux deps
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y libcups2-dev libudev-dev
      - run: npm ci
      - name: Rebuild native modules
        run: npm rebuild better-sqlite3 argon2
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        if: matrix.os == 'ubuntu-latest'
        with:
          name: coverage
          path: coverage/

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
        with:
          node-version: '22.20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Build installer (Windows only)
        if: runner.os == 'Windows'
        run: npm run dist:win
      - uses: actions/upload-artifact@v4
        if: runner.os == 'Windows'
        with:
          name: installer-win
          path: dist-installer/*.exe
          retention-days: 14
```

- [ ] **Step 2: Validar sintaxis YAML**

```bash
npx --yes yaml-validator .github/workflows/ci.yml || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: exit 0 (YAML válido). Si no hay yaml-validator y python3 no está disponible, validar visualmente con `cat .github/workflows/ci.yml` y revisar indentación.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (lint+type-check + test matrix + build)"
```

---

### Task 11: electron-builder.yml + build assets placeholder

**Files:**
- Create: `wifi-voucher-manager/electron-builder.yml`
- Create: `wifi-voucher-manager/build/icon.png` (placeholder)
- Create: `wifi-voucher-manager/build/installer/license_es.txt`
- Create: `wifi-voucher-manager/resources/.gitkeep`

- [ ] **Step 1: Crear `electron-builder.yml`**

Contenido completo:

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
  - from: resources
    to: resources

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.png
  executableName: WiFiVoucherManager
  artifactName: "${productName} Setup ${version}.${ext}"
  publisherName: Okuni Solutions

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  perMachine: false
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: WiFi Voucher Manager
  installerIcon: build/icon.png
  uninstallerIcon: build/icon.png
  language: "3082"
  runAfterFinish: true

mac:
  target:
    - target: dmg
      arch: [arm64, x64]
  icon: build/icon.png
  category: public.app-category.business
  darkModeSupport: false
```

**Nota:** uso `build/icon.png` para todas las plataformas en Fase 0. Iconos `.ico` y `.icns` reales se generan en Fase 6.

- [ ] **Step 2: Crear placeholder de icono**

Generar un PNG 256x256 sólido (color del fondo de la app). En Mac:

```bash
mkdir -p build/installer resources
# Genera un PNG 256x256 gris claro como placeholder usando sips (Mac built-in)
# Si sips no está, usa cualquier PNG existente:
echo -e '\x89PNG\r\n\x1a\n' > build/icon.png
# O mejor, descargar un placeholder oficial — para Fase 0 cualquier PNG válido sirve.
# Workaround simple: copiar un PNG de assets de Electron node_modules
cp node_modules/electron/dist/resources/default_app.asar build/icon-tmp 2>/dev/null || true
```

Si no logras generar PNG válido, alternativa: usar el icono default de Electron como placeholder. **El criterio aquí no es belleza — es que electron-builder no falle por archivo faltante**. Confirmar:

```bash
file build/icon.png
```

Expected: `PNG image data, 256 x 256` o similar. Si dice "data" o tamaño distinto, regenerar. Para Mac con homebrew: `brew install imagemagick && convert -size 256x256 xc:#FAFAFA build/icon.png`.

- [ ] **Step 3: Crear `build/installer/license_es.txt`**

Contenido (MIT en español, plaintext):

```
WiFi Voucher Manager
Copyright (c) 2026 Okuni Solutions

Licencia MIT

Por la presente se otorga permiso, sin cargo, a cualquier persona que obtenga
una copia de este software y los archivos de documentación asociados (el
"Software"), para utilizar el Software sin restricciones, incluyendo sin
limitación los derechos de uso, copia, modificación, fusión, publicación,
distribución, sublicencia y/o venta de copias del Software, y para permitir
a las personas a quienes se les proporcione el Software hacer lo mismo, sujeto
a las siguientes condiciones:

El aviso de copyright anterior y este aviso de permiso se incluirán en todas
las copias o partes sustanciales del Software.

EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO, EXPRESA O
IMPLÍCITA.
```

- [ ] **Step 4: Crear `resources/.gitkeep`**

```bash
touch resources/.gitkeep
```

- [ ] **Step 5: Validar config con dry-run de electron-builder**

```bash
npx electron-builder --help > /dev/null
```

Expected: exit 0. **No** correr `electron-builder` real todavía — eso necesita el build completo. Solo validar que el binario está instalado.

- [ ] **Step 6: Commit**

```bash
git add electron-builder.yml build/ resources/
git commit -m "chore: add electron-builder config + placeholder build assets"
```

---

### Task 12: Pragmas SQLite + connection.ts (estructura DB)

**Files:**
- Create: `wifi-voucher-manager/src/main/db/connection.ts`
- Create: `wifi-voucher-manager/src/main/db/run-migrations.ts`
- Create: `wifi-voucher-manager/src/main/db/cli/migrate.ts`
- Create: `wifi-voucher-manager/src/main/db/migrations/.gitkeep`
- Create: `wifi-voucher-manager/tests/integration/db-connection.test.ts`

- [ ] **Step 1: Crear estructura de directorios**

```bash
mkdir -p src/main/db/migrations src/main/db/cli
touch src/main/db/migrations/.gitkeep
```

- [ ] **Step 2: Escribir el test fallido para connection**

Crear `tests/integration/db-connection.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';

describe('createConnection', () => {
  it('crea Knex con SQLite in-memory + pragmas activos', async () => {
    const db = createConnection({ filename: ':memory:' });

    const fkResult = await db.raw('PRAGMA foreign_keys');
    expect(fkResult[0].foreign_keys).toBe(1);

    const journalResult = await db.raw('PRAGMA journal_mode');
    expect(['memory', 'wal']).toContain(journalResult[0].journal_mode);

    await db.destroy();
  });

  it('SELECT 1 ejecuta correctamente', async () => {
    const db = createConnection({ filename: ':memory:' });
    const result = await db.raw('SELECT 1 as one');
    expect(result[0].one).toBe(1);
    await db.destroy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test -- db-connection
```

Expected: FAIL con "Cannot find module 'connection'" o similar — porque aún no existe.

- [ ] **Step 4: Implementar `src/main/db/connection.ts`**

Contenido:

```typescript
import knex, { type Knex } from 'knex';

export interface ConnectionOptions {
  filename: string;
}

export function createConnection(options: ConnectionOptions): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: {
      filename: options.filename,
    },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn: { pragma: (q: string) => unknown }, done: (err: Error | null) => void) {
        try {
          conn.pragma('foreign_keys = ON');
          conn.pragma('journal_mode = WAL');
          done(null);
        } catch (err) {
          done(err as Error);
        }
      },
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test -- db-connection
```

Expected: 2 passed, exit 0. **Si falla** con "could not load native binding": correr `npx electron-rebuild -f -w better-sqlite3` (aunque vitest corre con Node, no Electron — usar `npm rebuild better-sqlite3` para Node ABI).

- [ ] **Step 6: Implementar `src/main/db/run-migrations.ts` (versión mínima Fase 0)**

Contenido:

```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Knex } from 'knex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MigrationResult {
  batchNo: number;
  filesApplied: string[];
}

export async function runMigrations(db: Knex): Promise<MigrationResult> {
  const [batchNo, filesApplied] = (await db.migrate.latest({
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
  })) as [number, string[]];

  return { batchNo, filesApplied };
}
```

- [ ] **Step 7: Implementar CLI `src/main/db/cli/migrate.ts`**

Contenido:

```typescript
import { createConnection } from '../connection.js';
import { runMigrations } from '../run-migrations.js';

async function main(): Promise<void> {
  const filename = process.env.WIFI_VOUCHER_DB_PATH ?? 'data.db';
  const db = createConnection({ filename });
  try {
    const result = await runMigrations(db);
    if (result.filesApplied.length === 0) {
      console.warn('Sin migraciones nuevas que aplicar.');
    } else {
      console.warn(`Aplicadas ${result.filesApplied.length} migraciones (batch ${result.batchNo}):`);
      for (const f of result.filesApplied) console.warn(`  - ${f}`);
    }
  } finally {
    await db.destroy();
  }
}

void main();
```

- [ ] **Step 8: Verificar que `npm run db:migrate` arranca (sin migraciones aún)**

```bash
WIFI_VOUCHER_DB_PATH=:memory: npm run db:migrate
```

Expected: stdout muestra "Sin migraciones nuevas que aplicar." y exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/main/db tests/integration/db-connection.test.ts
git commit -m "feat: add Knex connection + migrations runner + CLI (Fase 0 scaffold)"
```

---

### Task 13: argon2 native rebuild + smoke test

**Files:**
- Create: `wifi-voucher-manager/tests/integration/argon2-smoke.test.ts`

- [ ] **Step 1: Escribir test fallido (asume que el rebuild aún no se hizo)**

Crear `tests/integration/argon2-smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import argon2 from 'argon2';

describe('argon2 native binding — smoke', () => {
  it('hash + verify funciona post-rebuild', async () => {
    const hash = await argon2.hash('test-pin-1234', {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 2 ** 16,
      parallelism: 1,
    });

    expect(hash).toMatch(/^\$argon2id\$/);

    const ok = await argon2.verify(hash, 'test-pin-1234');
    expect(ok).toBe(true);

    const wrong = await argon2.verify(hash, 'wrong-pin');
    expect(wrong).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm run test -- argon2-smoke
```

Expected: PASS si vitest corre con Node ABI compatible. **Si falla** con "Could not load native module" o "wrong ELF class" — argon2 no se compiló para Node 22. Ejecutar:

```bash
npm rebuild argon2
```

Y re-correr el test. Si sigue fallando, escalar al usuario (ver Task 16 para el plan B).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/argon2-smoke.test.ts
git commit -m "test: add argon2 native smoke test"
```

---

### Task 14: better-sqlite3 native rebuild verificado contra Electron

**Files:**
- (no nuevos archivos — ejecuta scripts del package.json)

- [ ] **Step 1: Correr electron-rebuild para better-sqlite3 contra Electron 39**

```bash
npx electron-rebuild -f -w better-sqlite3
```

Expected: exit 0. Output indica "Rebuilding better-sqlite3 for Electron 39.x.x ABI 127" o similar. **Si falla** con error de Python o gyp: en Mac instalar Xcode CLT (`xcode-select --install`); en Windows instalar VS Build Tools 2022. Re-intentar.

- [ ] **Step 2: Verificar que el `.node` binary existe**

```bash
ls -la node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

Expected: archivo presente con timestamp post-rebuild.

- [ ] **Step 3: Commit (placeholder — sin archivos nuevos pero milestone)**

```bash
git commit --allow-empty -m "milestone: better-sqlite3 native compiles against Electron 39"
```

---

### Task 15: VALIDACIÓN BLOQUEANTE — `@abandonware/noble` contra Electron 39

**ESTA TAREA ES BLOQUEANTE.** Si falla, NO avanzar a Task 16+. Activar Plan B (Electron 30) y documentar excepción D-011 en DECISIONS.md, luego re-arrancar Tasks 6-14 con Electron 30.

**Files:**
- Create: `wifi-voucher-manager/scripts/smoke-noble.ts`

- [ ] **Step 1: Crear script smoke-noble.ts**

Contenido completo:

```typescript
import { app } from 'electron';
import noble from '@abandonware/noble';

const SCAN_TIMEOUT_MS = 10_000;
const POWERED_ON_TIMEOUT_MS = 5_000;

async function waitForPoweredOn(timeoutMs: number): Promise<void> {
  if ((noble as unknown as { state: string }).state === 'poweredOn') return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando poweredOn (${timeoutMs}ms)`)),
      timeoutMs
    );
    const handler = (state: string): void => {
      console.log(`[smoke-noble] stateChange → ${state}`);
      if (state === 'poweredOn') {
        clearTimeout(timer);
        noble.removeListener('stateChange', handler);
        resolve();
      } else if (state === 'unauthorized' || state === 'unsupported') {
        clearTimeout(timer);
        noble.removeListener('stateChange', handler);
        reject(new Error(`Estado terminal: ${state}`));
      }
    };
    noble.on('stateChange', handler);
  });
}

async function scanForPeripherals(durationMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let count = 0;
    const seen = new Set<string>();

    const onDiscover = (peripheral: { id: string; advertisement?: { localName?: string } }): void => {
      if (!seen.has(peripheral.id)) {
        seen.add(peripheral.id);
        count++;
        const name = peripheral.advertisement?.localName ?? '<sin nombre>';
        console.log(`[smoke-noble] discover[${count}] id=${peripheral.id} name=${name}`);
      }
    };

    noble.on('discover', onDiscover);

    noble.startScanningAsync([], false).catch((err: unknown) => {
      reject(err as Error);
    });

    setTimeout(() => {
      noble.removeListener('discover', onDiscover);
      void noble.stopScanningAsync().finally(() => resolve(count));
    }, durationMs);
  });
}

async function main(): Promise<void> {
  console.log('[smoke-noble] arrancando…');
  console.log(`[smoke-noble] platform=${process.platform} electron=${process.versions.electron} node=${process.versions.node}`);
  try {
    await waitForPoweredOn(POWERED_ON_TIMEOUT_MS);
    console.log('[smoke-noble] BT adapter en estado poweredOn — OK');

    const found = await scanForPeripherals(SCAN_TIMEOUT_MS);
    console.log(`[smoke-noble] scan completado — ${found} periférico(s) detectado(s)`);

    if (found === 0) {
      console.warn('[smoke-noble] WARNING: no se detectaron periféricos. Si esperas la Aomus, verifica que esté encendida y emparejada.');
    }

    console.log('[smoke-noble] VALIDACIÓN BLE: OK');
    app.exit(0);
  } catch (err) {
    console.error('[smoke-noble] VALIDACIÓN BLE: FAIL');
    console.error(err);
    app.exit(2);
  }
}

void app.whenReady().then(main);
```

- [ ] **Step 2: Correr electron-rebuild para noble**

```bash
npx electron-rebuild -f -w @abandonware/noble
```

Expected: exit 0. **Si falla** — ESTE ES EL PUNTO DE DECISIÓN BLOQUEANTE:
- Captura el output completo del error.
- Detén la ejecución del plan.
- Documenta en `DECISIONS.md` excepción D-011: "Electron downgrade 39→30 por incompatibilidad ABI noble".
- Cambia `package.json` `devDependencies.electron` a `^30.5.0` y `package.json` `engines.node` a `>=20.18.0 <21`.
- Re-corre Tasks 2-14 con Electron 30.
- Re-intenta Task 15.

- [ ] **Step 3: Correr el smoke test en Electron**

En **macOS**: el primer run pide permiso de Bluetooth. Aprobar el prompt del SO.

```bash
npm run smoke:noble
```

Expected stdout (en aproximadamente este orden):

```
[smoke-noble] arrancando…
[smoke-noble] platform=darwin electron=39.x.x node=22.20.x
[smoke-noble] stateChange → poweredOn
[smoke-noble] BT adapter en estado poweredOn — OK
[smoke-noble] discover[1] id=... name=...
[smoke-noble] scan completado — N periférico(s) detectado(s)
[smoke-noble] VALIDACIÓN BLE: OK
```

Exit code 0.

**Si stdout muestra `state=unauthorized`**: el SO no concedió permiso. En Mac: System Settings → Privacy & Security → Bluetooth → habilitar para Terminal/iTerm/Electron. Re-correr.

**Si stdout muestra `state=unsupported`**: la máquina no tiene BT adapter funcional. **DETENER** — necesitas hardware compatible.

**Si timeout antes de `poweredOn`**: BT desactivado en el SO. Activar BT, re-correr.

**Si error de carga del binding** ("Cannot find module" / "wrong ELF class"): noble no se compiló bien para Electron 39. Activar Plan B (Electron 30) — ver Step 2.

- [ ] **Step 4: Validar en Win11 vía RDP**

Sincroniza el repo a la Dell (git push + git pull desde la Dell, o Samba). Desde RDP en Win11:

```bash
cd \path\to\wifi-voucher-manager
npm run smoke:noble
```

Expected: mismo output que Mac. Aomus My A1 (si está emparejada y encendida) debe aparecer en la lista de discovered.

**Si en Win11 falla** pero en Mac funcionó: típicamente es Win11 Privacy Settings bloqueando BT para apps desktop. Activar en Settings → Privacy & Security → Bluetooth → "Allow desktop apps to access Bluetooth".

- [ ] **Step 5: Commit (validación bloqueante exitosa)**

```bash
git add scripts/smoke-noble.ts
git commit -m "feat: add noble BLE smoke validation script (BLOCKING gate Fase 0 — passed)"
```

---

### Task 16: Scripts de validación predist (CSP + sanitize + asar)

**Files:**
- Create: `wifi-voucher-manager/scripts/verify-csp.mjs`
- Create: `wifi-voucher-manager/scripts/sanitize-build.mjs`
- Create: `wifi-voucher-manager/scripts/verify-asar-unpack.mjs`

- [ ] **Step 1: Crear `scripts/verify-csp.mjs`**

Contenido:

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const indexPath = path.resolve('dist/index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`[verify-csp] FAIL: ${indexPath} no existe. Corre 'npm run build' primero.`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');
const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);

if (!cspMatch) {
  console.error('[verify-csp] FAIL: meta tag CSP no encontrado en dist/index.html');
  process.exit(1);
}

const csp = cspMatch[1];

if (csp.includes('unsafe-eval')) {
  console.error('[verify-csp] FAIL: producción contiene "unsafe-eval"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

if (csp.includes('localhost')) {
  console.error('[verify-csp] FAIL: producción contiene "localhost"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

if (!csp.includes("default-src 'self'")) {
  console.error('[verify-csp] FAIL: producción no tiene "default-src \'self\'"');
  console.error(`  CSP actual: ${csp}`);
  process.exit(1);
}

console.warn('[verify-csp] OK: CSP de producción es estricta.');
```

- [ ] **Step 2: Crear `scripts/sanitize-build.mjs`**

Contenido:

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) yield full;
  }
}

const targets = ['dist', 'dist-electron'];
let violations = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  for (const file of walk(target)) {
    const content = fs.readFileSync(file, 'utf8');
    // Patrón: console.log directo, no console.warn ni console.error.
    const matches = content.match(/console\.log\s*\(/g);
    if (matches) {
      console.error(`[sanitize-build] ${file}: ${matches.length} ocurrencia(s) de console.log`);
      violations += matches.length;
    }
  }
}

if (violations > 0) {
  console.error(`[sanitize-build] FAIL: ${violations} violación(es) encontradas. Reemplaza console.log por electron-log o console.warn/error.`);
  process.exit(1);
}

console.warn('[sanitize-build] OK: sin console.log en builds.');
```

- [ ] **Step 3: Crear `scripts/verify-asar-unpack.mjs`**

Contenido:

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const installerDir = 'dist-installer';
if (!fs.existsSync(installerDir)) {
  console.warn('[verify-asar-unpack] SKIP: dist-installer no existe (no hay build empaquetado).');
  process.exit(0);
}

// Buscar app.asar.unpacked en cualquier subcarpeta del installer
const requiredModules = [
  'better-sqlite3',
  '@abandonware/noble',
  '@thiagoelg/node-printer',
  'serialport',
  'argon2',
];

function findAsarUnpacked(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'app.asar.unpacked') return full;
      const recurse = findAsarUnpacked(full);
      if (recurse) return recurse;
    }
  }
  return null;
}

const unpacked = findAsarUnpacked(installerDir);
if (!unpacked) {
  console.warn('[verify-asar-unpack] SKIP: app.asar.unpacked no encontrado (instalador NSIS comprime distinto). Validar manualmente en target Win11.');
  process.exit(0);
}

const nodeModulesPath = path.join(unpacked, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error('[verify-asar-unpack] FAIL: node_modules no encontrado en app.asar.unpacked');
  process.exit(1);
}

const missing = [];
for (const mod of requiredModules) {
  if (!fs.existsSync(path.join(nodeModulesPath, mod))) missing.push(mod);
}

if (missing.length > 0) {
  console.error(`[verify-asar-unpack] FAIL: módulos no unpacked: ${missing.join(', ')}`);
  console.error(`  Verifica electron-builder.yml > asarUnpack`);
  process.exit(1);
}

console.warn(`[verify-asar-unpack] OK: ${requiredModules.length} módulos nativos correctamente unpacked.`);
```

- [ ] **Step 4: Hacer ejecutables**

```bash
chmod +x scripts/*.mjs
```

- [ ] **Step 5: Verificar que verify-csp.mjs corre (debe SKIP porque no hay dist/)**

```bash
node scripts/verify-csp.mjs
```

Expected: FAIL con "dist/index.html no existe" (esperado en Fase 0 antes del build completo).

- [ ] **Step 6: Hacer un build renderer + correr verify-csp**

```bash
npm run build:renderer
node scripts/verify-csp.mjs
```

Expected: stdout `[verify-csp] OK: CSP de producción es estricta.` exit 0.

- [ ] **Step 7: Correr sanitize-build (verificar OK, no console.log en stub mínimo)**

```bash
node scripts/sanitize-build.mjs
```

Expected: stdout `[sanitize-build] OK: sin console.log en builds.` exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-csp.mjs scripts/sanitize-build.mjs scripts/verify-asar-unpack.mjs
git commit -m "feat: add predist/postdist validation scripts (CSP + sanitize + asar-unpack)"
```

---

### Task 17: Build production end-to-end (renderer + electron + preload)

**Files:**
- (no nuevos archivos — ejercita los scripts existentes)

- [ ] **Step 1: Limpiar builds anteriores**

```bash
rm -rf dist dist-electron dist-installer
```

- [ ] **Step 2: Correr build completo**

```bash
npm run build
```

Expected: exit 0. Tres outputs:
- `dist/index.html` + `dist/assets/*.js` (renderer Vite)
- `dist-electron/main/index.js` (main TS compilado)
- `dist-electron/preload/index.js` (preload bundle esbuild)

- [ ] **Step 3: Verificar tipos**

```bash
npm run type-check
```

Expected: exit 0.

- [ ] **Step 4: Verificar lint**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 5: Verificar tests**

```bash
npm run test
```

Expected: exit 0. Total tests = 4 (2 smoke + 2 db-connection + 1 argon2 = 5; verificar conteo).

- [ ] **Step 6: Verificar predist se completa hasta el packaging**

```bash
npm run predist
```

Expected: corre electron-rebuild + build + verify-csp + sanitize-build, todos exit 0.

- [ ] **Step 7: Commit milestone**

```bash
git commit --allow-empty -m "milestone: build pipeline completo (renderer+electron+preload+predist) en verde"
```

---

### Task 18: `.context/` documentation inicial

**Files:**
- Create: `wifi-voucher-manager/.context/PROJECT.md`
- Create: `wifi-voucher-manager/.context/ARCHITECTURE.md`
- Create: `wifi-voucher-manager/.context/API_CONTRACTS.md`
- Create: `wifi-voucher-manager/.context/DEPENDENCIES.md`

- [ ] **Step 1: Crear `.context/PROJECT.md`**

Contenido:

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
1. CLAUDE.md (raíz parent)
2. PLAN-TECNICO-WIFI-MANAGER_2.md (raíz parent)
3. DECISIONS.md (raíz wifi-voucher-manager)
4. .context/ARCHITECTURE.md (este folder)
5. docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md (parent)
```

- [ ] **Step 2: Crear `.context/ARCHITECTURE.md`**

Contenido:

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
| electron-store (`config.json` mismo dir) | AppConfig general (SSID, cron, business name, pinHash, pinIsDefault) | sync, plain JSON |
| safeStorage (DPAPI Win / Keychain Mac) | router password (cifrada) | wrapper `CredentialStorage` para mockear en tests |

## Scheduler con recovery

`SchedulerService` usa `node-cron` con timezone explícito. Al startup verifica `last_rotation > 24h` y dispara catch-up. Backoff exponencial 1m/5m/15m, 3 intentos. Falla persistente → banner inline en UI (NO toast). Transacción atomic: insert con `active=0` → router HTTP call → update `active=1` solo si HTTP OK.

## Sistema de tests

- Unit (vitest): services + adapters + escpos builder.
- Integration (vitest + better-sqlite3 in-memory + nock + MockRouterAdapter): flujos main process.
- E2E (Playwright + Electron empaquetado): 3+ escenarios.
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
```

- [ ] **Step 3: Crear `.context/API_CONTRACTS.md`**

Contenido:

```markdown
# Contratos IPC

Definidos en `src/shared/types.ts` (poblado en Fase 1+ — vacío en Fase 0).

## Namespacing por dominio

El renderer accede como `window.api.<namespace>.<method>(...)`. Cinco namespaces:

- `window.api.waiter.*` — sin auth: `printVoucher`, `getCurrentSSID`, `getSystemHealth`.
- `window.api.admin.*` — requiere session token: `validatePin`, `changePin`, `getConfig`, `updateConfig`, `rotatePasswordNow`.
- `window.api.printer.*` — requiere session token: CRUD impresoras + `discover`, `testConnection`, `printTestVoucher`, `printDiagnosticPage`, `getJobStatus`, `retryJob`, `installCupsQueue`.
- `window.api.router.*` — `pingRouter`, `testConnection`, `markPasswordAppliedManually`.
- `window.api.stats.*` — `getStats`, `getRecentEvents`, `exportLogs`.

## Reglas IPC (no negociables)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Validar TODO input con zod en main antes de procesar.
- Errores nunca exponen stack traces al renderer; mensajes legibles.
- Operaciones de discovery/test con timeout máx 10s; nunca bloquear UI.
- Llamadas que disparan impresión devuelven `jobId`, no esperan al print real (queue async).
- Session token: 32 bytes randomBytes, TTL 30 min con refresh por llamada.

## Formato de respuesta

Convenidamente, los handlers devuelven `{ ok: true, data?: T }` o `{ ok: false, code: string, message: string }`. Errores conocidos vienen con `code` para que el frontend pueda mapear a mensajes localizados sin parsear strings.

Detalle completo del contrato (TypeScript): docs/superpowers/brainstorming/etapa1-arquitecto.md Sección E.
```

- [ ] **Step 4: Crear `.context/DEPENDENCIES.md`**

Contenido:

```markdown
# Dependencias críticas

## Runtime nativas (requieren rebuild por plataforma)

| Paquete | Versión | Propósito | Rebuild |
|---|---|---|---|
| better-sqlite3 | ^11.5.0 | DB local sincrónica | Sí — Electron 39 ABI 127 |
| @abandonware/noble | ^1.9.2-25 | BLE para Aomus My A1 | Sí — validación bloqueante en Fase 0 |
| @thiagoelg/node-printer | ^0.6.2 | Spooler USB Win + CUPS macOS | Sí |
| serialport | ^13.0.0 | BT-SPP fallback | Sí |
| argon2 | ^0.44.0 | Hash PIN admin (D-001) | Sí |

Rebuild se hace con `electron-rebuild -f -w <list>` (script `predev` y `predist`).
asarUnpack en `electron-builder.yml` empaqueta los `.node` correctamente.

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
| zustand | ^5.0.0 | Estado global renderer (D-001 plan v1.1) |
| react / react-dom | ^18.3.1 | UI |
| recharts | ^2.13.0 | Gráficos Estadísticas |
| lucide-react | ^0.460.0 | Iconos stroke 1.5 |
| @fontsource/inter, @fontsource/jetbrains-mono | ^5.1.0 | Fonts self-hosted |

## Dev

Vitest 2 (no Jest), Playwright 1.48 (no spectron — deprecated), electron-builder 25, ESLint 9 flat, Prettier 3.3, TypeScript 5.6.

## Alternativas rechazadas (con razón)

- bcrypt → argon2id (D-001).
- usb npm package directo → CUPS/wmic + serialport + noble (D-003).
- node-thermal-printer como driver único → 3 drivers propios (D-002).
- Storybook → Testing Library + Playwright visual (D-016).
- pnpm → npm (D-012, no monorepo).
- Material UI / Ant / styled-components / Redux → Tailwind + Zustand + componentes propios.
- Webpack → Vite. Jest → Vitest. Spectron → Playwright.

## Política de upgrade

Cualquier cambio de versión major requiere entrada en DECISIONS.md con justificación. Versiones del plan v1.1 son las verificadas estables a mayo 2026.
```

- [ ] **Step 5: Verificar archivos creados**

```bash
ls -la .context/
```

Expected: 4 archivos .md presentes.

- [ ] **Step 6: Commit**

```bash
git add .context/
git commit -m "docs: add .context/ initial files (PROJECT, ARCHITECTURE, API_CONTRACTS, DEPENDENCIES)"
```

---

### Task 19: DECISIONS.md con las 21 decisiones

**Files:**
- Create: `wifi-voucher-manager/DECISIONS.md`

- [ ] **Step 1: Crear `DECISIONS.md`**

Contenido completo (las 21 decisiones del spec Sección 2):

```markdown
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

**Decisión:** `@thiagoelg/node-printer` + CUPS/wmic para discovery. `usb` queda opcional para casos avanzados.

**Justificación:** En macOS, libusb directo no funciona sin root (kernel claim de IOUSBMassStorageClass). En Windows, el spooler (`wmic printer`) es la ruta confiable.

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

**Decisión:** repo independiente en `wifi-voucher-manager/`, sin pnpm workspace, sin `@maragon/shared`.

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

**Decisión:** electron-builder con `asarUnpack` explícito para `better-sqlite3`, `@abandonware/noble`, `@thiagoelg/node-printer`, `serialport`, `argon2`. Scripts `predev` y `predist` con `electron-rebuild -f -w <list>`.

**Justificación:** Sin esto, los módulos nativos no cargan desde el `.exe` empaquetado. Patrón en producción en `apps/pos/package.json` de maragon.

---

## D-011 ✅ Activa — Electron 39

**Decisión:** mantener Electron 39.x (plan v1.1). Validar antes que `@abandonware/noble` y `@thiagoelg/node-printer` compilan contra ABI Node 22.20.

**Plan B:** si `electron-rebuild` falla, bajar a Electron 30.x con excepción documentada. La validación bloqueante está en Fase 0 Task 15.

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

## Excepciones registradas

(Ninguna al cierre de Fase 0.)
```

- [ ] **Step 2: Verificar archivo**

```bash
wc -l DECISIONS.md
```

Expected: ~250+ líneas.

- [ ] **Step 3: Commit**

```bash
git add DECISIONS.md
git commit -m "docs: add DECISIONS.md with 21 decisions from spec"
```

---

### Task 20: README.md inicial

**Files:**
- Create: `wifi-voucher-manager/README.md`

- [ ] **Step 1: Crear `README.md`**

Contenido:

```markdown
# WiFi Voucher Manager

App Electron de escritorio para Windows que imprime QR de WiFi en impresora térmica para clientes de un restaurante, y rota automáticamente la contraseña del SSID guest del router secundario.

**Owner:** Okuni Solutions
**Stack:** Electron 39 + React 18 + TypeScript 5.6 + Knex/SQLite + argon2 + node-thermal-printer
**Estado:** En desarrollo (Fase 0 — scaffolding)

## Documentos clave

- `PLAN-TECNICO-WIFI-MANAGER_2.md` (raíz parent) — plan técnico v1.1
- `DECISIONS.md` — bitácora de decisiones (21 entradas al cierre de Fase 0)
- `.context/PROJECT.md` — overview del proyecto
- `.context/ARCHITECTURE.md` — arquitectura Electron + capas + patrón Adapter
- `.context/API_CONTRACTS.md` — contratos IPC main↔renderer
- `.context/DEPENDENCIES.md` — dependencias críticas y alternativas rechazadas
- `docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md` (raíz parent) — spec consolidado

## Setup

### Prerrequisitos

- Node 22.20+ (`.nvmrc` lo declara — usa `nvm use`)
- npm 10+
- En **Windows**: Visual Studio Build Tools 2022 con workload "Desktop development with C++" + Python 3.11. Necesario para compilar nativos (better-sqlite3, argon2, noble, serialport).
- En **macOS**: Xcode Command Line Tools (`xcode-select --install`).

### Install

```bash
npm install
```

Esto dispara también `electron-rebuild` para los 5 nativos (vía `predev` script).

### Dev

```bash
npm run dev
```

Levanta Vite (renderer en localhost:5173) + Electron (main + preload). DevTools se abre en panel separado.

### Validación BLE (Fase 0 bloqueante)

```bash
npm run smoke:noble
```

Confirma que `@abandonware/noble` compila contra ABI de Electron 39 y que el adaptador BT del SO funciona. Sin esto, no se procede a Fase 2.

### Tests

- Unit + integration: `npm run test`
- Watch: `npm run test:watch`
- Coverage: `npm run test:coverage`
- E2E (Playwright contra `.exe` empaquetado): `npm run test:e2e` (skipped sin `WIFI_VOUCHER_TEST_BUILD_PATH`)

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
| `NODE_ENV=test` | activa `MockCredentialStorage` automático |
| `WIFI_VOUCHER_USE_MOCK_STORAGE=1` | fuerza `MockCredentialStorage` (útil dev en Mac sin prompt Keychain) |
| `WIFI_VOUCHER_SKIP_BLE=1` | salta tests que requieren BT adapter (CI) |
| `WIFI_VOUCHER_SKIP_E2E=1` | salta Playwright E2E (CI) |
| `WIFI_VOUCHER_DB_PATH` | override path de DB (default `data.db` en cwd para CLI; en runtime `userData/data.db`) |

## Hardware

- **Impresora**: Aomus My A1 (BLE) en producción inicial. Identifier `<peripheralId>|<svcUuid>|<charUuid>`. Soporta también EPSON TM-T20 (USB) y cualquier ESC/POS-compatible vía discovery.
- **Router secundario**: TP-Link Archer C24 o A6 v3 (cliente lo compra en Fase 4). Adapter HTTP propio porque librerías npm están abandonadas.

## Soporte

30 días post-go-live. Reportar issues a Okuni Solutions.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup + run instructions"
```

---

### Task 21: Final verification gate (todos los comandos en verde)

**Files:**
- (no nuevos archivos)

- [ ] **Step 1: Limpiar artefactos de build**

```bash
rm -rf dist dist-electron dist-installer coverage
```

- [ ] **Step 2: Reinstalar deps fresh para validar lockfile**

```bash
rm -rf node_modules
npm install
```

Expected: exit 0. Tiempo: 1-3 min.

- [ ] **Step 3: Correr todos los gates en secuencia**

```bash
npm run lint && npm run type-check && npm run test && npm run build
```

Expected: cada comando exit 0.

Si cualquiera falla, **detente** y diagnostica. No avances al siguiente step.

- [ ] **Step 4: Correr smoke noble (re-validación)**

```bash
npm run smoke:noble
```

Expected: stdout `[smoke-noble] VALIDACIÓN BLE: OK`, exit 0.

- [ ] **Step 5: Correr predist (rebuild + build + verify-csp + sanitize)**

```bash
npm run predist
```

Expected: exit 0. Concatena varios pasos — si falla, los logs identifican cuál.

- [ ] **Step 6: Verificar contadores finales del repo**

```bash
echo "Tests:"; npm run test 2>&1 | grep -E "(Tests|Test Files)"
echo "Files in src:"; find src -name "*.ts" -o -name "*.tsx" | wc -l
echo "Lines DECISIONS.md:"; wc -l DECISIONS.md
echo "Migrations:"; ls src/main/db/migrations/ | grep -v gitkeep | wc -l
echo "Commits Fase 0:"; git log --oneline | wc -l
```

Expected (orden de magnitud):
- Tests: 5 passing total (2 smoke + 2 db-connection + 1 argon2)
- Files in src: ~10 archivos .ts/.tsx
- Lines DECISIONS.md: 250+
- Migrations: 0 (las primeras llegan en Fase 1)
- Commits Fase 0: ~20

- [ ] **Step 7: Tag de Fase 0 + commit final**

```bash
git tag -a fase-0-complete -m "Fase 0: scaffolding + validación bloqueante BLE OK"
git commit --allow-empty -m "milestone: Fase 0 completa — gates en verde, BLE validado, listo para Fase 1"
```

Expected: tag y commit creados. `git log --oneline | head -3` muestra los últimos commits.

---

## Self-Review

Reviewing this plan against the spec:

**1. Spec coverage (Sección 5 Fase 0 del spec):**
- ✅ Estructura de directorios → Task 6 (main), Task 9 (preload), Task 5 (renderer), Task 12 (db), Task 16 (scripts), Task 18 (.context/)
- ✅ `package.json` con deps exactas → Task 2
- ✅ 4 tsconfigs → Task 3
- ✅ `vite.config.ts` con plugin csp-swap → Task 5
- ✅ `electron-builder.yml` con asarUnpack → Task 11
- ✅ `vitest.config.ts` thresholds escalonados → Task 8
- ✅ `playwright.config.ts` → Task 9
- ✅ `eslint.config.mjs` flat config → Task 4
- ✅ `.github/workflows/ci.yml` matriz mac/linux/win → Task 10
- ✅ `.context/{PROJECT,ARCHITECTURE,API_CONTRACTS,DEPENDENCIES}.md` → Task 18
- ✅ `DECISIONS.md` con 21 decisiones → Task 19
- ✅ **Validación bloqueante noble (Hardware Q9)** → Task 15
- ✅ Criterio aceptación: `npm run dev` levanta Hello World → Task 7
- ✅ Criterio aceptación: `npm run build` produce `.exe` → Tasks 11+17 (Task 17 valida pipeline; el `.exe` real en Win11 vía RDP es validación manual de Task 21 step 5 cuando `electron-builder` se ejecuta — en macOS local solo `npm run build` se valida)
- ✅ Criterio aceptación: lint + type-check exit 0 → Task 21
- ✅ Criterio aceptación: electron-rebuild limpio para 5 nativos → Tasks 13-15

**2. Placeholder scan:**
Sin "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "similar to Task N". Todos los steps muestran código exacto o comandos exactos.

**3. Type consistency:**
- `createConnection({ filename })` (Task 12) consistente entre tests y CLI.
- `runMigrations(db)` retorna `MigrationResult` con `batchNo, filesApplied` consistente.
- CSP constants `PROD_CSP` y `DEV_CSP` definidas en `src/main/security/csp.ts` (Task 6) y duplicadas en `vite.config.ts` (Task 5) — esto es intencional porque son contextos distintos (main vs Vite plugin). Documentar como nota: única source of truth en TypeScript es `csp.ts`; el `vite.config.ts` tiene copia idéntica que se valida por test post-build (Task 16 verify-csp).
- `noble.state` accedido vía cast `(noble as unknown as { state: string }).state` consistente entre `smoke-noble.ts` y futuro `ble-driver.ts` (Fase 2).

**4. Dependencias entre tasks:**
- Tasks 1-3 son setup base (sin dependencias inversas).
- Task 4 (ESLint) depende de Task 3 (tsconfigs).
- Tasks 5-7 (vite + main + dev) dependen de Task 2-3.
- Task 8 (vitest) depende de Task 3 + 4.
- Task 9 (Playwright) depende de Task 2.
- Task 10 (CI) referencia scripts existentes — independiente.
- Task 11 (electron-builder) depende de Task 5 + 6.
- Tasks 12-14 (DB + native rebuilds) dependen de Task 2.
- **Task 15 (BLE BLOQUEANTE) depende de Task 14.** Si falla, replan con Electron 30.
- Task 16 (predist scripts) depende de Task 11.
- Task 17 (build E2E) integra Tasks 5+6+11+16.
- Tasks 18-20 (docs) son independientes — pueden hacerse en paralelo.
- Task 21 (final gate) integra todas.

Plan limpio, ejecutable, ~21 tasks con ~140 steps totales.

---

## Notas de ejecución

**Mac dev → Win11 validation:** la mayor parte del plan corre en Mac. **Task 15 step 4** y la validación final del `.exe` (Task 11 + 17) requieren RDP a Win11. El ejecutor debe sincronizar el repo a la Dell vía git remoto (preferido) o Samba.

**Si Task 15 falla:** Plan B (Electron 30):
1. En `package.json`: cambiar `electron` a `^30.5.0` y `@types/node` a `^20.0.0`. `engines.node` a `>=20.18.0 <21`.
2. Borrar `package-lock.json` y `node_modules/`.
3. `npm install`.
4. Re-correr Tasks 14-15.
5. Documentar excepción en `DECISIONS.md` como `## D-011 Excepción: Electron downgrade 39→30 por incompatibilidad ABI noble (2026-05-XX)`.

**Cierre de fase:** tras Task 21 exitosa, abrir PR a `main` con título "Fase 0: scaffolding completo + BLE validado". Code review por orquestador antes de mergear. Tag `fase-0-complete` queda fijo.

**Próximo paso:** invocar `/writing-plans` con la **Fase 1** (QRService + WaiterView básica + DB scaffolding) usando este mismo spec como entrada.
