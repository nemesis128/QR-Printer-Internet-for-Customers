# Fase 7 — Piloto en producción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listos los **runbooks operativos** y un script de KPIs para que Okuni Solutions opere el piloto de 1-2 semanas en el restaurante del cliente: instalación Día 0, monitoreo diario, respuesta a incidentes, política de hotfix y criterios de exit a v1 GA. Fase 7 NO entrega código nuevo del producto — la app v1 ya está completa (`fase-6-complete`). Esta fase entrega los documentos + 1 script de extracción de métricas para tomar decisiones durante la operación real.

**Architecture:** Todo vive en `docs/runbooks/` como Markdown (7 archivos) más `scripts/piloto-kpis.mjs` que lee `data.db` localmente vía better-sqlite3 (read-only) y emite las 3 KPIs del spec (% prints exitosos, % rotaciones exitosas, días sin servicio). El script corre en el Win11 del cliente vía RDP o en la laptop dev tras copiar la DB.

**Tech Stack:** Markdown plano para runbooks, Node 22 + better-sqlite3 (ya dep) + minimist (sólo si necesitamos flags; mejor parse manual para no agregar deps), vitest para test del script con DB `:memory:`.

---

## Alcance — qué entra y qué no en Fase 7

**Entra:**
- `scripts/piloto-kpis.mjs` con test de vitest cubriendo el cómputo de KPIs sobre fixture
- 7 runbooks en `docs/runbooks/`:
  - `PILOTO-DIA-0.md` — checklist completo de instalación, config y capacitación
  - `CAPACITACION-MESERO.md` — guion de 15 min para entrenar al mesero
  - `MONITOREO-DIARIO.md` — qué revisar cada día con SQL queries de ejemplo
  - `INCIDENT-RESPONSE.md` — catálogo de incidentes comunes + remediación
  - `HOTFIX-POLICY.md` — triage crítico/medio/menor + workflow
  - `PILOTO-EXIT-CRITERIA.md` — qué define el cierre exitoso del piloto y transición a v1 GA
  - `STATS-WEEKLY-TEMPLATE.md` — template para reportes semanales a Okuni Solutions
- D-039 en DECISIONS.md
- Tag `fase-7-ready` (no `fase-7-complete` — el "complete" llega cuando el piloto real termine post-operación)

**No entra (post-piloto):**
- Datos reales del piloto (se llenarán durante operación)
- Cambios de código por bugs descubiertos — los maneja la política de hotfix
- Marketing del producto / página de releases en GitHub
- Cert EV para code signing (deferred a v2)

---

## File Structure

**Crear:**
- `wifi-voucher-manager/scripts/piloto-kpis.mjs` — Node ESM script con CLI args `--db <path>` `--format text|json`
- `wifi-voucher-manager/tests/unit/scripts/piloto-kpis.test.ts` — vitest test del cómputo de KPIs
- `docs/runbooks/PILOTO-DIA-0.md`
- `docs/runbooks/CAPACITACION-MESERO.md`
- `docs/runbooks/MONITOREO-DIARIO.md`
- `docs/runbooks/INCIDENT-RESPONSE.md`
- `docs/runbooks/HOTFIX-POLICY.md`
- `docs/runbooks/PILOTO-EXIT-CRITERIA.md`
- `docs/runbooks/STATS-WEEKLY-TEMPLATE.md`

**Modificar:**
- `wifi-voucher-manager/DECISIONS.md` — D-039
- `wifi-voucher-manager/package.json` — agregar `"kpis": "node scripts/piloto-kpis.mjs"` en scripts

---

## Bloque A — Script de KPIs (Task 1)

### Task 1: `scripts/piloto-kpis.mjs` + test

**Files:**
- Create: `wifi-voucher-manager/scripts/piloto-kpis.mjs`
- Create: `wifi-voucher-manager/tests/unit/scripts/piloto-kpis.test.ts`
- Modify: `wifi-voucher-manager/package.json`

- [ ] **Step 1: Failing test**

```ts
// tests/unit/scripts/piloto-kpis.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createConnection } from '../../../src/main/db/connection.js';
import { runMigrations } from '../../../src/main/db/run-migrations.js';
import { computeKpis } from '../../../scripts/piloto-kpis.mjs';

describe('computeKpis', () => {
  let db: ReturnType<typeof createConnection>;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('devuelve totales en cero con DB vacía', async () => {
    const k = await computeKpis(db);
    expect(k.totalPrints).toBe(0);
    expect(k.printSuccessRate).toBe(null);
    expect(k.totalRotations).toBe(0);
    expect(k.rotationSuccessRate).toBe(null);
    expect(k.daysWithoutService).toBe(null);
  });

  it('printSuccessRate = exitosos / totales', async () => {
    const [passId] = await db('passwords').insert({
      password: 'PW123', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await db('print_log').insert([
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 0, error_message: 'fail' },
    ]);
    const k = await computeKpis(db);
    expect(k.totalPrints).toBe(4);
    expect(k.successfulPrints).toBe(3);
    expect(k.printSuccessRate).toBeCloseTo(0.75, 2);
  });

  it('rotationSuccessRate filtra por payload.success=true', async () => {
    await db('audit_log').insert([
      { event_type: 'password_rotation', payload: JSON.stringify({ success: true }) },
      { event_type: 'password_rotation', payload: JSON.stringify({ success: true }) },
      { event_type: 'password_rotation', payload: JSON.stringify({ success: false }) },
    ]);
    const k = await computeKpis(db);
    expect(k.totalRotations).toBe(3);
    expect(k.successfulRotations).toBe(2);
    expect(k.rotationSuccessRate).toBeCloseTo(0.6667, 3);
  });

  it('meetsTargets=true cuando ambos rates >= 0.95', async () => {
    const [passId] = await db('passwords').insert({
      password: 'PW', ssid: 'g', active: 1, rotated_by: 'auto', router_response: null,
    });
    for (let i = 0; i < 19; i++) {
      await db('print_log').insert({ password_id: passId, success: 1, error_message: null });
    }
    await db('print_log').insert({ password_id: passId, success: 0, error_message: 'x' });
    for (let i = 0; i < 19; i++) {
      await db('audit_log').insert({
        event_type: 'password_rotation',
        payload: JSON.stringify({ success: true }),
      });
    }
    await db('audit_log').insert({
      event_type: 'password_rotation',
      payload: JSON.stringify({ success: false }),
    });
    const k = await computeKpis(db);
    expect(k.printSuccessRate).toBeCloseTo(0.95, 2);
    expect(k.rotationSuccessRate).toBeCloseTo(0.95, 2);
    expect(k.meetsTargets).toBe(true);
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager && npm run test -- piloto-kpis`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement script**

