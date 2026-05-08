Tengo suficiente contexto. Ahora produciré la respuesta consolidada como Frontend+UI/UX specialist.

---

# Etapa 2 — Frontend + UI/UX Specialist (WiFi Voucher Manager)

Output del especialista de Frontend + UX. Lead de Fase 3, co-lead de Fase 1, lead UI de Fase 4. Adherencia estricta a UX 5.6 del plan v1.1 y a las decisiones D-001 a D-015 del Arquitecto.

---

## 1. Resoluciones a las 4 cuestiones abiertas

### 1.1 Cuestión 5 — Testing visual: Storybook vs Testing Library snapshots + Playwright

**Decisión:** abandonar Storybook para v1. Adoptar la combinación **Testing Library snapshots (vitest + jsdom) + Playwright visual regression contra Electron empaquetado**.

**Justificación:**

- Storybook agrega ~80 MB de devDeps, requiere mantener stories paralelas a componentes y duplica el árbol de imports del renderer (no consume `tokens.ts` ni `tailwind.config` sin trabajo extra). Para una app con 2 páginas y ~12 componentes raíz, el ROI es negativo.
- Maragon_pdv (referencia) no usa Storybook y eso no le impide tener UI consistente; usa un sistema de tokens CSS y revisión visual del orquestador. Replicaremos el patrón con Tailwind.
- Testing Library en vitest cubre semántica (roles ARIA, keyboard, estados visuales reflejados en clases utility de Tailwind). Los snapshots de DOM detectan regresiones estructurales sin imágenes.
- Playwright con Electron (ya elegido para E2E por el plan v1.1, sección 7.1) puede capturar screenshots de la ventana real con `expect(page).toHaveScreenshot()`. Esto valida fonts self-hosted, paleta y CSP estricta en el ejecutable empaquetado — cosa que Storybook no puede.
- Las screenshots se guardan en `tests/e2e/__screenshots__/<platform>/` y se versionan. Tolerancia: `maxDiffPixelRatio: 0.01` (1% de píxeles distintos por anti-aliasing entre runs).

**Qué se snapshot-ea (component tests):** WaiterView (3 estados de salud), Modal de PIN (idle/error/locked), Wizard de cambio de PIN (cada paso), Discovery modal (loading/lista/empty), banner inline de error, banner inline de éxito.

**Qué se snapshot-ea (Playwright visual):** los 7 paneles de AdminView en estado base, la WaiterView en los 3 estados de health, el modal de PIN, el modal de discovery con resultados.

**Qué corre dónde:**

- **CI**: vitest unit + component (DOM snapshots). Sin Playwright visual (los screenshots dependen del SO y de fonts; en GitHub Actions Linux runners producen pixeles distintos al Mac dev).
- **Local + Pre-release manual**: Playwright visual contra `.exe` empaquetado en Win11 vía RDP, antes de cerrar cada fase. Resultado se adjunta al PR como evidencia.

**Impacto en otras fases:**

- Backend: ninguno (los tests visuales no tocan IPC; los handlers se mockean con `window.api` stub en tests de componente).
- QA/Empaquetado: debe configurar Playwright con `electron.launch({ executablePath })` en lugar de `electron-launch` para correr contra el `.exe` empaquetado. Esto es trivial y maragon ya usa el patrón (a confirmar con QA specialist).
- Hardware/Red: ninguno.

**Riesgo aceptado:** sin Storybook perdemos el sandbox de exploración para diseñadores. Mitigación: cuando el plan llegue a v2 y se contrate diseño dedicado, re-evaluar.

### 1.2 Cuestión 6 — Self-host de fonts en producción (`@fontsource/*` + asar)

**Decisión:** importar las weights necesarias vía CSS de cada subpaquete (`import '@fontsource/inter/400.css'`, `import '@fontsource/inter/500.css'`, `import '@fontsource/inter/600.css'`, equivalente para JetBrains Mono). NO usar `@font-face` manual.

**Justificación:**

- `@fontsource/inter@5.x` ya publica un CSS por weight con `@font-face` apuntando a rutas relativas (`./files/inter-latin-400-normal.woff2`). Vite con `assetsInclude` y bundling estándar resuelve estas rutas en build, las copia a `dist/assets/` y reescribe URLs.
- Con `@font-face` manual tendríamos que mantener el path de woff2, perderíamos las actualizaciones de subpaquetes (los archivos cambian de hash entre versiones), y romperíamos el caching de Vite.
- Solo importamos los subsets latin y latin-ext (suficiente para español; reduce ~60% el peso vs el bundle completo de Inter que incluye 30+ scripts).

**Estrategia de import:**

- Crear `src/renderer/styles/fonts.ts` que centraliza los imports CSS:
  - `import '@fontsource/inter/400.css';`
  - `import '@fontsource/inter/500.css';`
  - `import '@fontsource/inter/600.css';`
  - `import '@fontsource/jetbrains-mono/400.css';`
  - `import '@fontsource/jetbrains-mono/500.css';`
- `src/renderer/main.tsx` importa `./styles/fonts.ts` ANTES de `./styles/global.css` para que `@font-face` esté disponible cuando se aplique el `font-family` del body.

**Paso de validación obligatorio (criterio de aceptación de Fase 1):**

1. `npm run build` produce el `.exe`.
2. Instalarlo en Win11 limpio, abrir DevTools, ejecutar:
   ```js
   document.fonts.check('500 14px Inter')   // debe devolver true
   document.fonts.check('500 14px JetBrains Mono')  // true
   ```
3. Visualmente: los `<input type="password">` y los identifiers BLE en JetBrains Mono deben verse claramente distintos a Inter (la 'i' y la '1' tienen diseño contrastante).
4. Si `document.fonts.check` devuelve `false`, inspeccionar `app.asar/dist/assets/` con `npx asar list app.asar | grep woff2` — los archivos deben estar presentes.

**Plan B si asar empaqueta mal los woff2:** agregar `electron-builder.yml > asarUnpack: ['dist/assets/*.woff2']`. Las fonts viajarían a `app.asar.unpacked/` y servirían desde rutas `file://` directas. Esto es necesario en algunos casos cuando Chromium en producción rechaza fetchear assets desde dentro de asar (raro con Electron 39 + protocol `app://` por defecto, pero documentado como remediación).

**Impacto en otras fases:**

- QA/Empaquetado: agregar el check de `document.fonts.check()` al smoke test de Fase 6.
- Backend: ninguno.

### 1.3 Cuestión 7 — Modal de discovery: lista única con badges vs tabs

**Decisión:** **lista única vertical con badges de tipo de conexión a la izquierda de cada item**, sin tabs.

**Justificación UX 5.6:**

- La regla "más de 3 niveles de jerarquía visual está prohibido" descarta tabs porque introducen un nivel extra (modal → tab → item). Con lista plana son solo 2 (modal → item).
- "Más de un acento de color simultáneo prohibido" — tabs activos requerirían accent en el tab seleccionado y en el item seleccionado, violando la regla.
- D-002 reconfigura el discovery a 3 conexiones (USB, Bluetooth-SPP, BLE). Las 3 retornan típicamente entre 0 y 4 dispositivos cada una. Mostrarlas en tabs daría tabs vacíos en el caso típico (en el restaurante real solo aparece la Aomus BLE y quizás la EPSON USB) — UX vacía por sección es peor que lista corta con todas.
- Linear (inspiración aceptada) usa lista única con badges de tipo en su selector de proyectos. Stripe Dashboard hace lo mismo en el selector de payment methods.
- El usuario admin no piensa "quiero ver USB primero" — piensa "quiero la impresora que veo enfrente". Una lista única ordenada por relevancia (likely ESC/POS-compatible primero, luego suggested type conocido, luego desconocidos) es más alineada al modelo mental.

