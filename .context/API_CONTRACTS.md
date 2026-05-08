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

Detalle completo del contrato (TypeScript): docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md Sección E.
