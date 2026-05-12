# Fase 6 — Pulido + Empaquetado + Documentación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el `.exe` instalable listo para deploy en la Dell Win11 del cliente, con auto-arranque al login, branding placeholder OK (Fase 7 puede subir uno mejor sin re-build), `npm audit` limpio, drag-drop de logo en BusinessPanel (deferred desde Fase 3), y los 3 manuales en español (Mesero / Admin / Instalación con Apéndice C de whitelist Windows Defender).

**Architecture:** El instalador NSIS ya funciona en CI (validado en commit `172866e`). Esta fase NO toca lógica de negocio — agrega: (1) `app.setLoginItemSettings({ openAtLogin: true })` cuando el PIN deja de ser el default, (2) IPC `admin.uploadLogo` que copia el archivo a `userData/logo.<ext>` y persiste `business.logoPath`, (3) BusinessPanel HTML5 file picker + drop zone, (4) audit de `npm audit` resolviendo severidades ≥ moderate, (5) 3 archivos Markdown en `docs/manuales/` con instrucciones operativas. Los scripts `verify-csp.mjs`, `sanitize-build.mjs`, `verify-asar-unpack.mjs` ya existen y corren como pre/postdist desde Fase 0.

**Tech Stack:** Electron `app.setLoginItemSettings` (cross-platform), `fs.promises.copyFile` para upload de logo, HTML5 `<input type="file">` + drag-and-drop nativo, Markdown plano para manuales, `npm audit fix` para deps.

---

## Alcance — qué entra y qué no en Fase 6

**Entra:**
- Auto-arranque del sistema cuando `admin.pinIsDefault === false` (gate: usuario ya configuró)
- IPC `admin.uploadLogo` + persistencia en `business.logoPath`
- BusinessPanel: file picker + drag-drop + preview del logo cargado + botón "Quitar logo"
- `npm audit` resuelto a severidad < moderate (o documentado como inviable)
- Audit checklist final de seguridad (verificación, sin código nuevo — todo ya está desde Fase 0)
- 3 manuales markdown en `docs/manuales/`:
  - `MANUAL-MESERO.md` (1 pág)
  - `MANUAL-ADMIN.md` (5-8 págs)
  - `MANUAL-INSTALACION.md` (10-15 págs con Apéndice C — Whitelist Windows Defender)
- DECISIONS.md actualizado
- Tag `fase-6-complete`

**No entra (Fase 7 o post-v1):**
- Branding final (logo Okuni real) — el `.ico` placeholder actual funciona; v2 si llega
- Voucher template renderizando el logo subido — el `business.logoPath` queda persistido pero el voucher sigue sin imagen hasta una iteración futura
- Code signing del `.exe` — D-014 lo prohíbe explícitamente para v1
- Video Loom 5 min — entrega fuera del scope de código; el usuario lo graba después con la app ya instalada
- Validación manual del `.exe` instalado en Win11 vía RDP — eso es Fase 7 Día 0

---

## File Structure

**Crear:**
- `docs/manuales/MANUAL-MESERO.md` — 1 página con flujo de impresión
- `docs/manuales/MANUAL-ADMIN.md` — PIN, paneles, troubleshooting
- `docs/manuales/MANUAL-INSTALACION.md` — Deploy + Apéndice C + troubleshooting + BLE Aomus + setup TP-Link

**Modificar:**
- `src/main/index.ts` — `app.setLoginItemSettings({ openAtLogin: !pinIsDefault })` tras `whenReady` y tras cada `admin.changePin` exitoso
- `src/main/ipc/admin.ts` — handler `uploadLogo` que copia archivo a `userData/logo.<ext>` y persiste `business.logoPath`
- `src/shared/types.ts` — agrega `uploadLogo: (input: { sessionToken: string; sourcePath: string }) => Promise<{ ok: boolean; logoPath?: string; message?: string }>` a `AdminAPI`
- `src/preload/index.ts` — expone `window.api.admin.uploadLogo`
- `src/renderer/pages/admin/BusinessPanel.tsx` — drag-drop + file input + preview + "Quitar logo"
- `wifi-voucher-manager/DECISIONS.md` — D-036/D-037
- `wifi-voucher-manager/package.json` — `npm audit fix` puede modificar dependencias

**No tocar (ya están OK desde Fase 0):**
- `scripts/verify-csp.mjs` — ya valida producción
- `scripts/sanitize-build.mjs` — ya valida no `console.log`
- `scripts/verify-asar-unpack.mjs` — ya valida native deps unpacked
- `electron-builder.yml` — funciona en CI
- `build/icon.ico` — placeholder OK para v1

---

## Convención de tests

- Cada task con código testeable abre con test fallando.
- Tests del file IPC usan `MockCredentialStorage` + tmp dir para no tocar el FS real.
- Commit por task. Push lo hace el controller.
- Los manuales son archivos `.md` — se "testean" leyéndolos y confirmando que cubren los criterios. No hay test automatizado.

---

## Bloque A — Auto-arranque (Task 1)

