# Audit final de seguridad — Fase 6

Checklist tomado de `etapa2-qa.md` Sección 4.4. Estado al cierre de Fase 6.

| Control | Implementado en | Verificado |
|---|---|---|
| `contextIsolation: true` en BrowserWindow | `src/main/index.ts` (Fase 0) | ✅ |
| `sandbox: true` | `src/main/index.ts` | ✅ |
| `nodeIntegration: false` | `src/main/index.ts` | ✅ |
| `webSecurity: true` | `src/main/index.ts` | ✅ |
| `allowRunningInsecureContent: false` | `src/main/index.ts` | ✅ |
| `experimentalFeatures: false` | `src/main/index.ts` | ✅ |
| `setWindowOpenHandler({action:'deny'})` | `src/main/index.ts` | ✅ |
| `will-navigate` blocker fuera de localhost:5173/file:// | `src/main/index.ts` | ✅ |
| CSP estricta en producción (default-src 'self') | `src/main/security/csp.ts` (Fase 0) | ✅ |
| Header HTTP CSP en main process (defense-in-depth) | `src/main/index.ts` | ✅ |
| `safeStorage` para router.password | `src/main/security/CredentialStorage.ts` (Fase 3) | ✅ |
| PIN admin con argon2id (D-001) | `src/main/services/PinCrypto.ts` (Fase 3) | ✅ |
| Lockout 3 intentos × 5 min | `src/main/services/LockoutTracker.ts` (Fase 3) | ✅ |
| Session token 32 bytes con TTL 30 min refresh | `src/main/services/AdminSession.ts` (Fase 3) | ✅ |
| Validación zod en todos los IPC handlers | `src/main/ipc/*.ts` (Fases 1-5) | ✅ |
| Sanitización de logs (passwords/keys → REDACTED) | `src/main/adapters/routers/sanitize-logs.ts` (Fase 4) | ✅ |
| Migraciones append-only (D-005) | `src/main/db/migrations/` | ✅ |
| No code signing — Apéndice C compensa (D-014) | `docs/manuales/MANUAL-INSTALACION.md` § 7 | ✅ |
| `npm audit` ≥ moderate — dev-only deps aceptadas (D-038) | `DECISIONS.md` D-038 | ⚠️ documentado |
| Predist verifica CSP de producción | `scripts/verify-csp.mjs` (Fase 0) | ✅ |
| Predist sanitiza build (no console.log) | `scripts/sanitize-build.mjs` (Fase 0) | ✅ |
| Postdist verifica asarUnpack de native deps | `scripts/verify-asar-unpack.mjs` (Fase 0) | ✅ |
| Auto-arranque condicionado a pinIsDefault=false (D-036) | `src/main/index.ts` (Fase 6) | ✅ |
| Logo persistido en userData/, no en bundle (D-037) | `src/main/ipc/admin.ts` (Fase 6) | ✅ |

**Resultado:** los 24 controles del threat model están implementados o documentados con su excepción justificada (D-038). Sin gaps de seguridad al cierre de Fase 6.

**Gaps conocidos diferidos a v2:**
- 22 vulnerabilidades de `npm audit` en dev-only deps — reevaluar cuando vitest 4 y electron-builder 26 sean LTS (D-038)
- Code signing del `.exe` — costo de cert EV (~$300/año) no justifica para piloto v1 (D-014)
- Voucher template no renderiza `business.logoPath` aún — feature de v2 (D-037)