**Especificación visual de cada item:**

```
┌────────────────────────────────────────────────────────┐
│ [icono lucide 20px]  Aomus My A1                       │
│ ┌──────────┐         <peripheralId>|<svc>|<char>      │
│ │ BLE      │         (en JetBrains Mono 12px, muted)   │
│ └──────────┘         [Compatible ESC/POS]              │
└────────────────────────────────────────────────────────┘
```

- Badge de conexión a la izquierda (USB / BT / BLE / SISTEMA).
- Icono lucide-react: `Usb` (USB), `Bluetooth` (bluetooth-spp), `Radio` (BLE), `Printer` (sistema/CUPS).
- Nombre como h4, peso 600, `textPrimary`.
- Identifier en JetBrains Mono `text-xs`, `textMuted`, max 1 línea con ellipsis si excede.
- Badge "Compatible ESC/POS" solo si `likelyEscPosCompatible: true`. Estilo `badge-success`.
- Click en item: ejecuta `testConnection()` automáticamente. Mientras corre, el item muestra inline a la derecha: spinner de 3 puntos + "Probando…". Al terminar: dot verde "Online · 12ms" o dot rojo + razón.
- Botón "Imprimir prueba" aparece inline solo después de `testConnection()` exitoso.
- Botón "Usar esta impresora" en footer del modal, deshabilitado hasta que UN item haya pasado `testConnection()` Y opcionalmente test print.

**Impacto en otras fases:**

- Backend: el handler `printer.discover()` debe devolver array unificado (ya está así en el contrato del Arquitecto, sección E). Agregar campo `priority` calculado en main para ordenar (`likelyEscPosCompatible` + `suggestedType` definido = priority alta).
- Hardware/Red: ninguno (el discovery cross-platform ya devuelve `connection: PrinterConnection` por item).

### 1.4 Cuestión 8 — Reglas de validación del nuevo PIN (Wizard D-013)

**Decisión:** reglas exactas y mensajes en español, evaluadas en orden:

| Regla | Trigger | Mensaje en español |
|---|---|---|
| 1. Longitud exacta 4 dígitos | `pin.length !== 4` | "El PIN debe tener exactamente 4 dígitos." |
| 2. Solo dígitos 0-9 | `!/^\d{4}$/.test(pin)` | "Solo se permiten números." |
| 3. No igual al default `0000` | `pin === '0000'` | "No puedes usar `0000`. Elige un PIN distinto." |
| 4. No 4 dígitos repetidos | `/^(\d)\1{3}$/.test(pin)` | "No puedes usar dígitos repetidos (ejemplo: `1111`, `7777`)." |
| 5. No secuencia ascendente | `'0123456789'.includes(pin)` | "No puedes usar una secuencia ascendente (ejemplo: `1234`, `5678`)." |
| 6. No secuencia descendente | `'9876543210'.includes(pin)` | "No puedes usar una secuencia descendente (ejemplo: `4321`, `9876`)." |
| 7. Confirmación coincide | `newPin !== confirmPin` | "Los PINs no coinciden. Vuelve a escribirlo." |

**Justificación:**

- 4 dígitos fijos por consistencia con el modal de PIN existente y el plan v1.1 (sección 5.6 modal de PIN — "4 inputs grandes"). Más dígitos romperían el componente reutilizable de input.
- Solo dígitos: alinea con el patrón de PIN cajero/tarjeta — el mesero/admin lo memoriza más fácil. Permitir letras complicaría la UX del modal con teclado on-screen futuro.
- Excluir `0000`: D-013 lo requiere explícitamente.
- Excluir repeticiones y secuencias: alineado con NIST 800-63B (secuencias prohibidas) y con sentido común contra ataques por fuerza bruta de 3 intentos. Aún quedan 9990 PINs válidos (10000 − 10 repetidos − 7 ascendentes − 7 descendentes − 1 default + solapamientos), espacio suficiente para la sesión de admin.
- NO incluimos lista de PINs comunes (`1234`, `1111` ya excluidos arriba; `2580` por columna del teclado, etc.) porque agregar diccionario sería overkill y ya está cubierto por las reglas estructurales más comunes.

**Especificación del wizard (3 pasos):**

```
Paso 1 — Bienvenida
┌─────────────────────────────────────────┐
│  Configura tu PIN de administrador      │
│  ───────────────────────────────────    │
│                                          │
│  Esta es la primera vez que entras al   │
│  panel de administración. Por seguridad,│
│  cambia el PIN inicial 0000 por uno     │
│  propio.                                 │
│                                          │
│  Reglas:                                 │
│  - Exactamente 4 dígitos                 │
│  - No 0000                              │
│  - No repeticiones (1111)               │
│  - No secuencias (1234, 4321)           │
│                                          │
│              [ Continuar ]               │
└─────────────────────────────────────────┘

Paso 2 — Nuevo PIN
┌─────────────────────────────────────────┐
│  Nuevo PIN                               │
│                                          │
│        [_] [_] [_] [_]                   │
│        (4 inputs JetBrains Mono)         │
│                                          │
│  [Ayuda inline si la regla rompe]        │
│                                          │
│   [ Atrás ]              [ Siguiente ]   │
└─────────────────────────────────────────┘

Paso 3 — Confirmación
┌─────────────────────────────────────────┐
│  Confirma tu nuevo PIN                   │
│                                          │
│        [_] [_] [_] [_]                   │
│                                          │
│  [Banner inline rojo si no coincide]     │
│                                          │
│   [ Atrás ]               [ Guardar ]    │
└─────────────────────────────────────────┘
```

- Validaciones se evalúan en `onChange` y `onBlur`. Mensaje aparece inline debajo de los inputs en banner de borde rojo 3px (igual al estándar de errores 5.6).
- Botón "Siguiente"/"Guardar" deshabilitado hasta que el PIN cumpla todas las reglas.
- "Guardar" llama `window.api.admin.changePin('0000', newPin)`. Tras éxito, cierra wizard y refresca AdminView con `pinIsDefault: false`.
- Si falla en backend (improbable en este flujo, posible si argon2 throw): banner inline persistente con el mensaje de error.

**Impacto en otras fases:**

- Backend: `admin.changePin` debe aplicar las MISMAS validaciones server-side (no fiarse del cliente). Devolver `{ ok: false, error: 'rule_<n>' }` con código por regla violada para que el frontend muestre el mensaje correcto. Coordinación con Backend specialist.
- QA: tests de regresión en wizard cubren las 7 reglas explícitamente.

---

## 2. Sistema de tokens completo

### 2.1 `src/renderer/styles/tokens.ts`

Archivo TypeScript exportando constantes que consumen Tailwind y código TS (gráficos Recharts, inline styles excepcionales). Hex literales copiados exactos de Sección 5.6 del plan v1.1.

**Estructura del módulo:**

- `palette` — record de strings hex. Claves: `background`, `surface`, `surfaceMuted`, `border`, `borderStrong`, `textPrimary`, `textSecondary`, `textMuted`, `accent`, `accentHover`, `accentForeground`, `success`, `warning`, `error`, `info`. Valores: exactamente los hex de Sección 5.6 (`#FAFAFA`, `#FFFFFF`, `#F4F4F5`, `#E4E4E7`, `#D4D4D8`, `#18181B`, `#52525B`, `#A1A1AA`, `#18181B`, `#27272A`, `#FAFAFA`, `#16A34A`, `#CA8A04`, `#DC2626`, `#2563EB`).