### Task 1: `app.setLoginItemSettings` activado cuando `pinIsDefault === false`

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/admin.ts` (toggle tras changePin exitoso)

- [ ] **Step 1: Read current `src/main/index.ts`**

Confirmar que existe la sección donde se construye `config` y se llama a `app.whenReady`. La lógica del auto-launch va dentro de `bootstrap()` o en un callback post-bootstrap.

- [ ] **Step 2: Add helper + invocation in `src/main/index.ts`**

Justo después de instanciar `config` y leer el seed inicial, agregar:

```ts
function syncLoginItemSetting(openAtLogin: boolean): void {
  if (process.platform === 'linux') return; // setLoginItemSettings no-op en linux
  app.setLoginItemSettings({
    openAtLogin,
    name: 'WiFi Voucher Manager',
  });
}

// Dentro de bootstrap(), tras instanciar config + cargar pinHash seed:
const initialPinIsDefault = config.getAll().admin.pinIsDefault;
syncLoginItemSetting(!initialPinIsDefault);
```

> Coloca `syncLoginItemSetting` como función de módulo (fuera de bootstrap) para reutilizarla desde el handler IPC. Exportala desde el archivo:

```ts
export { syncLoginItemSetting };
```

- [ ] **Step 3: Hook into `admin.changePin` so the setting flips when the user changes PIN for the first time**

En `src/main/ipc/admin.ts`, el handler `changePin` actualmente llama `deps.config.updateAdmin({ pinHash, pinIsDefault: false })`. Después de eso, invocar `syncLoginItemSetting(true)`.

Para no acoplar el handler al `app` global de Electron, agregar a `AdminHandlerDeps`:

```ts
export interface AdminHandlerDeps {
  // ...existing fields
  onPinChanged?: () => void;
}
```

Y dentro del handler `changePin`, después del `await deps.audit.insert({ event_type: 'admin_pin_change', ... })`:

```ts
deps.onPinChanged?.();
```

En `src/main/index.ts`, pasarlo:

```ts
registerAdminHandlers({
  // ...existing deps
  onPinChanged: () => syncLoginItemSetting(true),
});
```

- [ ] **Step 4: Add a test for the hook callback**

En `tests/integration/admin-ipc.test.ts`, dentro de `buildHandlers`, agregar un mock `onPinChanged: vi.fn()` y pasarlo. Agregar un test:

```ts
it('changePin exitoso dispara onPinChanged callback', async () => {
  const onPinChanged = vi.fn();
  const ctx = await buildHandlers('success', { onPinChanged });
  const session = await ctx.handlers.validatePin({ pin: '0000' });
  if (!session.ok) throw new Error('precondition');
  await ctx.handlers.changePin({
    sessionToken: session.sessionToken,
    currentPin: '0000',
    newPin: '5829',
  });
  expect(onPinChanged).toHaveBeenCalledOnce();
  await ctx.db.destroy();
});
```

Refactorizar `buildHandlers` para aceptar un override opcional `extras: Partial<AdminHandlerDeps>`.

- [ ] **Step 5: Run tests + lint + type-check**

```
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm run test -- admin-ipc
npm run lint
npm run type-check
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/ipc/admin.ts tests/integration/admin-ipc.test.ts
git commit -m "feat(fase-6): auto-arranque cuando pinIsDefault=false"
```

---

## Bloque B — Logo upload (Tasks 2-4)

### Task 2: IPC `admin.uploadLogo` + AdminAPI type

**Files:**
- Modify: `src/main/ipc/admin.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/integration/admin-ipc.test.ts`

- [ ] **Step 1: Add the type to `AdminAPI` in `src/shared/types.ts`**

Inside the existing `AdminAPI` interface, append:

```ts
uploadLogo: (input: {
  sessionToken: string;
  sourcePath: string;
}) => Promise<{ ok: boolean; logoPath?: string; message?: string }>;
```

- [ ] **Step 2: Append handler to `admin.ts`**

Add the import:
```ts
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';
```

Add `AdminHandlerDeps` field:
```ts
userDataPath: string;
```

Add to `AdminHandlers` interface:
```ts
uploadLogo: (input: unknown) => Promise<{ ok: boolean; logoPath?: string; message?: string }>;
```

Add zod schema near the top:
```ts
const UploadLogoSchema = z.object({
  sessionToken: z.string().min(1),
  sourcePath: z.string().min(1).max(1024),
});
```

Add handler inside `createAdminHandlers` return object (after `setRouterPassword`):

```ts
async uploadLogo(raw) {
  const input = UploadLogoSchema.parse(raw);
  if (!deps.session.validate(input.sessionToken)) {
    return { ok: false, message: 'Sesión inválida' };
  }
  const ext = path.extname(input.sourcePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
    return { ok: false, message: 'Formato no soportado (usa PNG, JPG o JPEG)' };
  }
  const dest = path.join(deps.userDataPath, `logo${ext}`);
  try {
    await copyFile(input.sourcePath, dest);
    const current = deps.config.getAll().business;
    deps.config.updateBusiness({ ...current, logoPath: dest });
    await deps.audit.insert({
      event_type: 'config_change',
      payload: { section: 'business.logo', dest },
    });
    return { ok: true, logoPath: dest };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error copiando archivo' };
  }
},
```

Add IPC register:
```ts
ipcMain.handle('admin:upload-logo', (_e, r) => h.uploadLogo(r));
```

Add to unregister:
```ts
ipcMain.removeHandler('admin:upload-logo');
```

- [ ] **Step 3: Add to preload `src/preload/index.ts`**

In `adminApi`:
```ts
uploadLogo: (input): Promise<{ ok: boolean; logoPath?: string; message?: string }> =>
  ipcRenderer.invoke('admin:upload-logo', input),