```js
// scripts/piloto-kpis.mjs
#!/usr/bin/env node
import { argv, exit, env, platform } from 'node:process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SUCCESS_THRESHOLD = 0.95;

function defaultDbPath() {
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'wifi-voucher-manager', 'data.db');
  }
  if (platform === 'win32') {
    return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'wifi-voucher-manager', 'data.db');
  }
  return join(homedir(), '.config', 'wifi-voucher-manager', 'data.db');
}

function parseArgs(args) {
  const opts = { db: defaultDbPath(), format: 'text' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) { opts.db = args[++i]; }
    else if (args[i] === '--format' && args[i + 1]) { opts.format = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') { opts.help = true; }
  }
  return opts;
}

export async function computeKpis(db) {
  const printTotalRow = await db('print_log').count({ c: '*' }).first();
  const printSuccessRow = await db('print_log').where('success', 1).count({ c: '*' }).first();
  const totalPrints = Number(printTotalRow?.c ?? 0);
  const successfulPrints = Number(printSuccessRow?.c ?? 0);
  const printSuccessRate = totalPrints > 0 ? successfulPrints / totalPrints : null;

  const rotTotalRow = await db('audit_log').where('event_type', 'password_rotation').count({ c: '*' }).first();
  const rotSuccessRow = await db('audit_log')
    .where('event_type', 'password_rotation')
    .whereRaw("json_extract(payload, '$.success') = 1")
    .count({ c: '*' })
    .first();
  const totalRotations = Number(rotTotalRow?.c ?? 0);
  const successfulRotations = Number(rotSuccessRow?.c ?? 0);
  const rotationSuccessRate = totalRotations > 0 ? successfulRotations / totalRotations : null;

  const meetsTargets =
    printSuccessRate !== null &&
    rotationSuccessRate !== null &&
    printSuccessRate >= SUCCESS_THRESHOLD &&
    rotationSuccessRate >= SUCCESS_THRESHOLD;

  const lastPrintRow = await db('print_log').where('success', 1).orderBy('id', 'desc').first();
  const lastRotationRow = await db('audit_log')
    .where('event_type', 'password_rotation')
    .whereRaw("json_extract(payload, '$.success') = 1")
    .orderBy('id', 'desc')
    .first();
  const lastActivityIso =
    (lastPrintRow?.printed_at ?? null) > (lastRotationRow?.created_at ?? null)
      ? lastPrintRow?.printed_at
      : lastRotationRow?.created_at;
  const daysWithoutService = lastActivityIso
    ? Math.floor((Date.now() - new Date(lastActivityIso).getTime()) / 86_400_000)
    : null;

  return {
    totalPrints,
    successfulPrints,
    failedPrints: totalPrints - successfulPrints,
    printSuccessRate,
    totalRotations,
    successfulRotations,
    failedRotations: totalRotations - successfulRotations,
    rotationSuccessRate,
    daysWithoutService,
    meetsTargets,
  };
}

function formatText(k) {
  const pct = (n) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
  const lines = [
    '=== KPIs del Piloto ===',
    '',
    `Impresiones: ${k.successfulPrints}/${k.totalPrints} exitosas (${pct(k.printSuccessRate)})`,
    `Rotaciones:  ${k.successfulRotations}/${k.totalRotations} exitosas (${pct(k.rotationSuccessRate)})`,
    `Días sin servicio: ${k.daysWithoutService ?? 'n/a (sin actividad registrada)'}`,
    '',
    `Cumple objetivos (>=95% ambos): ${k.meetsTargets ? '✓ SÍ' : '✗ NO'}`,
  ];
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (opts.help) {
    console.warn('Uso: node scripts/piloto-kpis.mjs [--db <path>] [--format text|json]');
    return;
  }
  const Knex = (await import('knex')).default;
  const db = Knex({
    client: 'better-sqlite3',
    connection: { filename: opts.db },
    useNullAsDefault: true,
  });
  try {
    const k = await computeKpis(db);
    if (opts.format === 'json') {
      console.warn(JSON.stringify(k, null, 2));
    } else {
      console.warn(formatText(k));
    }
  } finally {
    await db.destroy();
  }
}

const isDirectInvocation = import.meta.url === `file://${argv[1]}`;
if (isDirectInvocation) {
  main().catch((err) => {
    console.error('[piloto-kpis] Error:', err.message);
    exit(1);
  });
}
```

- [ ] **Step 4: Add npm script**

Modify `wifi-voucher-manager/package.json`. In the `"scripts"` section, add:

```json
"kpis": "node scripts/piloto-kpis.mjs",
```

- [ ] **Step 5: Update vitest config to include .mjs**

The existing `vitest.config.ts` has `include: ['tests/unit/**/*.test.{ts,tsx}', ...]`. The test file `tests/unit/scripts/piloto-kpis.test.ts` is `.ts`, so it's already covered. The script itself is `.mjs` but TypeScript imports from it through the `.mjs` path explicitly. vitest should resolve `.mjs` via Node's default ESM resolution.

If the test fails with "Cannot find module ./piloto-kpis.mjs", check that vitest is configured to handle `.mjs` extensions — by default vite/vitest does. No config change needed.

- [ ] **Step 6: Run tests**

```
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm run test -- piloto-kpis
```
Expected: 4 passing.

- [ ] **Step 7: Run script smoke**

```
node scripts/piloto-kpis.mjs --help
node scripts/piloto-kpis.mjs --db ./test-fixture.db --format json 2>&1 | head -20
```

The first should print usage. The second may fail with "no such table" if `test-fixture.db` doesn't exist — that's expected. Just confirm the script doesn't crash with a syntax error.

- [ ] **Step 8: Lint + type-check**

```
npm run lint
npm run type-check
```

If lint complains about the `.mjs` file (project may not lint mjs), it's fine — the eslint config can ignore `.mjs` for scripts. Verify there are no errors on the `.ts` test file.

- [ ] **Step 9: Commit**

```bash
git add wifi-voucher-manager/scripts/piloto-kpis.mjs wifi-voucher-manager/tests/unit/scripts/piloto-kpis.test.ts wifi-voucher-manager/package.json
git commit -m "feat(fase-7): scripts/piloto-kpis.mjs — extrae 3 KPIs del piloto desde data.db"
```

DO NOT push — controller pushes at end of Fase 7.

---

## Bloque B — Runbooks (Tasks 2-8)

### Task 2: `docs/runbooks/PILOTO-DIA-0.md`

- [ ] **Step 1: Create the file**

```markdown
# Piloto — Día 0: Instalación + Configuración + Capacitación

