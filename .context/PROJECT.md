# WiFi Voucher Manager — proyecto

## Qué es esto, en una frase
App Electron de escritorio para Windows que vive en la laptop POS de un restaurante mexicano y resuelve dos problemas: (1) imprime QR de WiFi escaneable en la impresora térmica con un click del mesero, (2) rota la contraseña del SSID guest del router secundario cada noche.

## Para quién
- Cliente final: restaurante/taquería con 5 mesas. Usuario operativo = mesero. Usuario admin = dueño/encargado.
- Owner técnico: Okuni Solutions. Soporte: 30 días post-go-live.

## Estado del proyecto
Greenfield, mayo 2026. Plan v1.1 firme. Stack heredado parcialmente de `maragon_pdv` (otro proyecto Okuni — ver lista en DECISIONS.md). Repo independiente — NO es monorepo. Esta app vive en `wifi-voucher-manager/` dentro del repo `QR-Printer-Internet-for-Customers`.

## Vistas principales
- WaiterView: pantalla única, sin login, un botón. Lo que el mesero ve siempre.
- AdminView: oculta detrás de icono de engrane. PIN argon2id, 4 dígitos, bloqueo tras 3 fallos. PIN inicial '0000' (cambio forzado en primer login).

## Hardware esperado
- Impresora: Aomus My A1 (BLE) en producción inicial. Soporta también EPSON TM-T20 (USB) y cualquier ESC/POS-compatible vía discovery.
- Router secundario: TP-Link Archer C24 o A6 v3 (cliente lo compra en Fase 4).
- Laptop: Win11 22H2 mínimo, 8GB RAM, x64.

## Cómo arrancar (post Fase 0)
- `nvm use 22` (Node 22.20+ requerido — `.nvmrc` lo declara)
- `npm install` (Windows requiere Build Tools VC++ para native deps)
- `npm run dev`

Para reset DB local: borrar `%APPDATA%/wifi-voucher-manager/data.db` (Win) o `~/Library/Application Support/wifi-voucher-manager/data.db` (Mac dev).

## Bloqueadores externos activos
- Fase 4 (router) bloqueada hasta que cliente compre TP-Link.
- Fase 7 (piloto) bloqueada hasta Fase 4 + impresora confirmada.

## Documentos a leer en orden
1. CLAUDE.md (raíz parent del repo)
2. PLAN-TECNICO-WIFI-MANAGER_2.md (raíz parent — plan técnico v1.1)
3. DECISIONS.md (raíz wifi-voucher-manager)
4. .context/ARCHITECTURE.md (este folder)
5. docs/superpowers/specs/2026-05-07-wifi-voucher-manager-design.md (raíz parent)