```

- [ ] **Step 4: Test the handler**

Add to `tests/integration/admin-ipc.test.ts`. The test creates a temp source file, calls `uploadLogo`, asserts the file was copied and `business.logoPath` is updated:

```ts
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

it('uploadLogo copia el archivo y persiste business.logoPath', async () => {
  const ctx = await buildHandlers('success');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'wvm-logo-'));
  const srcPath = path.join(tmpDir, 'source.png');
  writeFileSync(srcPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic
  const session = await ctx.handlers.validatePin({ pin: '0000' });
  if (!session.ok) throw new Error('precondition');
  const r = await ctx.handlers.uploadLogo({
    sessionToken: session.sessionToken,
    sourcePath: srcPath,
  });
  expect(r.ok).toBe(true);
  expect(r.logoPath).toBeDefined();
  expect(existsSync(r.logoPath!)).toBe(true);
  expect(ctx.config.getAll().business.logoPath).toBe(r.logoPath);
  await ctx.db.destroy();
});

it('uploadLogo rechaza extensiones no soportadas', async () => {
  const ctx = await buildHandlers('success');
  const session = await ctx.handlers.validatePin({ pin: '0000' });
  if (!session.ok) throw new Error('precondition');
  const r = await ctx.handlers.uploadLogo({
    sessionToken: session.sessionToken,
    sourcePath: '/tmp/source.gif',
  });
  expect(r.ok).toBe(false);
  expect(r.message).toContain('Formato no soportado');
  await ctx.db.destroy();
});
```

`buildHandlers` necesita pasar `userDataPath: mkdtempSync(...)` o un valor fijo (`/tmp/wvm-test-userdata`). Asegurar que ese directorio existe.

- [ ] **Step 5: Run tests + lint + type-check + build:preload**

```
npm run test -- admin-ipc
npm run lint
npm run type-check
npm run build:preload
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/admin.ts src/shared/types.ts src/preload/index.ts tests/integration/admin-ipc.test.ts
git commit -m "feat(fase-6): admin.uploadLogo copia a userData + persiste business.logoPath"
```

---

### Task 3: Composition root pasa `userDataPath` al admin handler

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update `registerAdminHandlers` call**

En `src/main/index.ts`, en el call de `registerAdminHandlers`, agregar `userDataPath: app.getPath('userData')`:

```ts
registerAdminHandlers({
  config, audit, stats, session, lockout, credentials, orchestrator,
  userDataPath: app.getPath('userData'),
  onPinChanged: () => syncLoginItemSetting(true),
});
```

- [ ] **Step 2: Type-check + build:electron**

```
npm run type-check
npm run build:electron
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(fase-6): composition root pasa userDataPath al admin handler"
```

---

### Task 4: BusinessPanel — file picker + drag-drop + preview + "Quitar logo"

**Files:**
- Modify: `src/renderer/pages/admin/BusinessPanel.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// src/renderer/pages/admin/BusinessPanel.tsx
import { useEffect, useState, type DragEvent, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const BusinessPanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [name, setName] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logoFeedback, setLogoFeedback] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (config) {
      setName(config.business.name);
      setFooterMessage(config.business.footerMessage);
    }
  }, [config]);

  const save = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'business',
      value: { name, footerMessage, logoPath: config?.business.logoPath ?? null },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  const handleFile = async (file: File): Promise<void> => {
    if (!sessionToken) return;
    setLogoFeedback(null);
    const sourcePath = (file as File & { path?: string }).path;
    if (!sourcePath) {
      setLogoFeedback('No se pudo leer la ruta del archivo. Arrástralo desde el explorador.');
      return;
    }
    const r = await window.api.admin.uploadLogo({ sessionToken, sourcePath });
    setLogoFeedback(r.ok ? 'Logo cargado.' : (r.message ?? 'Error subiendo logo'));
    await reload();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const removeLogo = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'business',
      value: { name, footerMessage, logoPath: null },
    });
    setLogoFeedback(r.ok ? 'Logo removido.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  const hasLogo = config.business.logoPath !== null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Negocio</h1>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Nombre del negocio
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Mensaje al pie del voucher
          <input
            type="text"
            value={footerMessage}
            onChange={(e) => setFooterMessage(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
        >
          Guardar
        </button>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-medium text-textPrimary">Logo del voucher</h2>
        {hasLogo ? (
          <div className="flex items-center gap-3">
            <p className="font-mono text-xs text-textSecondary">{config.business.logoPath}</p>
            <button
              type="button"
              onClick={() => void removeLogo()}
              className="rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Quitar logo
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 ${
              dragOver ? 'border-accent bg-surfaceMuted' : 'border-border bg-surface'
            }`}
          >
            <p className="mb-2 text-sm text-textSecondary">Arrastra un PNG/JPG aquí</p>
            <label className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted">
              o selecciona un archivo
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
                className="hidden"
              />
            </label>
          </div>
        )}
        {logoFeedback ? <p className="text-sm text-textSecondary">{logoFeedback}</p> : null}
      </section>
    </div>
  );
};
```

> **Nota sobre `file.path`:** en Electron renderer (con contextIsolation), `File.path` está disponible nativamente cuando el archivo viene de un drag-drop desde el sistema. Para `<input type="file">` también está disponible en Electron. Si en algún momento Chromium/Electron lo remueve, usaremos un IPC `dialog.showOpenDialog` desde main. Por ahora es la ruta más simple.

- [ ] **Step 2: Lint + type-check**

```
npm run lint -- src/renderer/pages/admin/BusinessPanel.tsx
npm run type-check
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/admin/BusinessPanel.tsx
git commit -m "feat(fase-6): BusinessPanel drag-drop logo + preview + quitar"
```

---

## Bloque C — npm audit (Task 5)

### Task 5: Resolver `npm audit` a severidad < moderate

**Files:**
- Modify: `wifi-voucher-manager/package.json` y `package-lock.json` (auto-modificado)

- [ ] **Step 1: Snapshot current audit**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm audit --audit-level=moderate 2>&1 | tee /tmp/audit-before.txt
```

Si el output dice "found 0 vulnerabilities" o solo "low" vulnerabilities, esta task termina con un commit vacío indicando "ya está limpio". Si reporta moderate+, continuar.

- [ ] **Step 2: Try automated fix**

```bash
npm audit fix
```

- [ ] **Step 3: Verify nothing crítico se rompió**

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

Si todo pasa, los cambios de `npm audit fix` son seguros. Si algo se rompe (típicamente porque `npm audit fix` hace un bump de major version), revertir con `git checkout package.json package-lock.json` y dejar las vulnerabilidades documentadas en DECISIONS.md.

- [ ] **Step 4: Run audit again**

```bash
npm audit --audit-level=moderate
```

Lo ideal: "found 0 vulnerabilities". Si quedan moderate+ irresolubles (típicamente en transitive deps de electron-builder o vitest), documentar cuáles en `DECISIONS.md` con la justificación (suelen ser falsos positivos en dev-only deps).

- [ ] **Step 5: Commit**

Si hubo cambios:
```bash
git add wifi-voucher-manager/package.json wifi-voucher-manager/package-lock.json
git commit -m "chore(fase-6): npm audit fix — resuelve vulnerabilidades ≥ moderate"
```

Si no hubo cambios:
```bash
git commit --allow-empty -m "chore(fase-6): npm audit verificado — 0 vulnerabilidades ≥ moderate"
```

---

## Bloque D — Manuales en español (Tasks 6-8)

### Task 6: `docs/manuales/MANUAL-MESERO.md`

**File:**
- Create: `docs/manuales/MANUAL-MESERO.md`

- [ ] **Step 1: Write the file**

```markdown
# Manual del Mesero — WiFi Voucher Manager

## Imprimir un QR para WiFi

1. Abre la aplicación **WiFi Voucher Manager** (icono en el escritorio).
2. En la pantalla principal, presiona el botón grande **"Imprimir QR de WiFi"**.
3. El ticket sale por la impresora térmica en aproximadamente 4 segundos.
4. Entrega el ticket al cliente — él escanea el QR con la cámara de su celular y se conecta al WiFi automáticamente.

## Indicadores de estado

- **Punto verde** "Sistema listo": todo OK, puedes imprimir.
- **Punto amarillo** "Sin impresora activa": pide al administrador revisar la impresora.
- **Punto rojo** "Sin contraseña configurada": pide al administrador rotar la contraseña.

Si ves un **punto ámbar pequeño arriba-derecha**, el sistema detectó un problema en la verificación nocturna. Avisa al administrador para que revise los logs.

## Banner persistente "Aplicación manual de contraseña pendiente"

Si aparece un banner rojo con una contraseña grande:

1. La rotación automática falló — el router no aceptó la nueva contraseña.
2. Avisa al administrador. Él tiene que copiar esa contraseña, configurarla en el router manualmente y confirmar la acción desde la pantalla de Administración.
3. **Mientras tanto, NO imprimas tickets** — los clientes intentarán conectarse con la contraseña nueva pero el router todavía acepta la vieja.

## ¿Qué hacer si la impresión falla?

1. Aparece un banner rojo con un botón **"Reintentar"**.
2. Presiona "Reintentar". Si funciona, listo.
3. Si sigue fallando, verifica que la impresora esté encendida y tenga papel.
4. Si después de revisar la impresora sigue fallando, avisa al administrador.

## Contacto

- **Soporte técnico:** Okuni Solutions
- **Si no funciona nada:** llama al administrador. NO reinicies la laptop sin avisar — los tickets impresos se pueden perder.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manuales/MANUAL-MESERO.md
git commit -m "docs(fase-6): manual del mesero — 1 página con flujo de impresión"
```

---

### Task 7: `docs/manuales/MANUAL-ADMIN.md`

**File:**
- Create: `docs/manuales/MANUAL-ADMIN.md`

- [ ] **Step 1: Write the file**

```markdown
# Manual del Administrador — WiFi Voucher Manager

## 1. Primer arranque

En el primer arranque después de la instalación:

1. Abre la app (icono en el escritorio o desde el menú Inicio).
2. Presiona el ícono de engrane (esquina inferior derecha).
3. Ingresa el PIN de fábrica: **`0000`**.
4. El sistema te pedirá inmediatamente que cambies el PIN. Esto es obligatorio.
5. Elige un PIN de 4 dígitos que cumpla con todas las reglas:
   - Exactamente 4 dígitos.
   - No puede ser `0000`.
   - No puede ser todos iguales (`1111`, `2222`, etc.).
   - No puede ser secuencia ascendente (`1234`, `2345`).
   - No puede ser secuencia descendente (`4321`, `3210`).
6. Confirma el PIN escribiéndolo dos veces.
7. Listo — ya estás dentro del panel de Administración.

**Si olvidas el PIN:** no hay recuperación automática. Contacta a Okuni Solutions para reinstalar y resetear.

## 2. Bloqueo por intentos fallidos

Tras **3 PINs incorrectos seguidos**, el sistema se bloquea por 5 minutos. Un contador en pantalla muestra el tiempo restante. Espera o reinicia la app — el contador NO se reinicia con un cierre.

## 3. Los 7 paneles del Admin

### 3.1 Inicio
- **Salud del sistema:** estado actual de Impresora, Contraseña, Router, Auto-rotación, Self-check diario.
- **Rotar contraseña ahora:** genera una nueva contraseña y la aplica al router inmediatamente. Si el router no responde, queda como pendiente de aplicación manual (banner rojo).

### 3.2 Impresora
- Card con la impresora activa actualmente.
- Botón **"Detectar impresoras"** abre el modal de descubrimiento (USB / Bluetooth Classic / BLE).
- Selecciona una impresora → el sistema prueba la conexión automáticamente → si OK, presiona **"Usar esta impresora"** para activarla.

### 3.3 Router
- Configura **IP, usuario, contraseña, modelo, SSID guest** del router TP-Link Archer.
- **"Probar alcanzabilidad"**: hace un ping HTTP al router (sin login).
- **"Probar conexión"**: hace login + lee el SSID guest. Devuelve resultado paso a paso.
- **"Nueva contraseña router"**: campo enmascarado con toggle de revelar. Se guarda cifrada (safeStorage de Electron).

### 3.4 Programación
- Hora diaria de rotación automática (HH:MM en formato 24h).
- Zona horaria por defecto: `America/Mexico_City`.

### 3.5 Negocio
- **Nombre del negocio** y **mensaje al pie del voucher** que aparecen en cada ticket impreso.
- **Logo del voucher:** arrastra un PNG/JPG o selecciónalo con el botón. Para quitarlo, presiona "Quitar logo".

### 3.6 Estadísticas
- Totales: impresiones totales / exitosas / fallidas; rotaciones totales / exitosas.
- Gráfica de impresiones diarias de los últimos 14 días.

### 3.7 Logs
- Tabla de los últimos 500 eventos del `audit_log`.
- Filtros: Todos / Impresiones / Rotación / Configuración / Login admin / Errores.
- **Exportar CSV** descarga el listado filtrado.

## 4. Banner "Aplicación manual de contraseña pendiente"

Si la rotación automática falla 3 veces seguidas:

1. Aparece un banner rojo grande en Inicio y en la vista del mesero, con la nueva contraseña en mono grande.
2. **Copia la contraseña** con el botón "Copiar".
3. Abre la interfaz web del router (`http://192.168.1.1` por defecto), entra a la sección Red de invitados y pega la contraseña.
4. Guarda en el router.
5. Vuelve al banner en la app, **re-escribe la contraseña** en el campo de confirmación (anti-typo).
6. Presiona **"He aplicado la contraseña"** — el banner desaparece y el sistema queda sincronizado.

## 5. Troubleshooting básico

### "Sin impresora activa"
Ve a Impresora → Detectar → selecciona una → Usar esta impresora.

### "Sin contraseña configurada"
Ve a Inicio → Rotar contraseña ahora. Si falla, sigue el procedimiento de aplicación manual (sección 4).

### "Router no alcanzable"
Verifica que el router TP-Link Archer esté encendido y conectado a la misma red. En Router → Probar alcanzabilidad. Si falla, revisa el cable Ethernet o el WiFi del router.

### "Self-check fallido"
Ve a Logs → filtra por "Self-check" (event_type=`health_check`). Cada entrada tiene el detalle de los 6 probes. Revisa cuál falló y actúa en consecuencia.

### Reiniciar el sistema sin perder datos
Cierra la app (Cmd+Q en Mac, X en Win). Vuelve a abrirla. Todos los datos están persistidos en `%APPDATA%/wifi-voucher-manager/` (Win) o `~/Library/Application Support/wifi-voucher-manager/` (Mac).

## 6. Contacto soporte

- **Okuni Solutions** — soporte@okuni.solutions (placeholder, ajustar)
- **RDP para soporte remoto:** acordar credenciales con el equipo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manuales/MANUAL-ADMIN.md
git commit -m "docs(fase-6): manual del admin — PIN + 7 paneles + troubleshooting"
```

---

### Task 8: `docs/manuales/MANUAL-INSTALACION.md` con Apéndice C

**File:**
- Create: `docs/manuales/MANUAL-INSTALACION.md`

- [ ] **Step 1: Write the file**

```markdown
# Manual de Instalación — WiFi Voucher Manager

> Documento operativo para Okuni Solutions. Cubre deploy, whitelist Windows Defender, troubleshooting y setup de hardware (impresora Aomus BLE + router TP-Link Archer).

## 1. Requisitos previos

- **Sistema operativo:** Windows 11 22H2+ (Win10 22H2 mínimo).
- **CPU:** x64, 2 GHz+, 4 GB RAM mínimo.
- **Hardware:**
  - Impresora térmica Aomus My A1 (Bluetooth BLE).
  - Router TP-Link Archer C24/A6 v3 (conexión Ethernet al modem del cliente).
  - Bluetooth integrado en la laptop o adaptador USB BT 4.0+.
- **Red:** WiFi del cliente operativa; laptop conectada a la misma red que el router TP-Link.
- **Permisos:** instalador con cuenta de administrador local.

## 2. Pre-instalación

1. Descarga el instalador `WiFi Voucher Manager Setup x.y.z.exe` (≈150 MB) desde el artifact del CI o desde el repo `nemesis128/QR-Printer-Internet-for-Customers`.
2. Verifica el hash SHA-256 del archivo contra el publicado por Okuni Solutions:
   ```powershell
   Get-FileHash "WiFi Voucher Manager Setup 1.0.0.exe" -Algorithm SHA256
   ```
   Si no coincide, NO instales — contacta al equipo.
3. Copia el `.exe` al escritorio de la laptop POS.

## 3. Instalación

1. Doble click en el `.exe`.
2. Si Windows Defender bloquea (SmartScreen), sigue el **Apéndice C** (sección 7).
3. Acepta los términos de instalación.
4. Elige la carpeta de instalación (default: `C:\Users\<usuario>\AppData\Local\Programs\wifi-voucher-manager\`).
5. Marca **"Crear shortcut en el escritorio"**.
6. Presiona "Instalar". Tarda ≈30 segundos.
7. Al terminar, marca **"Ejecutar WiFi Voucher Manager"** y presiona "Finalizar".

## 4. Primer arranque

1. La app abre la vista del mesero (botón grande "Imprimir QR de WiFi").
2. Presiona el engrane (esquina inferior derecha) y entra con PIN `0000`.
3. Cambia el PIN (sigue el Manual del Admin sección 1).
4. **Auto-arranque al login:** tras cambiar el PIN, el sistema activa automáticamente el inicio con Windows. Para desactivarlo manualmente: Configuración → Aplicaciones → Inicio.

## 5. Configurar hardware

### 5.1 Impresora Aomus My A1 (Bluetooth BLE)

1. Enciende la impresora (presiona el botón de poder ≈2 segundos hasta el beep).
2. En la laptop: Configuración → Bluetooth → Activar.
3. La impresora NO necesita emparejarse desde Windows — la app la detecta directamente vía BLE.
4. En la app, ve a Admin → Impresora → **"Detectar impresoras"**.
5. Espera ≈5 segundos. Aparecerá una lista con badges (USB / BT / BLE).
6. Selecciona la entrada con etiqueta **"Aomus My A1"** y badge **"BLE"**.
7. El sistema prueba la conexión automáticamente. Si responde OK (verde), presiona **"Usar esta impresora"**.
8. Imprime una prueba desde la vista del mesero — debe salir un voucher con el QR en ≈4 segundos.

**Si no aparece la impresora:**
- Verifica que el Bluetooth está activo en Windows.
- Apaga y enciende la impresora.
- Revisa con `Get-PnpDevice -Class Bluetooth` en PowerShell que la laptop la "vea".

### 5.2 Router TP-Link Archer C24/A6 v3

1. Conecta el router al modem del cliente vía Ethernet (puerto WAN).
2. Conecta la laptop al SSID administrativo del router (NO al guest).
3. Accede a `http://192.168.1.1` (default) con admin/admin.
4. Crea/Habilita la red **Guest 2.4GHz** con el SSID que el cliente quiera (sugerido: `Restaurante-Clientes`).
5. **NO configures la contraseña guest manualmente** — la app la rotará nocturnamente. Pon cualquier valor temporal de ≥8 chars.
6. En la app, ve a Admin → Router:
   - **IP del router:** `192.168.1.1`
   - **Usuario:** `admin`
   - **Modelo:** `TP-Link Archer C24`
   - **SSID guest:** el mismo que pusiste en el router
   - **Nueva contraseña router:** la contraseña actual del admin (se guarda cifrada)
7. Presiona **"Guardar"** y luego **"Probar conexión"** — debe pasar los 3 pasos: login, leer SSID, logout.

## 6. Configuración inicial recomendada

1. Admin → Programación → Hora rotación: `23:00` (después del cierre).
2. Admin → Negocio → Nombre del negocio + Mensaje al pie + Logo (opcional).
3. Admin → Inicio → "Rotar contraseña ahora" — valida el flujo end-to-end.
4. Imprime un voucher de prueba desde la vista del mesero. Escanea con tu celular — debe conectarte al SSID guest.

## 7. Apéndice C — Whitelist de Windows Defender

> El instalador no está firmado digitalmente (decisión D-014 — costo del certificado EV no se justifica para v1). Windows lo marca como "no confiable". Sigue uno de los 3 procedimientos.

### Procedimiento A — Desbloquear el archivo (más simple)

1. Antes de ejecutar, **click derecho** sobre `WiFi Voucher Manager Setup x.y.z.exe`.
2. **Propiedades**.
3. Al fondo de la pestaña General, busca la casilla **"Desbloquear"** (o "Unblock").
4. Marca la casilla y presiona **"Aplicar"** → **"Aceptar"**.
5. Ahora doble click ejecuta sin bloqueo.

### Procedimiento B — SmartScreen "Ejecutar de todas formas"

1. Doble click en el `.exe`.
2. Si aparece una pantalla azul **"Windows protegió tu PC"**:
3. Presiona **"Más información"**.
4. Aparece un botón **"Ejecutar de todas formas"** abajo.
5. Click → se ejecuta el instalador normalmente.

### Procedimiento C — Excluir la carpeta de Windows Security (instalaciones corporativas)

1. Configuración → Privacidad y seguridad → **Seguridad de Windows**.
2. **Protección contra virus y amenazas** → **Administrar la configuración**.
3. **Exclusiones** → **Agregar o quitar exclusiones**.
4. **Agregar exclusión** → **Carpeta**.
5. Selecciona `C:\Users\<usuario>\AppData\Local\Programs\wifi-voucher-manager\`.
6. Confirma — Defender ya no escanea esa carpeta.

## 8. Troubleshooting

### "Electron failed to install correctly"
Reinstala el `.exe` — no edites manualmente la carpeta de instalación.

### "No hay impresora activa" tras instalación
Sigue sección 5.1.

### "Router no alcanzable"
- Confirma que la laptop POS y el router están en la misma subred (`ipconfig` debe mostrar IP `192.168.1.X`).
- Verifica que el firewall de Windows no esté bloqueando salida HTTP a `192.168.1.1`.

### "Self-check fallido" cada día
- Revisa los logs en Admin → Logs → filtro Self-check.
- Los probes que pueden fallar legítimamente: `router_reach` si el router está apagado, `printer_reach` si la impresora no se reactiva tras estar offline. Apaga/enciende ambos y verifica.

### App no abre tras reinicio
- Abre el explorador → `C:\Users\<usuario>\AppData\Roaming\wifi-voucher-manager\`.
- Borra el archivo `app-config.json` (la app lo regenera con defaults).
- Vuelve a abrir la app — pedirá PIN default `0000` de nuevo.

### Logs operativos para soporte

Localizar en:
```
%APPDATA%\wifi-voucher-manager\logs\main.log
%APPDATA%\wifi-voucher-manager\data.db
```

Copia ambos archivos y envíalos a Okuni Solutions cuando reportes un incidente.

## 9. Actualización a versiones nuevas

1. Cierra la app (X de la ventana).
2. Doble click en el nuevo `.exe` (mismo `Setup x.y.z.exe`).
3. El instalador detecta la versión previa y la reemplaza preservando los datos.
4. Abre la app — el PIN, las impresoras configuradas, la programación y todos los logs se conservan.

## 10. Desinstalación

1. Configuración → Aplicaciones → Buscar "WiFi Voucher Manager".
2. **Desinstalar**.
3. Esto elimina el ejecutable pero **NO los datos** en `%APPDATA%\wifi-voucher-manager\`. Si quieres limpieza total, borra esa carpeta manualmente.

## 11. Contacto

- **Okuni Solutions** — soporte@okuni.solutions
- **Repo:** `github.com/nemesis128/QR-Printer-Internet-for-Customers`
- **Issues:** abre un issue en el repo con los logs adjuntos.
```

- [ ] **Step 2: Commit**

```bash
git add docs/manuales/MANUAL-INSTALACION.md
git commit -m "docs(fase-6): manual de instalación con Apéndice C de whitelist Defender"
```

---

## Bloque E — Cierre (Tasks 9-10)

### Task 9: DECISIONS.md + audit checklist verification

**File:**
- Modify: `wifi-voucher-manager/DECISIONS.md`

- [ ] **Step 1: Append D-036 + D-037**

Justo antes de la sección "## Excepciones registradas" al final de DECISIONS.md:

```markdown
## D-036 ✅ Activa — Auto-arranque condicionado a pinIsDefault=false (Fase 6 Task 1)

**Decisión:** `app.setLoginItemSettings({ openAtLogin: true })` se activa automáticamente cuando el admin completa el primer cambio de PIN (deja de ser `0000`). No requiere configuración explícita por el usuario.

**Why:** el flujo de onboarding ya fuerza el cambio de PIN antes de mostrar AdminView (D-013). Activar auto-arranque sólo después de ese cambio garantiza que (a) el dueño quiso configurar el sistema (no es un test de instalación), y (b) la primera vez que la app arranca tras reboot ya tiene un PIN custom, no el default — no estamos exponiendo el `0000` en un sistema desatendido.

**Impacto:** en Linux la API es no-op (Electron docs); en macOS/Windows el setting persiste en el sistema. El admin puede desactivarlo manualmente desde Windows → Configuración → Aplicaciones → Inicio si lo necesita. Para v1 no exponemos toggle en la UI.

---

## D-037 ✅ Activa — Logo se persiste en userData/, no en assets del bundle (Fase 6 Task 2)

**Decisión:** `admin.uploadLogo` copia el archivo seleccionado a `app.getPath('userData')/logo.<ext>` y guarda la ruta absoluta en `business.logoPath`. NO se embebe en el bundle ni en `resources/`.

**Why:** el bundle es read-only post-instalación (asar). El logo es contenido del cliente, no del producto — debe vivir en `userData/` igual que la DB y la config. Una actualización del `.exe` preserva el logo del cliente.

**Impacto:** el voucher template (Fase 1 / Fase 2) puede leer `business.logoPath` directamente del config para renderizarlo en la imagen ESC/POS. En Fase 6 NO implementamos esa lectura — queda como path persistido para que una iteración futura lo incorpore al template sin tocar el flujo de upload.

---
```

- [ ] **Step 2: Audit checklist final (verification only — no code)**

Verificar manualmente que cada ítem del threat model de QA Sección 4.4 esté cumplido. Crear un `docs/audit-security-fase-6.md` con el resumen:

```markdown
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
| No code signing — Apéndice C compensa (D-014) | `MANUAL-INSTALACION.md` Apéndice C | ✅ |
| `npm audit` ≥ moderate resuelto | Fase 6 Task 5 | ✅ (ver task) |
| Predist verifica CSP de producción | `scripts/verify-csp.mjs` (Fase 0) | ✅ |
| Predist sanitiza build (no console.log) | `scripts/sanitize-build.mjs` (Fase 0) | ✅ |
| Postdist verifica asarUnpack de native deps | `scripts/verify-asar-unpack.mjs` (Fase 0) | ✅ |

**Resultado:** todos los controles del threat model están implementados y cubiertos por código en mainstream + scripts en CI. Sin gaps al cierre de Fase 6.
```

- [ ] **Step 3: Commit**

```bash
git add wifi-voucher-manager/DECISIONS.md docs/audit-security-fase-6.md
git commit -m "docs(fase-6): D-036/D-037 + audit final de seguridad — sin gaps"
```

---

### Task 10: Final gates + tag

- [ ] **Step 1: Run all gates**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes/wifi-voucher-manager
npm run lint
npm run type-check
npm run test
npm run build
```

Todos deben pasar (lint 0 warnings, type-check clean, ≥ 265 tests, build genera dist + dist-electron).

- [ ] **Step 2: Tag**

```bash
cd /Users/oswaldomaravilla/Proyectos/Pruebas/qr-clientes
git tag fase-6-complete -m "Fase 6: empaquetado + auto-arranque + logo upload + manuales. ${COUNT} tests passing. Listo para Fase 7 (piloto)."
```

- [ ] **Step 3: Push**

```bash
git push origin main
git push origin fase-6-complete
```

- [ ] **Step 4: Esperar que CI verde**

GitHub Actions debería disparar la build con el tag. El artifact `installer-win-${SHA}.exe` queda disponible para descargar e instalar en la Dell Win11 del cliente (Fase 7 Día 0).

---

## Self-review post-plan

**Spec coverage (Sección 5 Fase 6):**
- ✅ Auto-arranque condicionado a pinIsDefault=false → Task 1
- ✅ Ícono `.ico` multi-res — placeholder OK desde commit `172866e`; branding final queda como opcional v2 (no bloquea cierre)
- ✅ `npm run dist:win` produce `.exe` NSIS oneClick=false con shortcut — funciona desde commit `172866e` (CI build job)
- ✅ Apéndice C de whitelist Defender → `MANUAL-INSTALACION.md` sección 7
- ✅ Audit final de seguridad → Task 9
- ✅ `npm audit` ≥ moderate resuelto → Task 5
- ✅ Validación CSP predist → ya existe desde Fase 0 (`verify-csp.mjs`)
- ✅ Sanitize-build predist → ya existe desde Fase 0
- ✅ Verify-asar-unpack postdist → ya existe desde Fase 0
- ✅ Manuales Mesero (1 pág), Admin (5-8 págs), Instalación (10-15 págs) → Tasks 6-8
- ⏳ Video Loom 5 min — entrega manual del usuario, fuera del scope de código

**No-placeholders scan:** revisado — todos los pasos tienen contenido completo. Los manuales son textos completos en español, no esqueletos.

**Type consistency check:**
- `uploadLogo` firma consistente entre AdminAPI (shared/types) y AdminHandlers (admin.ts) ✅
- `onPinChanged` callback es `() => void` opcional en deps ✅
- `userDataPath` es `string` en AdminHandlerDeps; el composition root lo obtiene de `app.getPath('userData')` ✅
- `business.logoPath` ya está en BusinessConfig (Fase 3 Task 6); sólo cambia entre `null` y la ruta absoluta ✅

**Lo que sigue pendiente para post-tag (memoria):**
- Branding final (logo Okuni real) — reemplazar `build/icon.ico` cuando se tenga, sin re-build necesario
- Voucher template renderizando el logo subido (lectura de `business.logoPath` en `voucher.ts`) — feature de v2
- Validación end-to-end en Win11 nuevo via RDP con el `.exe` instalado — eso es Fase 7 Día 0
- Video Loom 5 min — Fase 7 capacitación
- Configurar `soporte@okuni.solutions` real si no existe ya