> Runbook operativo para el técnico de Okuni Solutions que llega al restaurante el primer día. Asume 2-3 horas in situ.

## Pre-llegada (1 día antes)

1. Descarga el último `WiFi Voucher Manager Setup x.y.z.exe` del job `Build (windows-latest)` en GitHub Actions del commit `fase-6-complete` (o más reciente).
2. Calcula el hash SHA-256 y guárdalo:
   ```powershell
   Get-FileHash "WiFi Voucher Manager Setup 1.0.0.exe" -Algorithm SHA256
   ```
3. Verifica que la impresora térmica **Aomus My A1** está cargada y operativa. Carga papel térmico nuevo.
4. Si el router TP-Link Archer ya llegó, configura el SSID administrativo desde tu laptop antes de salir (más rápido que en sitio).
5. Lleva: el `.exe` en USB, papel térmico de repuesto, cable Ethernet de respaldo, adaptador BT 4.0+ USB por si la laptop no lo tiene integrado.

## En sitio — Instalación (30 min)

1. Conecta la laptop POS Dell Win11 a la red WiFi del restaurante.
2. Copia `WiFi Voucher Manager Setup 1.0.0.exe` desde el USB al escritorio.
3. Doble click — si Defender bloquea, sigue **Apéndice C** del `MANUAL-INSTALACION.md` (Procedimiento A: Desbloquear archivo).
4. Acepta términos → carpeta default → marca "Crear shortcut en escritorio" → "Instalar".
5. Al finalizar, marca "Ejecutar WiFi Voucher Manager" → "Finalizar".
6. La app abre. Si NO abre, revisa `%APPDATA%\wifi-voucher-manager\logs\main.log`.

## En sitio — Configuración admin (45 min)

1. Click en el engrane (esquina inferior derecha de la vista del mesero).
2. PIN inicial: `0000`.
3. El sistema fuerza cambio de PIN — **acuerda el PIN con el dueño** antes de elegirlo. Sugerencia: usa los últimos 4 dígitos del teléfono del dueño (memorable, no obvio).
4. Anota el PIN en tu hoja interna (NUNCA en papel que quede en el restaurante).
5. Auto-arranque se activa automáticamente tras cambiar el PIN (D-036).

### Configurar impresora
1. Admin → Impresora → "Detectar impresoras".
2. Espera 5-10 segundos. Busca **"Aomus My A1"** con badge **BLE**.
3. Click → testConnection automático → verde → "Usar esta impresora".
4. Vuelve a la vista del mesero → presiona "Imprimir QR de WiFi" → confirma que sale un voucher legible.

### Configurar router (si TP-Link presente)
1. Conecta el TP-Link al modem (puerto WAN) con Ethernet.
2. Crea/habilita Red Guest 2.4GHz con SSID `Restaurante-Clientes` (o el que el cliente quiera).
3. Pon cualquier contraseña temporal (≥8 chars) — la app la sobrescribe nocturnamente.
4. Admin → Router → llena IP/usuario/modelo/SSID guest + nueva contraseña router.
5. "Guardar" → "Probar conexión" → debe pasar los 3 pasos.

### Configurar negocio + programación
1. Admin → Negocio → Nombre del restaurante + mensaje al pie del voucher (ej. "Gracias por tu visita — ¡vuelve pronto!").
2. (Opcional) Drag-drop logo PNG/JPG del restaurante.
3. Admin → Programación → Hora rotación: **`23:00`** o el horario de cierre del local + 1h.

## En sitio — Capacitación del mesero (15 min)

Sigue `docs/runbooks/CAPACITACION-MESERO.md` con el mesero presente. Imprime físicamente ese documento para dejarlo en el local junto al `MANUAL-MESERO.md`.

## Cierre del Día 0

1. Imprime 3 vouchers seguidos para verificar consistencia.
2. Ejecuta "Rotar contraseña ahora" desde Admin → Inicio. Si OK, la contraseña queda aplicada al router; si falla, sigue el flujo de aplicación manual (banner rojo) — eso ya es parte del entrenamiento del admin.
3. Cierra la app (X), reabre — confirma que el PIN custom funciona y la config persistió.
4. Reinicia la laptop. Tras login de Windows, la app debe arrancar automáticamente (auto-launch D-036). Si no arranca, revisa Configuración → Aplicaciones → Inicio que esté habilitada.
5. Deja el `MANUAL-MESERO.md` y el `MANUAL-ADMIN.md` impresos junto a la laptop.
6. Envía un correo al dueño con: PIN admin, link al repo de soporte, contacto Okuni Solutions, hash SHA-256 del `.exe` instalado.

## Validaciones post-Día 0 (mismo día por la noche)

1. Desde Okuni HQ via RDP, conecta a la laptop.
2. Ejecuta:
   ```bash
   cd /path/to/wifi-voucher-manager
   npm run kpis
   ```
   o copia `data.db` y córrelo localmente.
3. Espera al menos: 3+ impresiones registradas, 1 rotación exitosa (la que disparaste manualmente).
4. Confirma `audit_log` tiene eventos `admin_login`, `admin_pin_change`, `config_change`, `print`, `password_rotation`.

## Si algo falla