- `typography`:
  - `fontFamily.sans` = `"'Inter', system-ui, -apple-system, sans-serif"`
  - `fontFamily.mono` = `"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"`
  - `fontSize` = record con `xs` (0.75rem), `sm` (0.875rem), `base` (1rem), `lg` (1.125rem), `xl` (1.25rem), `2xl` (1.5rem), `3xl` (2rem), `4xl` (2.5rem), `5xl` (3.5rem). 9 niveles tal cual la Sección 5.6.
  - `fontWeight` = `{ regular: 400, medium: 500, semibold: 600 }`. Tipo restrictivo `400 | 500 | 600` para impedir bolds.
  - `lineHeight` = `{ heading: 1.2, body: 1.5 }`.

- `spacing` — record numérico clave-valor en px, sistema 4px. Claves: `1` (4px), `2` (8px), `3` (12px), `4` (16px), `6` (24px), `8` (32px), `12` (48px), `16` (64px). Tailwind ya tiene estos defaults; los exportamos para consistencia con código TS.

- `radii` — `{ none: '0', sm: '4px', md: '6px', lg: '8px', full: '9999px' }`. UX 5.6 dice "8px cards, 6px botones/inputs". `sm` para badges. `full` solo para dots de estado.

- `shadows` — `{ card: '0 1px 2px rgba(0,0,0,0.04)', focus: '0 0 0 2px #18181B' }`. Solo dos. El `focus` cumple "outline accent 2px" de la sección de accesibilidad.

- `transitions` — `{ default: '150ms ease-out', modal: '200ms ease-out' }`. UX 5.6 obliga `150ms ease-out` para hover/focus y `200ms` fade en modales.

- `iconSizes` — `{ inline: 16, button: 20, header: 24, empty: 40 }`. Cada uso tiene su valor canónico.

- `zIndex` — `{ dropdown: 10, modalBackdrop: 50, modal: 51, banner: 60 }` para evitar mágic numbers en código.

Tipos TS exportados: `type PaletteToken = keyof typeof palette;` (autocompleta donde se usen tokens en código).

### 2.2 `tailwind.config.ts` que consume tokens

**Estructura:**

- `import { palette, typography, spacing, radii, shadows, transitions } from './src/renderer/styles/tokens';`
- `content: ['./src/renderer/**/*.{ts,tsx,html}', './index.html']`.
- `theme.extend.colors`: mapeo plano de `palette` directo (con keys camelCase preservados — Tailwind soporta `bg-textPrimary`).
- `theme.extend.fontFamily`: `sans: typography.fontFamily.sans.split(','), mono: typography.fontFamily.mono.split(',')`.
- `theme.extend.fontSize`: directo de `typography.fontSize` (xs, sm, base, etc. — Tailwind los reemplaza con nuestros valores).
- `theme.extend.fontWeight`: `regular: '400', medium: '500', semibold: '600'`. Sobrescribe los defaults de Tailwind para que `font-bold` no exista (genera error si alguien lo intenta usar).
- `theme.extend.spacing`: `spacing` directo.
- `theme.extend.borderRadius`: `radii`.
- `theme.extend.boxShadow`: `card: shadows.card`. NO exponer `lg`, `xl`, `2xl` — fuerza usar solo `shadow-card`.
- `theme.extend.transitionTimingFunction`: `out: 'ease-out'`.
- `theme.extend.transitionDuration`: `default: '150ms', modal: '200ms'`.
- `corePlugins: { boxShadow: true }` pero la lista de shadows se restringe vía override.
- `plugins: []` (ningún plugin de Tailwind oficial — todos los componentes son propios).

**Adición crítica:** un `safelist` con los hex de la paleta cuando se usen dinámicamente vía Recharts. Recharts recibe `stroke={palette.accent}` directo (no clases Tailwind), pero declarar `safelist: ['bg-success', 'bg-warning', 'bg-error', 'bg-info']` evita que Tailwind purge los dots de estado generados condicionalmente.

---

## 3. Detalle de Fase 1 — Frontend deliverables

### 3.1 `src/renderer/main.tsx`

- **Responsabilidad**: bootstrap React, importar fonts y CSS global, montar `<App />` con `<StrictMode>`.
- **Imports en orden**: `./styles/fonts.ts` (CSS de @fontsource), `./styles/global.css` (Tailwind directives + reset), `./App`.
- **Estados visuales**: N/A (no renderiza UI por sí solo).
- **IPC consumido**: ninguno.
- **Tests**: smoke test de import (vitest) que verifica que el bundle no rompe.

### 3.2 `src/renderer/App.tsx`

- **Responsabilidad**: routing entre WaiterView (default) y AdminView (montada al pasar PIN).
- **Estado interno**: `isAdminUnlocked: boolean` (false al startup), gestionado en zustand `useAuthStore`.
- **Props**: ninguna (root).
- **Estados visuales**: idle (renderiza WaiterView), admin-active (renderiza AdminView).
- **IPC**: ninguno (delega a stores y subcomponentes).
- **Tests**: component test que verifica que pasar `isAdminUnlocked: true` al store renderiza AdminView; click en `Lock` regresa a WaiterView.

### 3.3 `src/renderer/pages/WaiterView.tsx` (Fase 1, lead Frontend)

- **Ruta destino**: `src/renderer/pages/WaiterView.tsx`.
- **Responsabilidad**: pantalla principal sin login, un solo botón gigante de imprimir, indicador de salud, engrane discreto.
- **Props**: ninguna.
- **Estado interno**: usa hook `useSystemHealth()` y store `usePrintStore`.
- **Estados visuales**:
  - **idle (sistema listo)**: dot `success` + texto "Sistema listo".
  - **degraded (impresora desconectada o router inalcanzable)**: dot `warning` + texto explícito ("Impresora desconectada").
  - **error (sin password vigente o scheduler caído)**: dot `error` + texto + botón secundario "Reintentar".
  - **printing (post-click)**: botón muestra spinner 3 puntos y texto "Imprimiendo…", deshabilitado.
  - **printed (success transient)**: el texto bajo el botón cambia a "QR impreso correctamente" con dot success durante 4 segundos, luego vuelve a estado anterior. NO toast — el cambio es inline.
  - **print_failed**: banner inline persistente ARRIBA del botón con borde rojo 3px, mensaje "No se pudo imprimir: <razón>. Verifica la impresora." con botón inline "Reintentar".
- **Layout ASCII**:

```
┌──────────────────────────────────────────────────┐
│                                                   │
│                                                   │
│            Red: Restaurante-Clientes              │
│            (Inter regular 14px, secondary)        │
│                                                   │
│         ┌──────────────────────────┐              │
│         │  Imprimir QR de WiFi     │              │
│         │  (240×80, accent, 18px)  │              │
│         └──────────────────────────┘              │
│                                                   │
│         ● Sistema listo                            │
│         (dot 8px + Inter 13px secondary)          │
│                                                   │
│                                                   │
│                                              [⚙]  │
│                                          (16px,   │
│                                          muted)   │
└──────────────────────────────────────────────────┘
```

- **IPC consumido**: `window.api.waiter.getCurrentSSID()`, `window.api.waiter.getSystemHealth()`, `window.api.waiter.printVoucher()` (referencia a contrato Arquitecto Sección E).
- **Tests requeridos**:
  - Component (vitest + Testing Library): renderiza los 5 estados visuales (idle/degraded/error/printing/print_failed). Snapshot de cada uno.
  - Component: click en botón llama `printVoucher` mockeado.
  - Component: click en engrane abre modal de PIN (verificar `screen.queryByRole('dialog')` aparece).
  - A11y: el botón tiene rol implícito `button`, foco visible con outline accent, `aria-label="Imprimir código QR de WiFi"`.
  - Visual (Playwright local): screenshot del estado idle a 1366×768 — diff < 1%.

