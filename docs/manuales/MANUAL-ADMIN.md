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