- `INCIDENT-RESPONSE.md` cubre los modos de fallo comunes.
- Crítico (no abre / no imprime / no rota) → activar `HOTFIX-POLICY.md` flujo "Crítico" inmediatamente.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/PILOTO-DIA-0.md
git commit -m "docs(fase-7): runbook Día 0 — instalación + config + cierre"
```

---

### Task 3: `docs/runbooks/CAPACITACION-MESERO.md`

- [ ] **Step 1: Create the file**

```markdown
# Capacitación del Mesero — Guion 15 min

> Para el técnico de Okuni Solutions que entrena al mesero el Día 0. Imprime esta página, márcala mientras avanzas con cada punto.

## Objetivo

El mesero debe saber: (1) cómo imprimir un QR, (2) qué hacer si la impresión falla, (3) cuándo llamar al administrador y NO actuar por su cuenta.

## Minuto 0-3 — Introducción

1. Presentate: "Soy de Okuni Solutions, vine a instalar el sistema que va a imprimir el QR del WiFi para tus clientes."
2. Pregunta: "¿Has usado alguna vez un sistema POS con impresora térmica?" — adapta el lenguaje al nivel de tu interlocutor.
3. Explica el flujo en una frase: **"Cuando un cliente pida el WiFi, presionas un botón y la impresora te da un ticket con un código que el cliente escanea con su celular."**

## Minuto 3-6 — Demo guiada

1. Lleva al mesero frente a la laptop.
2. Apunta al botón grande "Imprimir QR de WiFi".
3. Tú presionas una vez — sale un voucher.
4. Recoge el voucher y entrégaselo. "Esto es lo que entregas al cliente."
5. Saca tu celular: abre la cámara, apunta al QR. Aparece la notificación "Conectar a Restaurante-Clientes". Click → conectado.
6. **Hazle hacer lo mismo:** él presiona el botón, recoge el ticket, lo entrega a un cliente real o usa el celular de él para escanear.

## Minuto 6-9 — Indicadores y errores

1. Apunta al **punto verde** "Sistema listo" abajo del botón. "Cuando esté así, está todo bien."
2. Le explicas las variantes:
   - **Punto amarillo** "Sin impresora activa": pide al administrador.
   - **Punto rojo** "Sin contraseña configurada": pide al administrador.
   - **Punto ámbar pequeño arriba-derecha**: avisar al administrador, no urgente.
3. Provoca un error para que lo vea: apaga la impresora momentáneamente, presiona el botón. Sale un banner rojo con "Reintentar".
4. Explica: "Si esto pasa, primero revisas que la impresora esté encendida y con papel. Después presionas 'Reintentar'. Si sigue fallando, llamas al administrador."

## Minuto 9-12 — Banner persistente "Contraseña pendiente"

1. Muestra una pantalla con el banner activo (si no hay uno real, usa un screenshot del MANUAL-MESERO.md).
2. Explica: "Si ves este banner rojo grande con una contraseña arriba, **NO imprimas tickets nuevos**. Avisa al administrador inmediatamente. La razón: el sistema generó una contraseña nueva pero el router no la aceptó. Si imprimes, los clientes no podrán conectarse."
3. Repite la frase clave: **"Si ves el banner rojo grande, no imprimas y avisa al admin."**

## Minuto 12-14 — Qué NO hacer

1. **NO reinicies la laptop** sin avisar — los tickets impresos se pueden perder de los logs.
2. **NO cierres la app** durante el horario de servicio — el mesero la usa todo el día.
3. **NO toques nada del panel de Administración** — eso es del dueño/administrador.
4. **NO le des el PIN admin a nadie** — sólo el dueño y Okuni Solutions lo conocen.

## Minuto 14-15 — Entrega y validación

1. Entrega impreso el `MANUAL-MESERO.md` (1 página).
2. Pregunta para validar: "Si la impresión falla 3 veces seguidas, ¿qué haces?"
   - Respuesta esperada: "Reviso impresora y papel. Si sigue mal, llamo al administrador."
3. Pregunta: "¿Qué haces si ves un banner rojo grande con una contraseña?"
   - Respuesta esperada: "No imprimo y aviso al administrador."
4. Felicítalo y termina.

## Tips

- Si el mesero es de mayor edad o no tiene experiencia con tablets, repite el demo 2 veces.
- Sí o sí imprime un voucher CON él presionando el botón — el knowledge tácito se gana ahí.
- Deja el `MANUAL-MESERO.md` pegado al escritorio o impreso en plástico junto a la laptop.
- Si el dueño está ausente, agenda una segunda visita corta (5 min) para entrenarlo a él en el flujo manual de la contraseña.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/CAPACITACION-MESERO.md
git commit -m "docs(fase-7): guion de capacitación al mesero 15 min"
```

---

### Task 4: `docs/runbooks/MONITOREO-DIARIO.md`

- [ ] **Step 1: Create the file**

```markdown
# Monitoreo diario del piloto

> Para el técnico de Okuni Solutions que monitorea el piloto Día 1-14. Asume conexión RDP a la laptop POS o copia diaria de `data.db`.

## Rutina diaria (5-10 min/día)

### 1. Conectar a la laptop POS

Via RDP a la IP fija del restaurante (acordada con el cliente Día 0). Si la laptop tiene DHCP, usa el hostname o `nslookup` desde la red del cliente.

### 2. Ejecutar el script de KPIs

```bash
cd /path/al/repo-clonado/wifi-voucher-manager
npm run kpis
```

Si no tienes el repo en el cliente, copia `%APPDATA%\wifi-voucher-manager\data.db` a tu máquina y corre allá:

```bash
npm run kpis -- --db /path/al/data.db
```

Output esperado:
```
=== KPIs del Piloto ===

Impresiones: 47/49 exitosas (95.9%)
Rotaciones:  6/6 exitosas (100.0%)
Días sin servicio: 0

Cumple objetivos (>=95% ambos): ✓ SÍ
```

### 3. Revisar audit_log de las últimas 24h

```sql
sqlite3 data.db <<EOF
SELECT
  event_type,
  COUNT(*) as n,
  MIN(created_at) as first,
  MAX(created_at) as last
FROM audit_log
WHERE created_at > datetime('now', '-1 day')
GROUP BY event_type
ORDER BY n DESC;
EOF
```

