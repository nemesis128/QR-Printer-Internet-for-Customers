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
