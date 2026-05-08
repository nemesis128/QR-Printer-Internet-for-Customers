# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado actual del repositorio

**No hay código todavía.** El único archivo es [PLAN-TECNICO-WIFI-MANAGER_2.md](PLAN-TECNICO-WIFI-MANAGER_2.md) (v1.1), que es la fuente de verdad para todas las decisiones de arquitectura, stack y UX. **Antes de escribir código, leer la sección relevante del plan** — está dividido en 12 secciones más 2 apéndices y los criterios de aceptación por fase son estrictos.

El idioma del proyecto, los comentarios del plan y la comunicación con el cliente son en **español** (cliente: restaurante en México). Código y nombres técnicos en inglés.

## Qué es este proyecto

App **Electron de escritorio para Windows** que vive en la laptop POS de un restaurante. Genera e imprime códigos QR de WiFi (formato `WIFI:T:WPA;S:...;P:...;;`) en la impresora térmica de comandas, y rota automáticamente cada noche la contraseña del SSID guest de un router TP-Link Archer secundario vía cliente HTTP propio.

Dos vistas:
- **WaiterView** — pantalla única, sin login, un solo botón gigante "Imprimir QR". Es lo primero que aparece al abrir la app.
- **AdminView** — protegida por PIN bcrypt (4 dígitos, bloqueo tras 3 fallos). Acceso vía icono de engrane discreto en esquina inferior derecha de WaiterView.

## Comandos (una vez inicializado el proyecto en Fase 0)

```bash
npm run dev          # Vite + Electron en desarrollo
npm run build        # tsc && vite build && electron-builder → .exe
npm run test         # vitest run
npm run test:watch   # vitest en modo watch
npm run test:e2e     # Playwright (NO spectron — está deprecado)
npm run test:coverage
npm run lint         # eslint . --ext ts,tsx
npm run type-check   # tsc --noEmit
npm run format       # prettier --write .
```

Para correr un único test con vitest: `npx vitest run path/to/file.test.ts -t "nombre del test"`.

Para inicialización completa del proyecto desde cero: ver Apéndice A del plan técnico.

## Arquitectura: lo que no se puede inferir leyendo archivos sueltos

### Separación main / renderer / preload con IPC tipado

Todo IPC entre main y renderer pasa por la interfaz `IpcAPI` definida en [src/shared/types.ts](src/shared/types.ts) (sección 4 del plan). El renderer accede solo vía `contextBridge` desde preload. Reglas duras: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. Cambiar el contrato IPC sin actualizar `src/shared/types.ts` rompe el build.

### Adapter pattern para hardware externo

Los routers y las impresoras viven detrás de interfaces (`IRouterAdapter`, `IPrinterAdapter`). Esto NO es opcional ni overengineering — existe específicamente para:

1. Permitir desarrollo offline con `MockRouterAdapter` / `MockPrinterAdapter`.
2. Aislar el cambio cuando TP-Link rompa su firmware (riesgo R1, alto). El `TPLinkArcherAdapter` es el componente de mayor riesgo del proyecto: implementa cliente HTTP propio (no hay librería npm confiable), debe tener fallback manual donde la app muestra la nueva contraseña en pantalla y el admin la cambia desde la UI web del router.

### Repository pattern + better-sqlite3

DB en SQLite local con `better-sqlite3` (sincrónico, ideal para Electron). 4 tablas: `passwords`, `print_log`, `config`, `audit_log` (DDL en sección 3.3). **Queries SQL solo en `src/main/db/repositories/`** — los servicios nunca tocan SQL directo.

### Persistencia de configuración: dos lugares distintos

- `electron-store` para `AppConfig` (sección 3.4): router host, printer interface, cron schedule, business name, `pinHash`.
- `safeStorage.encryptString()` (DPAPI en Windows) para credenciales del router. **Nunca** guardar credenciales en plano ni en electron-store sin cifrar.

### Scheduler con recuperación

`SchedulerService` con `node-cron`. Al startup, si la última rotación fue hace > 24h, ejecuta de inmediato. Reintentos con backoff exponencial 1m / 5m / 15m. Tras 3 fallos, notificación visual persistente (NO toast efímero). La transacción de DB se commitea **solo después** de confirmación HTTP del router (riesgo R5).

## Restricciones inviolables

### Versiones (sección 2 del plan)

Las versiones del plan son las **verificadas estables a mayo 2026**. Cambiarlas requiere entrada en `DECISIONS.md` con justificación. Algunos pinpoints críticos:

- **Electron 39.x** (NO 40 — recién salida)
- **Node 22.20.x LTS** (NO 24 — deps nativas no compatibles)
- **React 18.3.1** (NO 19 — ecosistema aún migra)
- **Vite 5.4** (NO 6 — verificar plugin electron primero)
- **Tailwind 3.4** (NO v4)

### Librerías prohibidas

- ❌ `escpos` (npm) — abandonada desde 2020. Usar `node-thermal-printer`.
- ❌ Webpack — usar Vite.
- ❌ Jest — usar Vitest.
- ❌ Redux — usar Zustand o `useState`.
- ❌ Material UI / Ant Design / styled-components — Tailwind + componentes propios.
- ❌ Cualquier librería npm para TP-Link — todas son para smartplugs, implementar HTTP propio.
- ❌ spectron — deprecado; Playwright con Electron.
- ❌ Paquetes con < 50 descargas semanales en npm o sin releases en 18 meses.
- ❌ Licencias GPL.

### TypeScript

`any` está prohibido. Si es estrictamente necesario, `unknown` + narrow. Estricto siempre.

### UX/UI (sección 5.6) — son reglas, no sugerencias

La app vive horas abierta en una laptop visible al cliente. Inspiración: Linear, Stripe, Vercel. **No** Material Design ni "admin dashboard templates".

- **Paleta única definida** (sección 5.6). Crear `src/renderer/styles/tokens.ts` que la exporta y la consume `tailwind.config`. NO introducir tonos nuevos.
- **Tipografías:** Inter (UI) + JetBrains Mono (passwords/IDs). Self-hosted vía `@fontsource/*`. NO Google Fonts ni otras familias.
- **Pesos permitidos:** 400, 500, 600. Nada más.
- **Sombras:** solo `0 1px 2px rgba(0,0,0,0.04)`. Blur ≤ 8px. Sin sombras coloreadas.
- **Iconos:** lucide-react, stroke 1.5 (default).
- **Prohibido:** emojis en UI, gradientes decorativos, glassmorphism, neón, animaciones ostentosas, drop shadows agresivas, más de un acento de color simultáneo.
- **Errores:** banner inline persistente con borde izquierdo 3px rojo. **Nunca** toasts que desaparecen — un error debe quedar fijo hasta que el admin lo aborde.

Cada pantalla nueva requiere revisión visual del orquestador antes de cerrar la fase.

### Generación de password

Charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin 0/O, 1/I/l). Longitud 10. **`crypto.randomInt`, no `Math.random`.** Excluir `\ ; , : "` porque rompen el escape del formato `WIFI:`.

### Generación de QR

`errorCorrectionLevel: 'M'` (15%). NO 'L' — al imprimirse en térmica genera artefactos. Tamaño mínimo impreso: 200×200 px a 203 DPI ≈ 25mm. Escapar `\ ; , : "` en el payload.

## Flujo de fases y bloqueadores

El plan especifica fases secuenciales (sección 6) con criterios de aceptación duros. Cada fase termina con PR + code review + tests + actualización de `DECISIONS.md`. **Bloqueadores externos importantes:**

- Fase 2 (PrinterService) bloqueada hasta que el cliente confirme modelo y conexión (USB/Red) de la impresora.
- Fase 4 (RouterService) bloqueada hasta que el cliente compre el TP-Link Archer C24 o A6 v3.

Hardware baseline mientras no haya confirmación del cliente: EPSON TM-T20.

## DECISIONS.md — bitácora obligatoria

Cualquier desviación de las versiones, librerías permitidas, arquitectura, o reglas UX se documenta en `DECISIONS.md` con justificación **antes** de mergear. Las excepciones aceptadas quedan permanentemente como historial. Si una regla bloquea avance legítimo, abrir `## Excepción solicitada: ...` y esperar review del orquestador.

## .context/ — contexto para agentes

El plan (sección 3.1) reserva un directorio `.context/` con `PROJECT.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DEPENDENCIES.md`. Antes de empezar trabajo en una nueva fase, leer `.context/ARCHITECTURE.md`. Al agregar/quitar dependencias, actualizar `.context/DEPENDENCIES.md`.

## Métricas de aceptación del piloto (Fase 7)

Para cerrar el proyecto en producción: 0 días sin servicio WiFi en la primera semana, ≥95% de impresiones exitosas (medido en `print_log`), ≥95% de rotaciones automáticas exitosas, mesero operando sin asistencia tras una capacitación de 15 min.