Buscas:
- `password_rotation` debe aparecer una vez por día (a la hora configurada, ej. 23:00).
- `print` debe coincidir aproximadamente con el volumen reportado por el dueño.
- `health_check` debe aparecer una vez por día a las 03:00.
- `error` debería ser raro o nulo. Si aparece, investigar.

### 4. Revisar el detalle del último health_check

```sql
SELECT created_at, payload FROM audit_log
WHERE event_type = 'health_check'
ORDER BY id DESC LIMIT 1;
```

Si `allPassed: false`, abre el payload y revisa cuál de los 6 probes falló:
- `db_integrity` — crítico, escala a Crítico (HOTFIX-POLICY).
- `disk_free` — revisa espacio en disco del cliente.
- `log_size` — si `data.db > 500 MB`, considerar exportar + truncar (no urgente).
- `last_rotation_recent` — si `false`, el scheduler dejó de rotar. Investigar.
- `printer_reach` — la impresora no está configurada activa. Revisa con el cliente.
- `router_reach` — el router está apagado/desconectado. Avisa al cliente.

### 5. Revisar prints fallidos de las últimas 24h

```sql
SELECT id, printed_at, error_message, password_id
FROM print_log
WHERE success = 0 AND printed_at > datetime('now', '-1 day');
```

Si hay fallos:
- Sigue `INCIDENT-RESPONSE.md` sección "Print fallido".
- Si son >5% del total del día, escalar.

### 6. Anotar en el log diario

Crea o continúa `docs/runbooks/piloto-log-YYYY-WW.md` (semana del año) con:
- Fecha + hora del check.
- KPIs en una línea: `prints: 47/49 (95.9%) | rot: 6/6 (100%) | dias-sin-srv: 0`.
- Cualquier anomalía observada.
- Acciones tomadas (si aplica).

## Frecuencia

- **Día 1-7:** chequeo diario completo (5-10 min). Sigue todas las secciones arriba.
- **Día 8-14:** chequeo cada 2-3 días sólo si `meetsTargets=true` el día anterior. Si baja a `false`, vuelve a chequeo diario.
- **Post-piloto (Día 15+):** chequeo semanal o ante alerta del cliente.

## Alertas

No hay alertas automatizadas en v1 (D-015 — no webhooks externos, solo audit_log). Las alertas reales son:
- El cliente llama / escribe diciendo "no funciona".
- En tu monitoreo diario detectas un drop en KPIs.

Si `meetsTargets=false` 2 días seguidos, escala a Crítico (HOTFIX-POLICY).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/MONITOREO-DIARIO.md
git commit -m "docs(fase-7): runbook de monitoreo diario con SQL queries"
```

---

### Task 5: `docs/runbooks/INCIDENT-RESPONSE.md`

- [ ] **Step 1: Create the file**

```markdown
# Respuesta a Incidentes — Piloto

> Catálogo de modos de fallo conocidos + remediación paso a paso. Cubre los incidentes esperables durante el piloto.

## INC-01: La app no abre

**Síntomas:** el ícono del escritorio no responde, o aparece y se cierra de inmediato.

**Triage:**
1. RDP a la laptop. Abrir CMD/PowerShell.
2. Ejecutar manualmente:
   ```powershell
   cd "C:\Users\<usuario>\AppData\Local\Programs\wifi-voucher-manager"
   .\WiFiVoucherManager.exe
   ```
3. Si la app abre con este comando pero no con doble-click → problema de permisos / shortcut roto.
4. Si la app no abre ni manualmente → revisar `%APPDATA%\wifi-voucher-manager\logs\main.log`.

**Remediación:**
- **Shortcut roto:** crear uno nuevo desde el .exe directamente.
- **DB corrupta:** ver INC-04.
- **Native module faltante:** reinstalar el `.exe` (no pierde datos, sólo reemplaza el ejecutable).
- **Otros:** escalar a Crítico, llevar la versión anterior del `.exe` si es necesario.

## INC-02: Impresión falla repetidamente

**Síntomas:** el mesero reporta que pulsa el botón y aparece banner rojo "Reintentar". Falla en 3+ intentos seguidos.

**Triage:**
1. Pregunta al cliente: ¿la impresora está encendida? ¿tiene papel? ¿hizo algún cambio?
2. RDP, abrir la app, ir a Admin → Logs → filtrar "print_log".
3. Examinar `error_message` de los últimos prints fallidos.

**Remediación por error:**
- `BLE: peripheral not found` → la impresora se desconectó. Apagar/encender impresora. Si persiste, re-ejecutar Discovery (Admin → Impresora → Detectar) y reasignar identifier.
- `Timeout` → revisar carga de la impresora (papel atascado, batería baja).
- `Permission denied` → reinstalar app + verificar permisos Bluetooth en Windows.

## INC-03: Rotación nocturna falla 3 veces seguidas

**Síntomas:** en `audit_log` aparecen 3 entradas `password_rotation` con `payload.success=false` en la misma noche. Banner manual aparece al día siguiente.

**Triage:**
1. Abrir el último `payload`: ¿qué dice `failedAt`?
2. Si `failedAt: 'login'` → password del router cambió o usuario incorrecto.
3. Si `failedAt: 'set-password'` → el router rechazó la nueva password (típicamente débil, pero PasswordService genera 10 chars de charset alfanumérico — no debería rechazar).
4. Si `failedAt: 'reach'` → router apagado/desconectado.

**Remediación:**
1. Hacer ping manual al router: `ping 192.168.1.1`.
2. Si responde, entrar via web a la interfaz admin y verificar:
   - SSID guest existe y está habilitado.
   - El usuario/password de admin no cambió.
3. Aplicar manualmente la password pendiente (botón en banner). Confirmar que el sistema vuelve a estado sano.
4. Si el problema persiste tras 2 noches, ver si el firmware del router cambió — D-028 documenta que sólo soportamos C24 v1.2.

## INC-04: DB corrupta o `data.db` desaparecida

**Síntomas:** la app abre pero no tiene datos (todos los paneles vacíos), o lanza error al arrancar.

