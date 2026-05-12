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