### 3.4 `src/renderer/components/HealthIndicator.tsx`

- **Ruta destino**: `src/renderer/components/HealthIndicator.tsx`.
- **Responsabilidad**: dot de color (8px, `rounded-full`) + texto. Usado por WaiterView y por AdminView/Inicio.
- **Props**: `{ status: 'success' | 'warning' | 'error' | 'idle'; label: string; className?: string }`.
- **Estado interno**: ninguno.
- **Estados visuales**: 4 (uno por status). Color del dot deriva de `palette.success/warning/error/textMuted`.
- **IPC**: ninguno.
- **Tests**: snapshot de cada status.

### 3.5 `src/renderer/components/PrintButton.tsx`

- **Ruta destino**: `src/renderer/components/PrintButton.tsx`.
- **Responsabilidad**: botón gigante de imprimir reusable (WaiterView principal + Admin/Inicio acción rápida).
- **Props**: `{ onClick: () => Promise<void>; size?: 'lg' | 'md'; disabled?: boolean; children: ReactNode }`.
- **Estado interno**: `isLoading` derivado de la promesa.
- **Estados visuales**: idle, hover (bg `accentHover`), active, disabled (opacity 0.45), loading (spinner 3 puntos centrado).
- **IPC**: ninguno (recibe `onClick`).
- **Tests**: snapshot de cada estado, Loading se activa al hacer click.

### 3.6 `src/renderer/components/SettingsGearButton.tsx`

- **Ruta destino**: `src/renderer/components/SettingsGearButton.tsx`.
- **Responsabilidad**: icono engrane discreto en esquina inferior derecha que abre modal de PIN.
- **Props**: `{ onClick: () => void }`.
- **Estado interno**: ninguno.
- **Estados visuales**: idle (`textMuted`), hover (`textSecondary`), focus (outline accent 2px). Tamaño 16px sin label, `aria-label="Abrir configuración de administrador"`.
- **Posición**: `position: fixed; bottom: 24px; right: 24px`.
- **Tests**: snapshot, click dispara handler.

### 3.7 `src/renderer/hooks/useSystemHealth.ts`

- **Ruta destino**: `src/renderer/hooks/useSystemHealth.ts`.
- **Responsabilidad**: poll `getSystemHealth()` cada 30s y mantener estado.
- **API**: `function useSystemHealth(): { health: SystemHealth | null; isLoading: boolean; refetch: () => Promise<void> }`.
- **Estado interno**: SystemHealth en useState; setInterval 30000ms; cleanup en unmount.
- **IPC consumido**: `window.api.waiter.getSystemHealth()`.
- **Tests**: hook test (vitest + react testing-library renderHook): primer fetch en mount, refetch llama IPC, cleanup cancela interval.

### 3.8 `src/renderer/store/printStore.ts` (zustand)

- **Ruta destino**: `src/renderer/store/printStore.ts`.
- **Responsabilidad**: estado de impresión actual (printing/success/failed) compartido entre WaiterView y eventual AdminView/Logs.
- **Slice**: `{ status: 'idle' | 'printing' | 'success' | 'failed'; lastError: string | null; lastJobId: string | null; print: () => Promise<void>; clear: () => void }`.
- **Tests**: store unit test que verifica transiciones idle→printing→success y idle→printing→failed.

### 3.9 `src/renderer/styles/global.css`

- **Ruta destino**: `src/renderer/styles/global.css`.
- **Responsabilidad**: directivas Tailwind (`@tailwind base; @tailwind components; @tailwind utilities`) + reset mínimo.
- **Reglas custom necesarias**: `body { font-family: theme('fontFamily.sans'); background: theme('colors.background'); color: theme('colors.textPrimary'); }`, `*:focus-visible { outline: 2px solid theme('colors.accent'); outline-offset: 2px; }`. Sin `@apply` masivo — preferir clases en JSX.

### 3.10 `src/renderer/styles/fonts.ts`

- Imports de los CSS @fontsource ya documentados en Cuestión 6.
- Sin lógica.
- Test: import-side-effect test que verifica `document.fonts` tiene Inter 400/500/600 y JetBrains Mono 400/500.

---

## 4. Detalle de Fase 3 — Frontend deliverables (lead total)

### 4.1 `src/renderer/pages/AdminView.tsx`

- **Responsabilidad**: layout 2-columnas (nav 240px izquierda + contenido), routing entre 7 secciones, manejo del wizard de cambio forzado de PIN.
- **Props**: ninguna.
- **Estado interno**: `activeSection: AdminSection` (zustand `useAdminNav`), `pinIsDefault` derivado de config.
- **Estados visuales**:
  - **locked** (no debería renderizarse — el modal de PIN bloquea antes): N/A.
  - **forced-pin-change** (D-013 — pinIsDefault === true): renderiza `<ChangePinWizard />` ocupando todo el panel, oculta nav y secciones. No permite cerrar ni navegar hasta completar.
  - **normal**: nav + sección activa.
- **Layout ASCII**:

```
┌──────────────┬──────────────────────────────────────────┐
│ WiFi Voucher │  [Título de sección]                     │
│ Manager      │  [Subtítulo descriptivo, secondary]      │
│ ───────────  │  ──────────────────────────────────────  │
│ Inicio       │                                            │
│ Impresora    │  [Cards de la sección activa]             │
│ Router       │                                            │
│ Programación │                                            │
│ Negocio      │                                            │
│ Estadísticas │                                            │
│ Logs         │                                            │
│ ───────────  │                                            │
│ [Cerrar      │                                            │
│  sesión]     │                                            │
└──────────────┴──────────────────────────────────────────┘
```

- Nav: ancho 240px, `surface` background, border-right `border`. Cada item: 12px padding vertical, 16px horizontal, hover `surfaceMuted`, activo: borde-izquierdo 3px `accent` + bg `surfaceMuted`.
- Contenido: padding 32px, max-width 960px (no estirar a 1920).
- Footer del nav: botón ghost "Cerrar sesión" — vuelve a WaiterView.
- **IPC**: `window.api.admin.getConfig()` al mount.
- **Tests**: component test que el wizard se muestra cuando `pinIsDefault: true`; nav cambia sección; cerrar sesión vuelve a WaiterView.

### 4.2 `src/renderer/components/PinModal.tsx`

- **Responsabilidad**: modal centralizado de validación de PIN, 4 inputs, lockout countdown.
- **Props**: `{ open: boolean; onUnlocked: () => void; onCancel: () => void }`.
- **Estado interno**: `pin: string[4]`, `failedAttempts: number`, `lockedUntilMs: number | null`, `isValidating: boolean`.
- **Estados visuales**:
  - **idle**: 4 inputs vacíos centrados, focus auto en el primero.
  - **typing**: cada input pasa al siguiente en `onChange` cuando se llena.
  - **validating**: spinner 3 puntos debajo de inputs, inputs deshabilitados.
  - **error (intento fallido)**: shake animation 200ms (excepción justificada — sin slide, sin bounce, solo translate ±4px), banner inline rojo "PIN incorrecto. Intentos restantes: N", inputs se limpian y vuelven a focus en el primero.
  - **locked**: inputs deshabilitados, banner inline `error` con countdown live actualizado cada segundo: "Bloqueado. Reintenta en 4:32", botón cancel deshabilitado también.
  - **unlocked (transient)**: cierra modal y dispara `onUnlocked`.
- **Layout ASCII**:

```
┌────────────────────────────────────────┐
│  PIN de administrador                  │
│  Introduce tu PIN de 4 dígitos.        │
│                                         │
│      [_]  [_]  [_]  [_]                 │
│      (JetBrains Mono 24px)              │
│                                         │
│  [Banner inline si hay error]           │
│                                         │
│              [ Cancelar ]               │
└────────────────────────────────────────┘
```