**Triage:**
1. RDP, `cd %APPDATA%\wifi-voucher-manager\`.
2. ¿Existe `data.db`? Tamaño en KB.
3. Si existe: `sqlite3 data.db "PRAGMA integrity_check;"` — si reporta algo distinto a `ok`, la DB está corrupta.

**Remediación:**
- **DB faltante:** la app re-crea schema en el próximo arranque, pero los datos previos se perdieron. Continuar (no es bloqueador del piloto si pasó al Día 1, pero crítico si pasó al Día 5).
- **DB corrupta:** intentar `.recover` de sqlite3:
   ```bash
   sqlite3 data.db ".recover" | sqlite3 data-recovered.db
   mv data.db data-corrupt-backup.db
   mv data-recovered.db data.db
   ```
- Si recovery falla, restaurar de backup (si Okuni mantiene snapshots remotos) o continuar con DB vacía (peor caso aceptable en piloto).

## INC-05: Auto-arranque dejó de funcionar tras reinicio

**Síntomas:** después de reiniciar Windows, la app no abre sola. El mesero la abre manualmente y reporta que "antes arrancaba sola".

**Triage:**
1. Configuración → Aplicaciones → Inicio → buscar "WiFi Voucher Manager".
2. ¿Está activado?

**Remediación:**
- Si está activado pero no arranca: revisar `Get-EventLog -LogName Application -Source "WiFi Voucher Manager"`.
- Si está desactivado: el usuario lo desactivó manualmente. Re-actívalo. Si volvió a desactivarse solo, el usuario tiene Windows con política que bloquea startup items — escalar a TI del cliente.

## INC-06: `lastHealthCheckFailed=true` 3 días seguidos

**Síntomas:** dot ámbar visible en WaiterView. HomePanel reporta "Última falló".

**Triage:**
1. Abrir Admin → Logs → filtrar "health_check".
2. Examinar `payload.probes` del último check fallido.
3. Identificar el probe rojo:
   - `db_integrity: false` → ir a INC-04.
   - `disk_free: false` → revisar espacio en disco con `Get-PSDrive C`.
   - `log_size: false` → exportar audit_log a CSV (desde LogsPanel), luego truncar.
   - `last_rotation_recent: false` → ir a INC-03.
   - `printer_reach: false` → ir a INC-02.
   - `router_reach: false` → revisar conectividad del router.

**Remediación:** ver el INC correspondiente al probe rojo.

## INC-07: Cliente reporta que clientes no se pueden conectar al WiFi

**Síntomas:** el mesero dice "los clientes escanean el QR pero no se conectan".

**Triage:**
1. ¿Cuál es la password que el QR está codificando? Imprime un voucher y léelo (con un decoder de QR).
2. ¿Esa password coincide con la que está activa en el router?

**Remediación:**
- Si DIFIEREN → INC-03 (rotación falló pero el sistema cree que aplicó). Aplicar manualmente.
- Si COINCIDEN pero clientes no conectan → problema del router (banda 2.4GHz desactivada, MAC filter, etc.). Resolver desde la web admin del router.

## Escalación

Cualquier INC marcado **Crítico** en HOTFIX-POLICY debe escalar a Okuni Solutions HQ inmediatamente. Los demás se resuelven en monitoreo diario.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/INCIDENT-RESPONSE.md
git commit -m "docs(fase-7): catálogo de 7 incidentes comunes + remediación"
```

---

### Task 6: `docs/runbooks/HOTFIX-POLICY.md`

- [ ] **Step 1: Create the file**

```markdown
# Política de Hotfix — Piloto

> Cómo triagear, fixear y entregar parches durante el piloto.

## Triage — 3 categorías

### Crítico
**Definición:** el sistema NO permite operar el flujo principal.
- La app no abre (INC-01).
- No se puede imprimir ningún voucher (INC-02 con todas las impresoras fallando).
- La rotación falla 3 noches seguidas Y el banner manual no aparece o no funciona.
- DB corrupta sin posibilidad de recovery (INC-04 severo).

**SLA:** instalador parche entregado en **mismo día** (24h máx).

**Proceso:**
1. Confirmar el bug en local (reproducirlo).
2. Crear branch `hotfix/<descripción-corta>` desde `main` en el repo.
3. Escribir test de regresión que falle con el bug actual.
4. Aplicar el fix mínimo necesario (no refactors, no features).
5. Verificar que el test pasa + suite completa pasa (`npm run test`).
6. Lint + type-check + build limpios.
7. Merge a `main` (o PR si Okuni tiene política de PR).
8. Esperar CI green → descargar `installer-win-<sha>.exe` del artifact.
9. RDP al cliente → reinstalar → verificar fix en sitio.
10. Anotar en `piloto-log-YYYY-WW.md` el incidente, fix, commit SHA, hora de entrega.

### Medio
**Definición:** el sistema opera el flujo principal pero un panel admin tiene bug, un edge case falla, o un KPI quedó debajo del objetivo.
- Stats Panel no carga.
- Logs Panel filtra mal.
- Logo no se persiste correctamente (D-037 deja `business.logoPath` apuntando a archivo inexistente).
- `lastHealthCheckFailed` se queda en `true` indefinidamente aún cuando los probes pasan.

**SLA:** instalador parche entregado **dentro de la misma semana** (5-7 días).

**Proceso:**
1. Igual que crítico, pero con tiempo para revisar el approach.
2. Posibilidad de incluir múltiples fixes en el mismo instalador parche.
3. Coordinar con el cliente la ventana de reinstalación (idealmente fuera del horario operativo).

### Menor
**Definición:** mejora de UX, typo, documento mal redactado, log demasiado verboso, etc.

**SLA:** backlog v2. NO se entrega durante el piloto.

**Proceso:**
1. Anotar en `docs/runbooks/backlog-v2.md` (crear si no existe).
2. Si el cliente insiste, evaluar; pero por defecto, decir "lo agendamos para v2".

## Workflow de un hotfix crítico — paso a paso

### 1. Confirmar bug

- Captura del cliente (logs, screenshot, descripción).
- Reproducir en laptop dev. Si no se reproduce, intentar con copia de `data.db` del cliente.

### 2. Crear test de regresión

Aún si el bug es de UI, escribir un test (unit/integration) que falle con el código actual. Esto:
- Documenta el bug formalmente.
- Garantiza que el fix no se rompa en el futuro.

### 3. Fix mínimo

NO incluyas:
- Refactors no relacionados.
- Mejoras "que ya que estás".
- Cambios de naming.
- Features nuevas.

SOLO el cambio que hace pasar el test.

### 4. Commit + push

```bash
git checkout -b hotfix/<descripcion>
git add <archivos>
git commit -m "fix(hotfix): <descripción corta> — refs INC-XX"
git push -u origin hotfix/<descripcion>
```

Si no usas PR, merge directo a main:
```bash
git checkout main
git merge --no-ff hotfix/<descripcion>
git push origin main
```

### 5. CI build

GitHub Actions detecta el push, corre lint+test+build matrix. **Espera a que el job Windows pase** — sin eso no hay `.exe` actualizado.

Descargar `installer-win-<sha>.exe` del último run del workflow.

### 6. Deploy al cliente

RDP a la laptop. Cerrar la app. Reinstalar el `.exe`. Reabrir. Verificar el fix.

### 7. Documentar

En `docs/runbooks/piloto-log-YYYY-WW.md`:
```markdown
## INC-XX (Crítico) — descripción

