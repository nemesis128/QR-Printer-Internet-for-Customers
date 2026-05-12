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
