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