- **Detectado:** YYYY-MM-DD HH:MM por <reporter>
- **Bug:** descripción
- **Test regresión:** path/to/test.ts
- **Fix:** commit SHA + descripción de 1 línea
- **Deploy:** YYYY-MM-DD HH:MM, .exe versión x.y.z
- **Verificación post-deploy:** breve, qué confirmó que el fix funcionó.
```

## Reglas duras

1. **Cada bug crítico/medio tiene un test de regresión antes del fix.** Sin excepción.
2. **Nunca skipear CI** — el `.exe` que va al cliente DEBE haber pasado los 263+ tests.
3. **Backup de `data.db` antes de reinstalar.** Aún cuando el instalador preserva datos, un backup local cuesta 5 seg y evita pérdida si algo sale mal.
4. **Comunicación con el cliente:** avisar antes de tocar la laptop. Acordar ventana de mantenimiento.
5. **Documentar en el log de la semana** — sin esto, perdemos trazabilidad post-piloto.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/HOTFIX-POLICY.md
git commit -m "docs(fase-7): política de hotfix con SLAs crítico/medio/menor"
```

---

### Task 7: `docs/runbooks/PILOTO-EXIT-CRITERIA.md`

- [ ] **Step 1: Create the file**

```markdown
# Criterios de salida del piloto — Transición a v1 GA

> Qué tiene que pasar al final del piloto (Día 14 idealmente) para considerar v1 listo para producción "GA" (General Availability — facturación, marketing, escalamiento).

## KPIs cuantitativos (must-pass)

Al cierre del piloto, ejecutar `npm run kpis`. Los 3 KPIs DEBEN cumplirse:

| KPI | Objetivo | Cómo se mide |
|---|---|---|
| Días sin servicio en primera semana | **0** | `daysWithoutService` en KPIs script |
| % impresiones exitosas | **≥ 95%** | `printSuccessRate` |
| % rotaciones exitosas | **≥ 95%** | `rotationSuccessRate` (sólo cuenta rotaciones automáticas + manuales confirmadas) |

Si **cualquiera de los 3** está debajo del objetivo, el piloto NO cierra exitosamente. Análisis raíz + extensión de piloto 1 semana adicional.

## Criterios cualitativos (must-pass)

1. **Operador final satisfecho:** entrevista de 15 min con el dueño del restaurante. Preguntas:
   - "¿La app interrumpió alguna vez el servicio al cliente?"
   - "¿El mesero necesita ayuda recurrente para usar la app?"
   - "¿Sentiste el sistema confiable durante el piloto?"
   - "¿Si no tuvieras este sistema, qué harías?"
   - "¿Recomendarías este sistema a otro restaurante?"

   Las primeras 3 deben tener respuestas positivas. Las 2 últimas son para marketing.

2. **No hay hotfix crítico abierto sin deployar.** Todos los bugs críticos/medios identificados durante el piloto deben estar fixeados y deployados al cliente.

3. **Audit security manual:** el técnico de Okuni Solutions debe verificar al menos:
   - El PIN del admin sigue siendo el custom que el dueño eligió (no se reseteó).
   - El auto-arranque sigue activado.
   - `data.db` no excede 100 MB.
   - Los logs (`main.log`) no contienen passwords en texto plano (verificar contra D-030 sanitización de logs).

4. **Datos preservados en updates:** si durante el piloto se reinstaló el `.exe` 1+ veces, verificar que toda la config y los logs se preservaron en cada update.

## Criterios bloqueantes (must-not-have)

El piloto NO cierra exitosamente si:

- Algún bug Crítico abierto sin deploy (HOTFIX-POLICY).
- Pérdida de datos durante el piloto (ej. `data.db` desapareció y no se pudo recuperar — INC-04).
- El cliente reportó >2 noches sin WiFi para clientes (>2 fallos consecutivos de rotación sin remediación manual).
- Defender bloqueó el `.exe` y forzó una reinstalación con Apéndice C cada vez que reiniciaron Windows. Si pasa esto, considerar firmar el `.exe` antes de GA.

## Transición a GA

Si TODOS los criterios pasan:

1. **Tag v1 GA:**
   ```bash
   git tag v1.0.0 -m "v1 GA — piloto completado exitosamente <fecha>"
   git push origin v1.0.0
   ```

2. **Snapshot del último `.exe`:**
   - Renombrar el `.exe` final a `WiFi-Voucher-Manager-v1.0.0.exe`.
   - Publicar en GitHub Releases con el tag `v1.0.0`.
   - Calcular y publicar SHA-256 en la descripción del release.

3. **Documentación pública:**
   - Update `README.md` del repo con la sección "Releases" + link al v1.0.0.
   - Update `MANUAL-INSTALACION.md` § 2 para que apunte a GitHub Releases en lugar del CI artifact.

4. **Cliente:**
   - Email al dueño confirmando que el piloto cerró exitosamente.
   - Activar facturación / contrato de mantenimiento si aplica.
   - Acordar ventana de soporte: mensual / trimestral.

5. **Internal:**
   - Crear `docs/post-piloto-retrospectiva.md` con lecciones aprendidas, bugs encontrados, mejoras sugeridas para v2.
   - Backlog v2 documentado en `docs/runbooks/backlog-v2.md`.

## Si el piloto NO cierra

Análisis raíz:
- ¿Cuáles fueron los KPIs reales?
- ¿Qué tipo de fallo dominó (impresión, rotación, app crashes)?
- ¿Es un problema del producto o del entorno (hardware del cliente, red, etc.)?

Decisiones:
- **Extender piloto 1 semana** con un hotfix dirigido al problema dominante.
- **Volver a Fase 6** si hay un cambio de producto necesario (rare).
- **Cancelar** si el modelo de negocio no funciona (very rare).
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/PILOTO-EXIT-CRITERIA.md
git commit -m "docs(fase-7): criterios de exit del piloto + transición a v1 GA"
```

