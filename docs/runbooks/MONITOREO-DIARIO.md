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