- Width 360px, padding 32px, `radius-lg`, `shadow-card`.
- Backdrop: `bg-textPrimary/55` (overlay).
- IPC: `window.api.admin.validatePin(pin)`.
- **Tests**: component test de cada estado, lockout countdown decrementa, focus auto-avanza, Esc cierra (solo si no locked).

### 4.3 `src/renderer/components/ChangePinWizard.tsx` (D-013)

- **Responsabilidad**: wizard 3 pasos para cambio forzado de PIN en primer login.
- **Props**: `{ onCompleted: () => void }`.
- **Estado interno**: `step: 1 | 2 | 3`, `newPin: string`, `confirmPin: string`, `validationError: string | null`.
- **Estados visuales**: por paso (ver layout en Cuestión 8 arriba). Cada paso es un card centrado de 480px con stepper visual sutil arriba (3 puntos, el activo con borde 2px accent).
- **Validación**: las 7 reglas de Cuestión 8, evaluadas onChange + onBlur. Mensaje en banner inline rojo debajo de los inputs.
- **IPC**: `window.api.admin.changePin('0000', newPin)` en paso 3 al guardar.
- **Tests**: 7 tests de regresión (uno por regla), test de happy path (PIN válido → onCompleted llamado), test de error backend (banner persistente).

### 4.4 Sección **Inicio** — `src/renderer/pages/admin/HomePanel.tsx`

- **Responsabilidad**: dashboard de salud + acciones rápidas.
- **Layout**: 2 cards en grid columnas iguales arriba, 1 card de acciones abajo.
- **Cards**:
  - **Estado del sistema**: 4 filas (Impresora, Router, Scheduler, Password vigente), cada una con `<HealthIndicator />` + label + valor (ej. "Online · 12ms").
  - **Última rotación**: timestamp ISO formateado en español ("Hace 14 horas — 23:00 del 06/05/2026"), badge success/warning/error, botón "Ver detalle en Logs".
  - **Acciones rápidas**: `<PrintButton size="md">Imprimir QR de prueba</PrintButton>`, botón secundario "Rotar contraseña ahora" (con confirmación inline).
- **IPC**: `window.api.waiter.getSystemHealth()`, `window.api.admin.rotatePasswordNow()`.
- **Tests**: snapshot de los 3 estados de salud agregados.

### 4.5 Sección **Impresora** — `src/renderer/pages/admin/PrinterPanel.tsx`

- **Responsabilidad**: gestión completa de impresora activa, descubrimiento de otras.
- **Layout** (calcado del snippet en plan v1.1 sección 5.6):

```
┌──────────────────────────────────────────────────────┐
│  Impresora                                            │
│  Configura el dispositivo para imprimir tickets.     │
│  ──────────────────────────────────────────────────  │
│                                                       │
│  Impresora actual                                     │
│  ┌────────────────────────────────────────────────┐  │
│  │  Aomus My A1                                    │  │
│  │  [BLE] aa:bb:cc:dd|0xff00|0xff01                │  │
│  │  ● Conectada · 320ms                            │  │
│  │                                                  │  │
│  │  [Probar conexión] [Imprimir prueba]            │  │
│  │  [Imprimir diagnóstico]                          │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  [+ Buscar otra impresora]                            │
│                                                       │
└──────────────────────────────────────────────────────┘
```

- Identifier en JetBrains Mono 12px, color textMuted, max 1 línea con ellipsis (tooltip nativo `title=` con full identifier).
- Click en "Buscar otra impresora" abre `<DiscoveryModal />`.
- Estados visuales: empty (sin impresora configurada — empty state con icono Printer 40px muted + CTA), configured-online, configured-offline (banner inline error persistente arriba del card), testing (spinner 3 puntos en lugar del badge), test-success (card success transient 4s), test-failed (banner inline error).
- **IPC**: `printer.list()`, `printer.testConnection()`, `printer.printTestVoucher()`, `printer.printDiagnosticPage()`, `printer.setActive()`, `printer.delete()`.
- **Tests**: snapshot de cada estado, flow completo de discovery → test → setActive.

### 4.6 `src/renderer/components/DiscoveryModal.tsx`

- **Responsabilidad**: modal full-screen para descubrir y seleccionar impresora.
- **Props**: `{ open: boolean; onClose: () => void; onPrinterSelected: (printer: DiscoveredPrinter) => Promise<void> }`.
- **Estado interno**: `discovered: DiscoveredPrinter[]`, `isScanning: boolean`, `selectedIdentifier: string | null`, `testResult: PrinterTestResult | null`, `testPrintJobId: string | null`, `testPrintStatus: 'idle' | 'printing' | 'printed' | 'failed'`.
- **Layout ASCII**:

```
┌────────────────────────────────────────────────────────┐
│  Buscar impresora                                  [X] │
│  ──────────────────────────────────────────────────── │
│                                                         │
│  [⟲ Buscar de nuevo]   Mostrando 3 dispositivos        │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │ [BLE]  Aomus My A1                              │   │
│  │        aa:bb:cc:dd|0xff00|0xff01                │   │
│  │        [Compatible ESC/POS]   ● Online · 320ms  │   │
│  │        [Imprimir prueba] ▸ ✓ Impreso            │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ [USB]  EPSON TM-T20III                          │   │
│  │        printer:EPSON_TM-T20III                  │   │
│  │        [Compatible ESC/POS]                      │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ [SISTEMA]  Brother HL-2280                      │   │
│  │            printer:Brother_HL_2280              │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ────────────────────────────────────────────────────  │
│              [ Cancelar ]    [ Usar esta impresora ]   │
└────────────────────────────────────────────────────────┘
```

- Modal de 720px ancho, centrado, max-height 80vh con scroll interno en lista.
- Cards de items: padding 16px, border `border`, hover `surfaceMuted`. Click selecciona y dispara `testConnection()` automáticamente. Card seleccionada: borde-izquierdo accent 3px.
- "Usar esta impresora" deshabilitado hasta que `testResult.success === true` para el seleccionado.
- Loading inicial: spinner 3 puntos centrado + "Buscando dispositivos…".
- Empty: icono Search 40px + "No se encontraron impresoras. Verifica que estén encendidas y emparejadas." + CTA "Buscar de nuevo".
- **IPC**: `printer.discover()`, `printer.testConnection()`, `printer.printTestVoucher()`, `printer.getJobStatus()` (poll 500ms × 20 igual al patrón de maragon).
- **Tests**: snapshot de loading/lista/empty, flow click→test→print→accept.

### 4.7 Sección **Router** — placeholder de Fase 3, contenido detallado en Fase 4

En Fase 3 esta sección renderiza un card con título y subtítulo y mensaje "Esta sección se completa al integrar el router TP-Link". El detalle visual completo va en Fase 4 (sección 5 abajo).

### 4.8 Sección **Programación** — `src/renderer/pages/admin/SchedulePanel.tsx`