---

### Task 8: `docs/runbooks/STATS-WEEKLY-TEMPLATE.md`

- [ ] **Step 1: Create the file**

```markdown
# Reporte semanal del piloto — Template

> Llena esta plantilla cada lunes durante el piloto. Envíala al equipo Okuni Solutions y al dueño del restaurante.

---

## Semana N (YYYY-MM-DD a YYYY-MM-DD)

### KPIs

Ejecutar `npm run kpis` y pegar el output:

```
=== KPIs del Piloto ===

Impresiones: X/Y exitosas (Z%)
Rotaciones:  X/Y exitosas (Z%)
Días sin servicio: 0

Cumple objetivos (>=95% ambos): ✓ SÍ
```

### Volumen del periodo

| Métrica | Total semana | Promedio diario |
|---|---|---|
| Impresiones | | |
| Rotaciones | | |
| Health checks | | |
| Errores en audit_log | | |

### Incidentes

Lista los INC-* del catálogo abiertos esta semana:

- **INC-XX:** descripción + estado (resuelto / pendiente).

### Hotfixes deployados

- **Commit SHA + fecha + tipo (crítico/medio):** descripción del fix.

### Notas del operador

Cualquier feedback del mesero o del dueño que valga la pena documentar:

- "..."

### Acciones para la próxima semana

- [ ] Revisar X.
- [ ] Coordinar Y con el cliente.

---

## Cómo enviar el reporte

1. Guardar este archivo como `docs/runbooks/piloto-log-YYYY-WW.md` (semana del año, ej. `piloto-log-2026-W20.md`).
2. Commit + push al repo.
3. Copiar el contenido a un email + enviar a: equipo Okuni Solutions + dueño del restaurante.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/STATS-WEEKLY-TEMPLATE.md
git commit -m "docs(fase-7): template para reporte semanal del piloto"
```

---

## Bloque C — Cierre (Task 9)

### Task 9: DECISIONS.md + tag `fase-7-ready`

- [ ] **Step 1: Append D-039 to DECISIONS.md**

Justo antes de la sección `## Excepciones registradas` (o tras D-038):

```markdown
## D-039 ✅ Activa — Fase 7 entrega runbooks operativos, no código (Fase 7)

**Decisión:** Fase 7 NO modifica el producto. Entrega 7 runbooks Markdown en `docs/runbooks/` + un script Node `scripts/piloto-kpis.mjs` para extracción de métricas. La operación real del piloto (1-2 semanas) sucede post-tag con código v1 inmutable.

**Why:** el spec posiciona Fase 7 como "operación", no como "desarrollo". Cualquier cambio de código durante el piloto se canaliza via `HOTFIX-POLICY.md` con SLA explícito y test de regresión.

**Impacto:** el tag `fase-7-ready` marca el READY del piloto (todo documentado, instalador funciona). El cierre exitoso del piloto se marca aparte con `v1.0.0` (Tag GA), siguiendo `PILOTO-EXIT-CRITERIA.md`.
```

- [ ] **Step 2: Run final gates**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm run lint
npm run type-check
npm run test
npm run build
```

Esperado: lint 0 warnings, type-check clean, 270+ tests passing (266 de Fase 6 + 4 de Task 1), build OK.

- [ ] **Step 3: Commit DECISIONS + plan**

```bash
git add wifi-voucher-manager/DECISIONS.md docs/superpowers/plans/2026-05-13-fase-7-piloto-runbook.md
git commit -m "docs(fase-7): D-039 + plan de implementación 9 tasks"
```

- [ ] **Step 4: Tag + push**

```bash
git tag fase-7-ready -m "Fase 7 READY: runbooks operativos + script de KPIs + política de hotfix. v1 lista para piloto en producción."
git push origin main
git push origin fase-7-ready
```

---

## Self-review post-plan

**Spec coverage (Sección 5 Fase 7):**
- ✅ Día 0 instalación + config + capacitación 15 min → Tasks 2, 3
- ✅ Día 1-7 monitoreo intensivo via RDP — runbook diario con SQL queries → Task 4
- ✅ Día 8-14 monitoreo pasivo + standby — frecuencia diferida en Task 4
- ✅ Smoke test diario D-015 — ya implementado en Fase 5 (HealthCheckService); en runbook se describe cómo revisarlo → Task 4
- ✅ Política de hotfix: crítico/medio/menor + test de regresión antes del fix → Task 6
- ✅ KPIs: 0 días sin servicio + ≥95% prints + ≥95% rotaciones → Task 1 (script) + Task 7 (exit criteria)
- ✅ Cada bug → test de regresión antes del fix → Task 6 sección "Reglas duras"

**No-placeholders scan:** revisado. Los runbooks son extensos y completos; el script tiene código real con tests. No quedan "TBD" ni "completar después".

**Type consistency:**
- `computeKpis` retorna shape consistente (totalPrints, successfulPrints, etc.) en todos los call sites del script
- Tests en Task 1 usan `audit_log.payload` como JSON string con `json_extract` — consistente con Fase 5 StatsService

**Lo que sigue pendiente para post-tag (memoria):**
- Ejecutar el piloto real (1-2 semanas operación) → genera datos para los KPIs
- Llenar el primer `piloto-log-YYYY-W20.md` con el Día 0 + Día 1 al final del primer día
- Tag `v1.0.0` cuando los criterios de exit pasen
- Crear `docs/post-piloto-retrospectiva.md` post-piloto
- Backlog v2 acumulado durante el piloto