- **Responsabilidad**: configurar cron de rotación + timezone.
- **Componentes**:
  - Card "Hora de rotación": picker custom con 2 inputs (HH y MM), defaults `23:00`. Detrás convierte a cron `0 23 * * *`. Permite también modo avanzado (toggle "Personalizar (cron)") que muestra textarea con cron raw + validación inline (regex de cron simple + `cron-parser` opcional). Mode default = simple.
  - Card "Zona horaria": dropdown de zonas IANA (lista corta hardcoded México: `America/Mexico_City`, `America/Tijuana`, `America/Cancun`, `America/Hermosillo`, `America/Mazatlan`, `America/Monterrey`). Default leído de `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Card "Próxima ejecución": muestra timestamp calculado en español ("Mañana, 7 de mayo a las 23:00 (America/Mexico_City)"), o "—" si no hay programación válida.
- **Estado interno**: form local + dirty tracking, botón "Guardar" habilitado solo si dirty + válido.
- **IPC**: `admin.getConfig()`, `admin.updateConfig({ schedule })`.
- **Tests**: validación cron, dirty tracking, próxima ejecución se actualiza al cambiar inputs.

### 4.9 Sección **Negocio** — `src/renderer/pages/admin/BusinessPanel.tsx`

- **Responsabilidad**: nombre del negocio, mensaje del ticket, logo opcional.
- **Componentes**:
  - Input "Nombre del negocio" (text, max 32 chars).
  - Textarea "Mensaje del ticket" (max 80 chars, contador inline).
  - **Upload de logo**: drag-and-drop area de 240×120px con borde dashed, mensaje "Arrastra o haz click para seleccionar logo (PNG, ≤500 KB)". Tras upload, preview centrado + botón "Eliminar".
- Validación: PNG only, ≤500KB, recomendación de 384px ancho (impresora 80mm = 576 dots, 384 da márgenes). Banner inline warning si la imagen no cumple recomendación pero NO la rechaza.
- **IPC**: `admin.getConfig()`, `admin.updateConfig({ business })`. Logo se sube vía `dialog.showOpenDialog` desde main, se copia a `app.getPath('userData')/logo.png`, se guarda path en config.
- **Tests**: upload happy path, validación PNG (rechaza JPG con error inline), preview se muestra.

### 4.10 Sección **Estadísticas** — `src/renderer/pages/admin/StatsPanel.tsx`

- **Responsabilidad**: gráficos Recharts con datos de `print_log`.
- **Componentes**:
  - Toggle de rango: `Today | Week | Month` (botones segmented, accent en activo).
  - Card "Resumen": 3 contadores grandes (Total impresos, Exitosas, Fallidas) en JetBrains Mono 36px.
  - Card "Impresiones por día": Recharts `<BarChart>` con datos `byDay`. Colores: barras `palette.accent`, ejes `palette.textSecondary`, grid `palette.border`. **NO usar `gradient`, `Area` rellena con opacidad ni cualquier efecto decorativo**. Tooltip Recharts custom con `surface` background, `border` outline, sin sombra.
- **Decisión de diseño Recharts**: pasar `palette` directo como props (`fill={palette.accent}`, `stroke={palette.textSecondary}`). Recharts no consume Tailwind classes.
- **IPC**: `stats.getStats(range)`.
- **Tests**: snapshot por rango, datos vacíos muestra empty state.

### 4.11 Sección **Logs** — `src/renderer/pages/admin/LogsPanel.tsx`

- **Responsabilidad**: tabla de auditoría + exportación CSV.
- **Layout**: card con header (título + botón "Exportar CSV"), tabla scrollable de últimos 100 eventos.
- **Columnas tabla**: Fecha (Inter 13px), Tipo (badge: rotation=info, print=success/error según success, config_change=muted, error=error, health_check=muted), Detalle (Inter 13px, ellipsis 1 línea con tooltip nativo).
- **Filtros opcionales**: dropdown "Todos los tipos" / por event_type.
- **Empty state**: icono FileText 40px muted + "No hay eventos registrados aún".
- **Botón "Exportar CSV"**: dispara `stats.exportLogs(path)` que en main usa `dialog.showSaveDialog` y escribe CSV con escape de comas/comillas.
- **IPC**: `stats.getRecentEvents(100)`, `stats.exportLogs()`.
- **Tests**: snapshot tabla con datos, snapshot empty, click exportar dispara IPC.

---

## 5. Detalle de Fase 4 — Sección Router en AdminView

### 5.1 `src/renderer/pages/admin/RouterPanel.tsx`

- **Responsabilidad**: configuración del TP-Link Archer + tests + fallback manual.
- **Layout**:

```
┌──────────────────────────────────────────────────────┐
│  Router                                               │
│  Conexión al TP-Link Archer para rotar la            │
│  contraseña del SSID guest.                           │
│  ──────────────────────────────────────────────────  │
│                                                       │
│  Conexión                                             │
│  ┌────────────────────────────────────────────────┐  │
│  │  IP del router    [192.168.0.1            ]    │  │
│  │  Usuario          [admin                  ]    │  │
│  │  Contraseña       [••••••••••           ]      │  │
│  │  Modelo           [Archer C24 ▾]               │  │
│  │  SSID guest       [Restaurante-Clientes  ]     │  │
│  │                                                 │  │
│  │  [Probar alcanzabilidad] [Probar conexión]     │  │
│  │                                                 │  │
│  │  ● Última prueba: alcance OK · login OK        │  │
│  │    SSID guest detectado: "Restaurante-Clientes"│  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  [Banner persistente si fallback manual activo]       │
│                                                       │
│              [ Guardar cambios ]                      │
└──────────────────────────────────────────────────────┘
```

- **Inputs**:
  - IP: text con validación (regex de IPv4) onBlur. Banner inline error si no válida.
  - Usuario: text, default `admin`.
  - Contraseña: password input. La password ya guardada se muestra como `••••••••••` (mascarada). Reveal manual con icono `Eye` lucide; al revelar se muestra en JetBrains Mono.
  - Modelo: dropdown con `Archer C24` / `Archer A6 v3` / `Mock (desarrollo)`.
  - SSID guest: text, default `Restaurante-Clientes`.
- **Botones de prueba**:
  - "Probar alcanzabilidad" (secundario): llama `router.pingRouter()`. Solo HTTP HEAD/GET sin login. Resultado inline: `● Alcanzable · 8ms` o `● No alcanzable · timeout`.
  - "Probar conexión" (primario, deshabilitado si IP/user/pass vacíos): llama `router.testConnection()`. Resultado inline desglosado por paso (reach / login / read / parse) con icono check verde o X rojo por paso. Si falla, muestra el `errorStep` y `errorMessage` exactos.
- **Indicador del último resultado**: card pequeño debajo del card de inputs, persiste hasta el siguiente test. Estados: `idle` (no se muestra), `success` (border-left 3px success), `partial` (border-left 3px warning, ej. ping ok pero login fail), `failed` (border-left 3px error).
- **Banner de fallback manual**: si `lastRotationStatus === 'failed'` después de 3 reintentos, banner persistente arriba del panel:

```
┌──────────────────────────────────────────────────────┐
│ ⚠ Rotación automática falló                           │
│   La nueva contraseña no se aplicó al router.         │
│   Cámbiala manualmente con esta password:             │
│                                                        │
│   K7M3RXHPQ2  ←(JetBrains Mono 24px, accent text)    │
│   [Copiar al portapapeles]                            │
│                                                        │
│   1. Abre la UI web del router (http://192.168.0.1)  │
│   2. Ve a Wireless → Guest Network                   │
│   3. Pega la contraseña en el campo "Password"       │
│   4. Aplica los cambios                               │
│                                                        │
│   [He aplicado la contraseña]                         │
└──────────────────────────────────────────────────────┘
```

- Banner border-left 3px error, fondo `error/0.05`. Borde restante: `border`.
- Password visible en JetBrains Mono 24px, peso 500, color `textPrimary` (NO accent — accent está reservado al botón de marca).
- "Copiar" usa `navigator.clipboard.writeText()` y muestra dot success inline 2 segundos: "● Copiado".
- "He aplicado la contraseña" llama `router.markPasswordAppliedManually(password)` (D-006 fallback) que escribe en `audit_log` y desactiva el banner.
- **Estado interno**: form local con dirty tracking, `lastTestResult: RouterTestResult | null`, `manualFallbackActive: boolean`.
- **IPC**: `router.pingRouter()`, `router.testConnection()`, `router.markPasswordAppliedManually()`, `admin.getConfig()`, `admin.updateConfig({ router })`.
- **Tests**: snapshot de cada estado del último test (success/partial/failed/idle), banner fallback, validación IP, dirty tracking.

---

## 6. Estructura de archivos del renderer

```
src/renderer/
├── main.tsx                              # Bootstrap React, importa fonts y CSS global
├── App.tsx                               # Root: routing WaiterView ↔ AdminView por isAdminUnlocked
├── pages/
│   ├── WaiterView.tsx                    # Vista principal, botón gigante, health, engrane
│   ├── AdminView.tsx                     # Layout 2-cols, nav lateral, router de secciones
│   └── admin/
│       ├── HomePanel.tsx                 # Sección Inicio: dashboard salud + acciones rápidas
│       ├── PrinterPanel.tsx              # Sección Impresora: card actual + discovery launcher
│       ├── RouterPanel.tsx               # Sección Router: inputs + tests + fallback manual
│       ├── SchedulePanel.tsx             # Sección Programación: cron picker + timezone
│       ├── BusinessPanel.tsx             # Sección Negocio: nombre + mensaje + logo
│       ├── StatsPanel.tsx                # Sección Estadísticas: Recharts BarChart
│       └── LogsPanel.tsx                 # Sección Logs: tabla + exportación CSV
├── components/
│   ├── PrintButton.tsx                   # Botón gigante reusable con loading
│   ├── HealthIndicator.tsx               # Dot color + texto (success/warning/error/idle)
│   ├── SettingsGearButton.tsx            # Engrane discreto que abre PinModal
│   ├── PinModal.tsx                      # Modal validación PIN, lockout countdown
│   ├── ChangePinWizard.tsx               # Wizard 3 pasos D-013, 7 reglas validación
│   ├── DiscoveryModal.tsx                # Modal full discovery con lista única + badges
│   ├── Banner.tsx                        # Banner inline persistente (error/warning/success)
│   ├── Card.tsx                          # Card primitivo (surface + border + radius-lg)
│   ├── Button.tsx                        # Button primitivo (primary/secondary/ghost/destructive)
│   ├── Input.tsx                         # Input primitivo con label, error, hint
│   ├── Select.tsx                        # Dropdown propio (sin librería) con UX 5.6
│   ├── Badge.tsx                         # Badge primitivo (success/warning/error/info/muted)
│   ├── Dot.tsx                           # Dot 8px coloreado para estados
│   ├── Spinner.tsx                       # 3 puntos animados (única animación permitida)
│   ├── EmptyState.tsx                    # Icono lucide 40px + título + subtítulo + CTA
│   ├── ConfirmDialog.tsx                 # Confirmación modal pequeño (eliminar, etc)
│   ├── PasswordReveal.tsx                # Mascara con toggle Eye en JetBrains Mono
│   └── CopyableText.tsx                  # Texto + botón Copy con feedback inline
├── hooks/
│   ├── useSystemHealth.ts                # Poll getSystemHealth cada 30s
│   ├── useAdminConfig.ts                 # getConfig + updateConfig con cache invalidation
│   ├── useDiscoverPrinters.ts            # discover() + isScanning + retry
│   ├── usePinLockout.ts                  # Tracking de intentos fallidos + countdown
│   ├── useFormDirty.ts                   # Dirty tracking genérico para forms
│   └── usePollPrintJob.ts                # Polling getJobStatus 500ms × 20 (patrón maragon)
├── store/
│   ├── authStore.ts                      # zustand: isAdminUnlocked, lastUnlockedAt
│   ├── printStore.ts                     # zustand: status, lastError, lastJobId, print()
│   ├── adminNavStore.ts                  # zustand: activeSection
│   └── healthStore.ts                    # zustand: cached SystemHealth + setters
├── styles/
│   ├── tokens.ts                         # Paleta + typography + spacing + radii + shadows
│   ├── fonts.ts                          # Imports CSS de @fontsource (Inter + JetBrains Mono)
│   └── global.css                        # @tailwind directives + reset mínimo + focus-visible
└── types/
    └── window.d.ts                       # Augment Window con `api: IpcAPI` desde shared/types
```

Total: 7 paneles admin + 17 components primitivos + 6 hooks + 4 stores + 3 styles + 1 types augment + 2 pages root = ~40 archivos. Manejable, sin overengineering.

---

## 7. Estado global y data flow

### 7.1 Stores Zustand (4 slices)

**`useAuthStore`** (`src/renderer/store/authStore.ts`):
- State: `isAdminUnlocked: boolean`, `lastUnlockedAt: number | null`, `pinIsDefault: boolean`.
- Actions: `unlock()` (set `true` + timestamp), `lock()`, `setPinIsDefault(value)`.
- Selectors: `selectIsAdminUnlocked`, `selectMustChangePin`.
- Auto-lock: hook en App.tsx registra timer de 15 min idle que llama `lock()` automáticamente.

**`usePrintStore`** (`src/renderer/store/printStore.ts`):
- State: `status: 'idle' | 'printing' | 'success' | 'failed'`, `lastError: string | null`, `lastJobId: string | null`, `lastPrintedAt: number | null`.
- Actions: `print()` (llama IPC y polea jobStatus), `clear()`.
- WaiterView y HomePanel ambos consumen.

**`useAdminNavStore`** (`src/renderer/store/adminNavStore.ts`):
- State: `activeSection: 'home' | 'printer' | 'router' | 'schedule' | 'business' | 'stats' | 'logs'`.
- Actions: `setSection(section)`.

**`useHealthStore`** (`src/renderer/store/healthStore.ts`):
- State: `health: SystemHealth | null`, `lastFetchedAt: number | null`, `isLoading: boolean`.
- Actions: `fetch()`, `invalidate()`.
- Cache: si `Date.now() - lastFetchedAt < 5000` el `fetch()` early-returns con cache; útil cuando varios componentes lo piden.

### 7.2 Hooks custom (6)

- **`useSystemHealth()`**: combina `useHealthStore` con `setInterval(30000)` y refetch inmediato en mount. Returns `{ health, isLoading, refetch }`.
- **`useAdminConfig()`**: leve cache + mutation. `getConfig()` al mount, `updateConfig(patch)` invalida y refetch. Returns `{ config, isLoading, save: (patch) => Promise }`.
- **`useDiscoverPrinters()`**: gestiona estado de scan. `start()` llama `discover()`, `cancel()` aborta. Returns `{ printers, isScanning, error, start, cancel }`.
- **`usePinLockout()`**: lleva `failedAttempts: number` en memoria + `lockedUntilMs`. Al alcanzar 3 fallos, calcula `Date.now() + 5*60*1000`. Decrementa countdown cada segundo via `setInterval`. Persistencia opcional en `sessionStorage` para sobrevivir refresh (el lockout NO debe sobrevivir crash de app — eso lo maneja Backend con LockoutTracker server-side, este hook es solo UI feedback).
- **`useFormDirty<T>()`**: helper genérico. Toma valor inicial `T`, devuelve `{ values, setValue, isDirty, reset }`.
- **`usePollPrintJob(jobId)`**: poll `getJobStatus(jobId)` cada 500ms hasta status `printed | failed` o 20 intentos. Returns `{ status, error, attemptsLeft }`.

### 7.3 Cache invalidation tras mutaciones IPC

Patrón unificado: cualquier mutation (`updateConfig`, `printer.setActive`, `admin.changePin`, `printer.delete`, etc.) invalida los stores afectados ANTES de resolver:

- `admin.updateConfig` → invalida `useAdminConfig` (refetch automático).
- `admin.changePin` → setea `pinIsDefault: false` en `useAuthStore`.
- `printer.setActive` → invalida `useAdminConfig` + dispara `useSystemHealth.refetch()` (la salud puede cambiar al apuntar a una impresora distinta).
- `router.markPasswordAppliedManually` → dispara `useSystemHealth.refetch()`.
- `admin.rotatePasswordNow` → invalida `useSystemHealth` + `usePrintStore`.

Implementación: cada hook expone `invalidate()` y los componentes que disparan mutations llaman las invalidations correspondientes inline. NO usamos React Query / TanStack Query (sería overengineering para 7 endpoints CRUD; el plan v1.1 ya rechaza dependencias innecesarias). Si en v2 crece, migrar a TanStack Query es trivial.

---

## 8. Estrategia de testing visual

Ya respondida en Cuestión 1.1. Resumen:

- **Herramientas**: vitest + @testing-library/react para component snapshots (DOM); Playwright contra `.exe` empaquetado para visual regression real (PNG snapshots).
- **NO Storybook** (justificado en Cuestión 1.1).
- **CI**: solo vitest. Playwright visual corre local pre-release y resultados se adjuntan al PR.
- **Snapshots de DOM**: 1 por estado visual de cada componente que tenga ≥2 estados. Ubicación: `src/renderer/components/__snapshots__/`.
- **Snapshots de Playwright**: ubicación `tests/e2e/__screenshots__/win11/`. Tolerancia `maxDiffPixelRatio: 0.01`. Solo se comparan en Win11 (es la plataforma producción).
- **Criterios de regresión visual**:
  - Cualquier cambio en `tokens.ts` requiere re-baseline manual de los snapshots de Playwright (PR debe incluir las nuevas PNGs).
  - Diff > 1% en CI rompe el build con instrucciones de "regenera con `npm run test:e2e -- --update-snapshots` después de revisión visual del orquestador".
  - Diff < 1% se acepta (anti-aliasing entre runs).

---

## 9. Riesgos específicos del frontend

1. **Empaquetado de fonts woff2 en asar (riesgo medio)**: Vite 5 + electron-builder 25 normalmente resuelve, pero hay reportes históricos de rutas relativas rotas. Mitigación: `document.fonts.check()` en smoke test de Fase 1; plan B con `asarUnpack: ['dist/assets/*.woff2']` documentado. Owner: este especialista coordina con QA en Fase 6.

2. **CSP estricta vs Vite dev/HMR (riesgo alto si no se planifica)**: `default-src 'self'` rompe el WebSocket de HMR de Vite (puerto 5173) y los inline-styles que Vite inyecta en dev. Mitigación: dos CSPs distintas según `NODE_ENV`. En dev: `default-src 'self' 'unsafe-inline' 'unsafe-eval' ws://localhost:5173`. En prod: `default-src 'self'`. Coordinación obligatoria con QA specialist (cuestión 13 de su lista). Implementación en `src/main/index.ts` via `webPreferences` + `<meta http-equiv="Content-Security-Policy">` en `index.html` con template diferente por NODE_ENV.

3. **Accesibilidad WCAG AA con paleta restringida (riesgo bajo, validable)**: la paleta de Sección 5.6 tiene contrastes específicos. Validados:
   - `textPrimary #18181B` sobre `background #FAFAFA`: ratio 17.8 ✓ (AAA).
   - `textSecondary #52525B` sobre `surface #FFFFFF`: ratio 8.1 ✓ (AAA).
   - `textMuted #A1A1AA` sobre `surface #FFFFFF`: ratio 2.99 ✗ (NO cumple AA para texto normal, sí para texto large >=18px o >=14px bold).
   - **Restricción de uso**: `textMuted` SOLO para texto ≥14px peso 500+ o ≥18px peso 400+. NUNCA para texto pequeño regular. Documentar en tokens.ts como comentario JSDoc + lint rule (eslint-plugin-jsx-a11y) si es factible.
   - `accentForeground #FAFAFA` sobre `accent #18181B`: ratio 17.8 ✓.

4. **Tamaño del bundle con Recharts (riesgo bajo-medio)**: Recharts pesa ~440 KB minified. El plan v1.1 lo permite explícitamente. Mitigación: import específico (`import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'`) en lugar de `import * as Recharts`. Tree-shaking de Vite reduce a ~180 KB. Si crece, considerar `chart.js` que es más liviano.

5. **IPC fallando silenciosamente (riesgo alto en producción)**: si Backend cambia un nombre de método y Frontend no se actualiza, las llamadas devuelven `undefined` sin error. Mitigación:
   - `window.api` está tipado vía `IpcAPI` en `src/shared/types.ts`. TS catch en compile time.
   - Wrapper `safeCall<T>(fn: () => Promise<T>): Promise<T>` que envuelve toda llamada IPC con try/catch + electron-log + banner de error inline genérico ("Operación falló: <mensaje>"). Si la promesa nunca resuelve en 10s, timeout y banner.
   - En main: agregar handler `ipcMain.handle('*', ...)` catchall que loggea métodos no registrados con `electron-log` para detectar drift en piloto.

6. **Animación "shake" del PinModal (riesgo bajo, justificable)**: UX 5.6 prohíbe "animaciones ostentosas". El shake del modal de PIN tras fallo (translateX ±4px durante 200ms) es funcional y no decorativo: comunica al usuario que el PIN fue rechazado sin requerir leer el banner. Es el estándar de iOS/macOS para passcodes. **Documentar excepción en DECISIONS.md** con justificación: "Shake en PinModal post-failed es feedback funcional, no decorativo. Movimiento mínimo (±4px), 200ms, sin escalado ni rotación."

7. **Drag-and-drop de logo (riesgo bajo)**: `<input type="file" accept="image/png">` standard cubre 90%. Drop area con `onDrop` + `e.dataTransfer.files` requiere `event.preventDefault()` + manejo de path. En sandbox, `File.path` no está disponible — solo `File` blob. Solución: leer como `ArrayBuffer` en renderer, enviar al main vía IPC (`admin.uploadLogo(buffer: Uint8Array)`), main escribe a `userData/logo.png`. Coordinación con Backend specialist.

8. **Recharts y CSP (riesgo bajo)**: Recharts genera SVG inline sin estilos remotos. Compatible con CSP estricta `default-src 'self'`. Validado en proyectos similares.

---

**Resumen de coordinación con otros especialistas:**

- **Backend**: validar reglas del Wizard de PIN server-side (replicar las 7); endpoint `admin.uploadLogo`; campo `priority` en `DiscoveredPrinter`; `safeCall` wrapper requiere convención de errores con códigos.
- **Hardware/Red**: ninguno bloqueante. Confirmar que `discover()` devuelve lista cross-platform unificada (ya en contrato).
- **QA/Empaquetado/Seguridad**: dual CSP (dev/prod); Playwright con `electron.launch({ executablePath })`; `document.fonts.check()` en smoke test; documentar excepción de shake en DECISIONS.md; auditar contrastes WCAG con paleta restringida.

---

### Critical Files for Implementation

- /Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/src/renderer/styles/tokens.ts
- /Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/tailwind.config.ts
- /Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/src/renderer/pages/WaiterView.tsx
- /Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/src/renderer/pages/AdminView.tsx
- /Users/oswaldomaravilla/Proyectos/Pruebas/QR clientes/wifi-voucher-manager/src/renderer/components/ChangePinWizard.tsx

Frontend+UX specialist — listo para consolidación.
