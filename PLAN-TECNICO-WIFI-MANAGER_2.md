# PLAN TÉCNICO — WiFi Voucher Manager

**Proyecto:** Sistema de generación e impresión de QR para acceso WiFi de clientes en restaurante
**Stack target:** Electron + React + Node.js (aplicación de escritorio Windows)
**Cliente final:** Restaurante/taquería con 5 mesas, laptop con Soft Restaurant POS
**Owner:** Okuni Solutions
**Fecha:** 2026-05
**Versión del plan:** 1.1

**Changelog:**
- v1.1 — Eliminado PIN para vista de mesero (app abre lista para imprimir). Ampliado AdminView con discovery de impresoras, test print, test de conexión router. Agregada Sección 5.6 con lineamientos UX (sobrio, profesional, elegante). Fases 1, 2 y 3 actualizadas.
- v1.0 — Versión inicial.

---

## 1. CONTEXTO DEL NEGOCIO

### 1.1 Problema a resolver

El restaurante necesita ofrecer WiFi a clientes con dos restricciones:

1. **Aislamiento de seguridad:** la red WiFi de clientes NO debe tener acceso a la red interna donde corre Soft Restaurant POS y la impresora térmica de cocina.
2. **Operación simple:** el mesero debe entregar un QR escaneable al cliente con el menor esfuerzo posible. La conexión debe ser automática al escanear (sin portales cautivos, sin códigos manuales).

### 1.2 Solución arquitectónica

- **Hardware:**
  - Módem Telmex existente (no se modifica) → conecta directo a laptop con Soft Restaurant.
  - Router secundario TP-Link Archer (modelo a definir, ~$500 MXN) → exclusivo para clientes.
  - Impresora térmica de comandas existente → dual-purpose (comandas + tickets WiFi).

- **Software (este proyecto):**
  - App Electron en la laptop POS.
  - Genera QR con formato `WIFI:T:WPA;S:<SSID>;P:<password>;;` (estándar IEEE 802.11u).
  - Imprime QR en impresora térmica con un solo botón.
  - Cambia la contraseña del router secundario automáticamente cada noche.

### 1.3 Flujo operativo final

```
[App arranca al iniciar Windows]
   ↓
[App valida estado: impresora online, contraseña vigente, router accesible]
   ↓
[App muestra WaiterView con botón grande "IMPRIMIR QR" — sin login]
   ↓
[Mesero] presiona "IMPRIMIR QR"
   ↓
[App] lee contraseña vigente desde SQLite
   ↓
[App] genera QR con formato WIFI estándar
   ↓
[App] envía buffer ESC/POS a impresora térmica
   ↓
[Cliente] escanea QR con cámara → conecta automáticamente
   ↓
[A las 23:00] Scheduler genera nueva contraseña
   ↓
[App] hace login en TP-Link Archer y actualiza SSID guest
   ↓
[App] persiste nueva contraseña y registra en log
```

**Acceso a configuración (admin):** El acceso a `AdminView` SÍ requiere PIN. Está oculto detrás de un botón discreto en una esquina inferior de la `WaiterView`. El mesero nunca lo presiona; solo el dueño/encargado conoce el PIN.

---

## 2. STACK TECNOLÓGICO Y VERSIONES

> **REGLA OBLIGATORIA:** Todas las versiones listadas a continuación son las verificadas como estables al inicio del proyecto (mayo 2026). Cualquier desviación debe ser justificada por escrito en `DECISIONS.md`.

### 2.1 Runtime

| Componente | Versión exacta | Notas |
|---|---|---|
| Node.js | **22.20.x LTS** | Versión incluida en Electron 39. Node 24 NO soportado aún por todas las deps nativas. |
| npm | **10.x** | Viene con Node 22. |
| Electron | **39.x** (estable, EOL 2026-05-05) | Última estable larga. NO usar 40 (recién salida, posibles bugs). |
| Chromium (vía Electron 39) | M142 | Provisto por Electron, no instalar manualmente. |
| Windows target | **Windows 10 64-bit ≥ 22H2** o **Windows 11** | Verificar en laptop del cliente antes de empaquetar. |

### 2.2 Frontend

| Paquete | Versión | Justificación |
|---|---|---|
| react | **^18.3.1** | NO usar 19 todavía; muchas libs aún no compatibles. |
| react-dom | **^18.3.1** | Match con react. |
| typescript | **^5.6.3** | Tipado estricto obligatorio. |
| vite | **^5.4.x** | Bundler para el renderer. NO usar 6 hasta verificar plugin electron. |
| @vitejs/plugin-react | **^4.3.x** | Compatible con vite 5. |
| tailwindcss | **^3.4.x** | NO usar v4 hasta estabilizar el ecosistema. |
| lucide-react | **^0.460.x** | Iconos. |
| @fontsource/inter | **^5.1.x** | Tipografía UI. Self-hosted (sin dependencia de Google). |
| @fontsource/jetbrains-mono | **^5.1.x** | Tipografía monoespaciada para passwords/IDs. |
| zustand | **^5.0.x** | Estado global ligero. NO Redux. |
| recharts | **^2.13.x** | Gráficos para sección Estadísticas. Tree-shakeable, sobrio. |

### 2.3 Backend / Main process

| Paquete | Versión | Justificación |
|---|---|---|
| electron-builder | **^25.x** | Empaquetado a `.exe`. |
| better-sqlite3 | **^11.5.x** | DB local sincrónica, ideal para Electron. |
| qrcode | **^1.5.4** | Generación de QR (4850+ proyectos lo usan, estándar de facto). |
| node-thermal-printer | **^4.6.0** | Impresión ESC/POS. Compatible con EPSON, Star, Tranca, Daruma, Brother. |
| axios | **^1.7.x** | HTTP client para hablar con TP-Link Archer. |
| node-cron | **^3.0.3** | Scheduler para cambio diario de contraseña. |
| electron-store | **^10.x** | Configuración persistente. |
| electron-log | **^5.x** | Logging robusto. |
| dotenv | **^16.x** | Variables de entorno en desarrollo. |
| usb | **^2.14.x** | Enumeración de dispositivos USB para discovery de impresoras. Requiere libusb en Windows (incluido en empaquetado). |
| bcrypt | **^5.1.1** | Hash del PIN del admin. |

### 2.4 Dev dependencies

| Paquete | Versión | Uso |
|---|---|---|
| eslint | **^9.x** | Linter (config flat). |
| prettier | **^3.3.x** | Formateo. |
| vitest | **^2.x** | Tests unitarios (NO jest). |
| @testing-library/react | **^16.x** | Tests de componentes. |
| playwright | **^1.48.x** | E2E tests. |
| spectron | ❌ NO USAR | Está deprecado. Usar Playwright con Electron. |

### 2.5 Hardware verificado/requerido

| Componente | Modelo objetivo | Notas |
|---|---|---|
| Router secundario | **TP-Link Archer C24** o **Archer A6 v3** | ~$500-800 MXN. Confirmar con cliente antes de desarrollo final. |
| Impresora térmica | **A confirmar por el cliente** | El driver thermal-printer detecta marca: EPSON / STAR / TANCA / DARUMA / BROTHER / CUSTOM. Hasta que el cliente provea modelo, asumir EPSON TM-T20 como baseline. |
| Conexión impresora | USB o Ethernet | Verificar con cliente. |

### 2.6 Restricciones explícitas

- **NO usar:** Webpack (preferir Vite), Jest (preferir Vitest), styled-components (preferir Tailwind), Redux (preferir Zustand o useState para esta escala), Sequelize (DB es trivial, raw SQL con better-sqlite3 es suficiente).
- **NO usar paquetes con menos de 50 descargas semanales en npm** sin aprobación previa.
- **NO usar paquetes que no hayan tenido releases en los últimos 18 meses** (riesgo de abandono).
- **NO usar `escpos` (npm)** — está abandonado desde 2020. Usar `node-thermal-printer` o `@node-escpos/core`.
- **NO usar librerías npm para TP-Link** — todas están desactualizadas o son para smartplugs, no routers Archer. Implementar cliente HTTP propio (sección 5.4).

---

## 3. ARQUITECTURA DE LA APLICACIÓN

### 3.1 Estructura de directorios

```
wifi-voucher-manager/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── README.md
├── DECISIONS.md              # Bitácora de decisiones técnicas
├── .context/                 # Sistema de contexto para agentes
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACTS.md
│   └── DEPENDENCIES.md
├── src/
│   ├── main/                 # Proceso principal Electron
│   │   ├── index.ts          # Entry point
│   │   ├── ipc/              # Handlers IPC
│   │   │   ├── voucher.ts
│   │   │   ├── printer.ts
│   │   │   ├── router.ts
│   │   │   └── config.ts
│   │   ├── services/
│   │   │   ├── QRService.ts
│   │   │   ├── PrinterService.ts
│   │   │   ├── RouterService.ts
│   │   │   ├── PasswordService.ts
│   │   │   └── SchedulerService.ts
│   │   ├── adapters/         # Patrón Adapter para routers/impresoras
│   │   │   ├── routers/
│   │   │   │   ├── IRouterAdapter.ts
│   │   │   │   ├── TPLinkArcherAdapter.ts
│   │   │   │   └── MockRouterAdapter.ts
│   │   │   └── printers/
│   │   │       ├── IPrinterAdapter.ts
│   │   │       ├── ThermalPrinterAdapter.ts
│   │   │       └── MockPrinterAdapter.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   └── utils/
│   ├── preload/
│   │   └── index.ts          # API segura expuesta al renderer
│   ├── renderer/             # Frontend React
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── WaiterView.tsx     # Pantalla principal
│   │   │   └── AdminView.tsx      # Configuración (PIN)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/            # Zustand
│   │   └── types/
│   └── shared/               # Tipos compartidos main/renderer
│       └── types.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── resources/
    ├── icon.ico
    └── installer/
```

### 3.2 Patrones arquitectónicos

- **Process separation (Electron):** Main process maneja hardware, DB y red. Renderer solo UI.
- **IPC tipado:** Todo IPC pasa por contratos en `src/shared/types.ts`. NO usar `any`.
- **Adapter pattern:** Routers e impresoras detrás de interfaces. Permite agregar modelos sin tocar lógica de negocio.
- **Repository pattern:** Acceso a SQLite encapsulado en `repositories/`.
- **Dependency injection manual:** Servicios reciben dependencias en constructor para facilitar testing.

### 3.3 Modelo de datos (SQLite)

```sql
-- Tabla principal de contraseñas históricas
CREATE TABLE passwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password TEXT NOT NULL,
  ssid TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 0,  -- 1 = vigente
  rotated_by TEXT NOT NULL,            -- 'auto' | 'manual'
  router_response TEXT                 -- log de respuesta TP-Link
);

CREATE INDEX idx_passwords_active ON passwords(active);
CREATE INDEX idx_passwords_created ON passwords(created_at);

-- Log de impresiones de QR
CREATE TABLE print_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password_id INTEGER NOT NULL,
  printed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success INTEGER NOT NULL,            -- 1 ok, 0 error
  error_message TEXT,
  FOREIGN KEY (password_id) REFERENCES passwords(id)
);

CREATE INDEX idx_print_log_date ON print_log(printed_at);

-- Configuración de la app (key/value)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Auditoría
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,            -- 'password_rotation' | 'print' | 'config_change' | 'error'
  payload TEXT,                        -- JSON con detalles
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 Configuración (electron-store)

```typescript
interface AppConfig {
  router: {
    host: string;              // IP del TP-Link Archer (ej. 192.168.0.1)
    username: string;          // 'admin'
    passwordEncrypted: string; // AES-256 con safeStorage de Electron
    model: 'archer-c24' | 'archer-a6' | 'mock';
    guestSSID: string;         // Ej. "Restaurante-Clientes"
  };
  printer: {
    type: 'epson' | 'star' | 'tanca' | 'daruma' | 'brother' | 'mock';
    interface: string;         // 'printer:Nombre' | 'tcp://192.168.x.x' | 'usb'
    width: 32 | 48;            // Caracteres por línea (58mm = 32, 80mm = 48)
    encoding: 'PC852_LATIN2' | 'WPC1252' | 'GB18030';
  };
  schedule: {
    rotationCron: string;      // '0 23 * * *' = 11:00 PM diario
    timezone: string;          // 'America/Mexico_City'
  };
  business: {
    name: string;
    logoPath?: string;
    footerMessage: string;     // Ej. "¡Gracias por tu visita!"
  };
  admin: {
    pinHash: string;           // bcrypt del PIN para entrar a admin
  };
}
```

---

## 4. CONTRATO IPC (main ↔ renderer)

```typescript
// src/shared/types.ts

export interface IpcAPI {
  // ============ Vista mesero (sin auth) ============
  printVoucher: () => Promise<{ success: boolean; error?: string }>;
  getCurrentSSID: () => Promise<string>;
  getSystemHealth: () => Promise<SystemHealth>;

  // ============ Vista admin (requiere PIN validado en sesión) ============
  validatePin: (pin: string) => Promise<boolean>;
  getConfig: () => Promise<AppConfig>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;

  // Operación manual
  rotatePasswordNow: () => Promise<{ success: boolean; newPassword: string }>;

  // ----- Impresora -----
  /** Lista impresoras del sistema (Windows: spooler) y dispositivos USB ESC/POS detectables. */
  discoverPrinters: () => Promise<DiscoveredPrinter[]>;
  /** Prueba conexión con la impresora ya configurada. Devuelve estado y latencia. */
  testPrinterConnection: () => Promise<PrinterTestResult>;
  /** Imprime un ticket de prueba con QR de ejemplo. */
  printTestVoucher: () => Promise<{ success: boolean; error?: string }>;
  /** Imprime una hoja de diagnóstico (auto-test del fabricante si aplica). */
  printDiagnosticPage: () => Promise<{ success: boolean; error?: string }>;

  // ----- Router -----
  /** Prueba alcanzabilidad (ping HTTP) sin login. */
  pingRouter: () => Promise<{ reachable: boolean; latencyMs?: number; error?: string }>;
  /** Prueba login completo y lectura del SSID guest. */
  testRouterConnection: () => Promise<RouterTestResult>;

  // ----- Estadísticas y logs -----
  getStats: (range: 'today' | 'week' | 'month') => Promise<PrintStats>;
  getRecentEvents: (limit: number) => Promise<AuditEvent[]>;
  exportLogs: (path: string) => Promise<void>;
}

export interface SystemHealth {
  printerOnline: boolean;
  routerReachable: boolean;
  passwordValid: boolean;        // hay password vigente en DB
  schedulerRunning: boolean;
  lastRotation: string | null;   // ISO date
  lastRotationStatus: 'success' | 'failed' | 'pending' | null;
}

export interface DiscoveredPrinter {
  id: string;                    // identificador único (path USB, nombre Windows, IP:puerto)
  displayName: string;           // nombre legible para el admin
  connectionType: 'system' | 'usb' | 'network';
  details: {
    systemName?: string;         // nombre como aparece en Windows
    vendorId?: string;           // USB
    productId?: string;          // USB
    ipAddress?: string;          // network
    port?: number;
  };
  /** Heurística: si node-thermal-printer reconoce el dispositivo como ESC/POS. */
  likelyEscPosCompatible: boolean;
  /** Marca sugerida por VID/PID o nombre, si se puede inferir. */
  suggestedType?: 'epson' | 'star' | 'tanca' | 'daruma' | 'brother';
}

export interface PrinterTestResult {
  success: boolean;
  online: boolean;
  latencyMs: number;
  hasPaper: boolean | null;       // null si la impresora no reporta este estado
  hasError: boolean | null;
  errorMessage?: string;
  buffer?: string;                // primeras 100 bytes del estado para debug
}

export interface RouterTestResult {
  success: boolean;
  reachable: boolean;
  authenticated: boolean;
  guestSsidFound: boolean;
  guestSsidName?: string;
  guestEnabled?: boolean;
  errorStep?: 'reach' | 'login' | 'read' | 'parse';
  errorMessage?: string;
}

export interface PrintStats {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  byDay: Array<{ date: string; count: number }>;
}

export interface AuditEvent {
  id: number;
  eventType: 'password_rotation' | 'print' | 'config_change' | 'error';
  payload: unknown;
  createdAt: string;
}
```

**Reglas IPC:**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Exposición vía `contextBridge` en preload.
- Validar TODO input en main process antes de procesar.
- Errores nunca exponen stack traces al renderer; solo mensajes legibles.
- Operaciones de descubrimiento/prueba (`discoverPrinters`, `testPrinterConnection`, etc.) deben tener timeout máximo de 10 segundos y NUNCA bloquear el UI.

---

## 5. ESPECIFICACIÓN DE COMPONENTES

### 5.1 QRService

**Responsabilidad:** Generar string QR con formato WiFi estándar.

**Input:** `{ ssid: string, password: string, security: 'WPA' | 'WEP' | 'nopass', hidden: boolean }`

**Output:** `{ qrPayload: string, pngBuffer: Buffer }`

**Formato del payload:**
```
WIFI:T:WPA;S:Restaurante-Clientes;P:miClave123;H:false;;
```

**Notas críticas:**
- Caracteres reservados (`\`, `;`, `,`, `:`, `"`) DEBEN escaparse con `\`.
- El password debe limitarse a ASCII imprimible para máxima compatibilidad con cámaras Android antiguas.
- Generar QR con `errorCorrectionLevel: 'M'` (15% redundancia). NO usar 'L' porque al imprimirse en térmica puede tener artefactos.
- Tamaño mínimo del QR impreso: 200x200 px a 203 DPI = ~25mm físicos.

### 5.2 PrinterService

**Responsabilidad:** Componer el ticket, descubrir impresoras disponibles, probar conexión y enviar a impresora.

**Layout del ticket:**
```
================================
  [Logo opcional centrado]
  
  RESTAURANTE [BUSINESS_NAME]
================================

  WiFi GRATIS para clientes

  Red: [SSID]

  [QR 200x200, centrado]

  Escanea con tu camara
  y conectate automaticamente

  [FOOTER_MESSAGE]
  
  [Fecha y hora de emision]
================================

       [Corte automatico]
```

**Reglas de impresión:**
- Detectar tipo de impresora vía config; pasar al constructor de `node-thermal-printer`.
- Manejar timeout de 5 segundos en conexión a impresora.
- Reintentar 1 vez si falla la conexión inicial.
- Si la impresora está offline después del retry, registrar en `audit_log` y devolver error legible.
- NO bloquear el UI: la impresión va en cola con indicador de progreso.

**Métodos públicos:**

```typescript
class PrinterService {
  /** Imprime el ticket real con la contraseña vigente. */
  async printVoucher(): Promise<PrintResult>;

  /** Imprime un ticket idéntico al de producción pero marcado "PRUEBA". */
  async printTestVoucher(): Promise<PrintResult>;

  /** Imprime hoja de diagnóstico/configuración del fabricante (si la impresora lo soporta). */
  async printDiagnosticPage(): Promise<PrintResult>;

  /** Verifica conexión y estado sin imprimir. */
  async testConnection(): Promise<PrinterTestResult>;

  /** Descubre impresoras disponibles en el sistema. */
  async discover(): Promise<DiscoveredPrinter[]>;
}
```

**Discovery de impresoras (método `discover()`):**

Combina tres fuentes para detectar dispositivos:

1. **Spooler de Windows:** usar `wmic printer list brief` o PowerShell `Get-Printer` vía `child_process`. Devuelve impresoras instaladas en el sistema (incluyendo las compartidas y de red ya configuradas en Windows).

2. **USB directo:** usar `usb` (npm `usb@^2.x`) o `node-hid` para enumerar dispositivos USB. Filtrar por `bDeviceClass = 7` (Printer Class) o por VID conocidos:
   - EPSON: `0x04B8`
   - Star Micronics: `0x0519`
   - Brother: `0x04F9`
   - Bixolon: `0x1504`
   - Custom Engineering: `0x0DD4`

3. **Red local (opcional, escaneo de puerto 9100):** escaneo rápido del rango LAN en puerto 9100 (RAW printing). Limitado a un `/24` y con timeout corto (200ms por host). Solo se ejecuta si el admin lo solicita explícitamente con un botón "Buscar impresoras de red".

**Inferencia de marca:**
- Si VID/PID coincide con tabla conocida → sugerir tipo automáticamente.
- Si nombre Windows contiene "EPSON", "TM-", "Star", "TSP", "TM-T20", etc. → inferir.
- Si no se puede inferir → marcar como `unknown` y dejar al admin elegir manualmente.

**Reglas para `discover()`:**
- Timeout total: 10 segundos.
- NO requiere permisos especiales en Windows (solo lectura).
- Resultado se muestra como lista clara en AdminView con icono de tipo de conexión (USB / Sistema / Red).
- Cada item es seleccionable y dispara automáticamente un `testConnection()` con esa configuración antes de guardar.

### 5.3 PasswordService

**Responsabilidad:** Generar contraseñas seguras pero legibles.

**Reglas:**
- Longitud: 10 caracteres.
- Charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin caracteres confundibles: 0/O, 1/I/l).
- Generación con `crypto.randomInt`, NO con `Math.random`.
- La contraseña debe sobrevivir al escape del formato WIFI: NO incluir `\`, `;`, `,`, `:`, `"`.

```typescript
function generatePassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += charset[crypto.randomInt(0, charset.length)];
  }
  return result;
}
```

### 5.4 RouterService + TPLinkArcherAdapter

**Responsabilidad:** Cambiar la contraseña del SSID guest del router TP-Link Archer.

**Estrategia:** Como no hay librería npm confiable, implementar cliente HTTP propio.

**Pasos del adaptador:**

1. **Obtener token de sesión:**
   - GET `http://<host>/cgi-bin/luci/;stok=/login?form=login`
   - Extraer token de respuesta (varía por firmware).

2. **Login:**
   - POST con credenciales encriptadas (RSA pubkey del router).
   - Algunos modelos usan login plano + cookie de sesión. Detectar variante.

3. **Listar redes WiFi:**
   - GET para obtener configuración actual del SSID guest.

4. **Actualizar contraseña:**
   - POST con nuevo password al endpoint del SSID guest.

5. **Aplicar cambios y logout.**

**Implementación de fallback:**
- Si TP-Link cambia su firmware y rompe el adapter, la app debe seguir funcionando en modo "manual": muestra la nueva contraseña en pantalla, el usuario la cambia en el router web manualmente, y la marca como aplicada con un botón.

**Mock adapter (testing):**
- `MockRouterAdapter` simula el flujo sin red real, para tests E2E y desarrollo offline.

**Importante:** El adapter es **el componente de mayor riesgo del proyecto**. Diseñarlo desde el día 1 con:
- Tests de integración contra un fixture HTTP grabado (uso de `nock`).
- Logs verbosos en cada paso de la negociación HTTP.
- Capacidad de fallback manual si la automatización falla.

### 5.5 SchedulerService

**Responsabilidad:** Ejecutar rotación de contraseña según cron configurado.

**Reglas:**
- Usar `node-cron` con timezone explícito.
- Al iniciar la app, verificar si la última rotación fue hace más de 24h. Si sí, ejecutar inmediatamente.
- Toda rotación se loguea en `audit_log` con resultado.
- Si la rotación falla (router no responde), reintentar 3 veces con backoff exponencial (1m, 5m, 15m).
- Si los 3 reintentos fallan, mostrar notificación visual persistente en la app pidiendo intervención manual.

### 5.6 Lineamientos UX/UI

**Principio rector:** sobrio, profesional, elegante. Es una app que se queda **horas** abierta en una laptop visible al cliente. Debe verse como software de calidad, no como "demo de hackathon".

**Inspiraciones aceptadas:**
- Linear (https://linear.app) — densidad, tipografía, sombras sutiles.
- Stripe Dashboard — paleta neutra con acentos puntuales.
- Vercel — minimalismo, monoespaciados bien usados.

**Inspiraciones rechazadas:**
- Apps con neón o gradientes saturados.
- Material Design 3 con muchas sombras y elevaciones.
- Templates genéricos de Bootstrap o "admin dashboards" gratuitos.

**Paleta de colores (obligatoria):**

```typescript
const palette = {
  // Neutros (base)
  background: '#FAFAFA',         // fondo de la app
  surface: '#FFFFFF',            // cards, paneles
  surfaceMuted: '#F4F4F5',       // hover sutil, inputs deshabilitados
  border: '#E4E4E7',             // bordes default
  borderStrong: '#D4D4D8',       // bordes hover/focus
  
  // Texto
  textPrimary: '#18181B',        // títulos, texto principal
  textSecondary: '#52525B',      // texto secundario
  textMuted: '#A1A1AA',          // texto deshabilitado, hints
  
  // Acción (un solo color de marca, NO arcoíris)
  accent: '#18181B',             // botón primario = negro elegante
  accentHover: '#27272A',
  accentForeground: '#FAFAFA',   // texto sobre accent

  // Estados (usar SOLO en feedback, no decoración)
  success: '#16A34A',
  warning: '#CA8A04',
  error: '#DC2626',
  info: '#2563EB',
};
```

**Tipografía:**
- Familia: **Inter** (vía `@fontsource/inter`) para UI.
- Familia: **JetBrains Mono** (vía `@fontsource/jetbrains-mono`) para contraseñas, IDs, monoespaciados.
- Escala (rem): `0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 2 / 2.5 / 3.5`.
- Pesos permitidos: 400 (regular), 500 (medium), 600 (semibold). NUNCA bold extremo.
- Line-height: 1.5 para texto, 1.2 para títulos.

**Espaciado:**
- Sistema 4px: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- Padding mínimo de cards: 24px.
- Gap entre secciones: 32px o 48px.

**Bordes y sombras:**
- Radio default: `8px` (cards), `6px` (botones, inputs).
- Sombras MUY sutiles: `0 1px 2px rgba(0,0,0,0.04)` para cards. NADA con blur > 8px.
- NUNCA usar sombras coloreadas o "glow effects".

**Iconos:**
- Librería: `lucide-react`.
- Tamaño default: 16px en línea, 20px en botones, 24px en headers.
- Stroke width: 1.5 (default de lucide). NO 2 ni 3.

**Componentes específicos:**

**WaiterView:**
- Pantalla completa con un solo botón centrado.
- Botón: 240px ancho × 80px alto, esquinas 8px, fondo `accent`, texto blanco.
- Texto del botón: "Imprimir QR de WiFi" en peso 500, tamaño 1.125rem.
- Encima del botón: SSID actual en monoespaciada pequeña, gris (`textSecondary`), peso 400.
- Debajo del botón: estado del sistema con un solo punto de color (verde/ámbar/rojo) y texto pequeño. Ejemplo: "● Sistema listo" / "● Impresora desconectada".
- Esquina inferior derecha: pequeño icono de engrane (16px, `textMuted`) que abre el modal de PIN. SIN etiqueta de texto.
- Sin barra de navegación, sin sidebar, sin header. Pantalla pura.
- Fondo: `background`. Botón es la única prominencia.

**Modal de PIN:**
- Centrado, 360px de ancho, padding 32px.
- 4 inputs grandes para PIN, monoespaciados, separados.
- Sin opción "olvidé mi PIN". El admin contacta a Okuni Solutions si lo pierde.
- Tras 3 fallos, bloquea por 5 minutos con countdown visible.

**AdminView:**
- Layout de dos columnas en pantallas ≥1024px: navegación lateral (240px) + contenido (resto).
- En pantallas más chicas: nav superior horizontal.
- Secciones de navegación (orden):
  1. Inicio (estado general del sistema)
  2. Impresora
  3. Router
  4. Programación (scheduler)
  5. Negocio (nombre, mensaje, logo)
  6. Estadísticas
  7. Logs
- Cada sección es un panel con header (título + descripción corta) y contenido en cards.
- Botones de acción: primario (negro), secundario (outline gris), destructivo (texto rojo, sin fondo).

**Sección "Impresora" (referencia visual):**
```
┌──────────────────────────────────────────────────────┐
│  Impresora                                            │
│  Configura el dispositivo para imprimir tickets.     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Impresora actual                                     │
│  ┌────────────────────────────────────────────────┐  │
│  │  EPSON TM-T20III  [USB · 04B8:0E15]           │  │
│  │  ● Conectada · 12ms                            │  │
│  │                                                 │  │
│  │  [Probar conexión]  [Imprimir prueba]          │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  [Buscar otra impresora]                              │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Discovery modal:**
- Al presionar "Buscar otra impresora", abre modal full-screen.
- Lista todas las impresoras detectadas en cards verticales.
- Cada card: nombre, tipo de conexión (icono USB/Sistema/Red), VID/PID si aplica, badge "Compatible ESC/POS" si la heurística lo confirma.
- Al hacer click en un item, ejecuta `testConnection()` automáticamente y muestra resultado inline.
- Botón "Imprimir prueba" para validar antes de aceptar.
- Solo tras una prueba exitosa, el botón "Usar esta impresora" se habilita.

**Estados visuales:**
- **Loading:** spinner sutil de 3 puntos (NO círculo giratorio agresivo). Texto descriptivo al lado.
- **Empty:** icono lucide grande (40px) en gris muted, título centrado, subtítulo, CTA opcional.
- **Error:** banner inline con borde izquierdo rojo de 3px, fondo rojo a 5% de opacidad, texto en `error`. NUNCA un toast emergente que desaparece — los errores deben quedar fijos hasta que el admin los aborde.
- **Success:** mismo formato pero con `success`. Solo usar en transiciones (ej. "Configuración guardada"), NO en estado persistente.

**Animaciones:**
- Solo transiciones suaves en hover/focus (150ms `ease-out`).
- NUNCA animaciones de entrada/salida ostentosas.
- Modales: fade simple 200ms, sin slide ni bounce.

**Responsividad:**
- Target principal: 1366×768 (laptops POS típicas).
- Soportar 1920×1080 sin estirar componentes (usar max-width).
- NO target móvil (la app no se usa en celular).

**Accesibilidad mínima:**
- Contraste WCAG AA en TODO texto.
- Focus visible con outline `accent` de 2px.
- Botones con `aria-label` cuando solo tienen icono.
- Soporte completo de teclado (Tab, Enter, Esc).

**Reglas de NO hacer:**
- ❌ Emojis en la UI (excepto en mensaje del ticket si el admin los configura).
- ❌ Más de 3 niveles de jerarquía visual en una pantalla.
- ❌ Más de un acento de color simultáneo.
- ❌ Gradientes (excepción: si el cliente provee logo con gradientes, respetarlo solo dentro del logo).
- ❌ Skeuomorfismo (sombras de profundidad, texturas).
- ❌ Drop shadows agresivas, blur grandes, glassmorphism.

---

## 6. FASES DEL PROYECTO

> **REGLA:** Cada fase termina con un Pull Request, code review por el agente orquestador, ejecución completa de tests, y actualización de `DECISIONS.md` con cualquier desviación.

### Fase 0 — Setup (estimado: 0.5 días)

**Entregables:**
- Repositorio inicializado con estructura de la sección 3.1.
- `package.json` con dependencias exactas de la sección 2.
- Vite + Electron + React funcionando con "Hello World".
- ESLint + Prettier + TypeScript estricto configurados.
- CI básico (GitHub Actions) ejecutando lint + type-check.
- `.context/PROJECT.md` con resumen del proyecto para que cualquier agente futuro tenga contexto.

**Criterio de aceptación:**
- `npm run dev` levanta Electron con ventana React.
- `npm run build` produce un `.exe` (aunque vacío) sin errores.
- `npm run lint` y `npm run type-check` pasan.

### Fase 1 — QRService + UI básica del mesero (estimado: 1 día)

**Entregables:**
- `QRService` implementado y testeado (vitest, ≥85% cobertura).
- `WaiterView.tsx` con botón único "Imprimir QR de WiFi" — **sin login, lista al abrir la app**.
- Indicador de estado del sistema (punto + texto pequeño debajo del botón).
- Icono de engrane discreto en esquina inferior derecha (sin etiqueta) para abrir modal de PIN.
- `getSystemHealth` IPC handler que reporta estado de impresora, router, scheduler y password vigente.
- IPC handler `printVoucher` que retorna preview en data URL (sin imprimir aún en esta fase).
- Pantalla muestra el QR generado en preview modal antes de implementar impresora.
- Integración con SQLite: tablas creadas vía migración, password de prueba pre-cargada.
- Aplicación de paleta y tipografía de Sección 5.6 desde el día 1.
- Auto-arranque preliminar al iniciar Windows (configurable, off por default en dev).

**Tests:**
- Unit: `QRService.formatPayload()` con caracteres especiales escapados.
- Unit: `PasswordService.generate()` produce 10 chars, charset correcto, sin colisiones en 10000 iteraciones.
- Component: `WaiterView` renderiza botón, click dispara IPC mockeado.
- Component: `WaiterView` muestra correctamente los 3 estados (listo / advertencia / error) según health.
- Visual: snapshot de Storybook (o equivalente) de la pantalla en los 3 estados.

**Criterio de aceptación:**
- El usuario abre la app, ve el botón inmediatamente sin pasos previos, lo presiona y aparece un QR válido (verificable escaneándolo con celular).
- La pantalla cumple con todos los lineamientos UX/UI de Sección 5.6 (revisión visual obligatoria por el agente orquestador antes de cerrar la fase).

### Fase 2 — PrinterService + impresión real + Discovery (estimado: 2 días)

**Bloqueador:** Cliente debe entregar modelo y método de conexión de impresora (USB/Red).

**Entregables:**
- `IPrinterAdapter` interface.
- `ThermalPrinterAdapter` usando `node-thermal-printer`.
- `MockPrinterAdapter` para desarrollo offline.
- Composición del ticket según layout de sección 5.2.
- Integración del QR como imagen en el ticket (no como texto).
- Métodos `discover()`, `testConnection()`, `printTestVoucher()`, `printDiagnosticPage()` implementados.
- Discovery vía spooler de Windows + USB enumeration + escaneo opcional de red.
- Tabla de VID/PID conocidos para inferencia de marca.
- Manejo de errores: impresora desconectada, sin papel, sin permisos, etc.

**Tests:**
- Integration: `PrinterService.print()` con mock adapter genera buffer ESC/POS esperado (snapshot test).
- Unit: parser de salida de `Get-Printer` (PowerShell) en stub.
- Unit: filtros de USB enumeration por VID conocidos.
- Unit: inferencia de marca por nombre y VID.
- Manual: imprimir en hardware real al menos 5 veces seguidas sin errores.
- Manual: discovery detecta correctamente impresora USB y la del spooler de Windows.

**Criterio de aceptación:**
- Imprimir un QR escaneable que conecte un Android e iPhone reales a la red WiFi.
- Tiempo desde click hasta papel cortado: ≤ 4 segundos.
- Discovery devuelve resultados en ≤ 5 segundos.
- `testConnection()` reporta correctamente estado online/offline.

### Fase 3 — AdminView + Configuración persistente (estimado: 2 días)

**Entregables:**
- `AdminView.tsx` con login por PIN (4 dígitos, almacenado como bcrypt).
- Layout de dos columnas con navegación lateral según Sección 5.6.
- Sección **Inicio:** dashboard con estado de impresora, router, scheduler y última rotación.
- Sección **Impresora:**
  - Card con impresora actual + estado en vivo.
  - Botón "Probar conexión" → llama a `testPrinterConnection()`.
  - Botón "Imprimir prueba" → llama a `printTestVoucher()`.
  - Botón "Imprimir diagnóstico" → llama a `printDiagnosticPage()`.
  - Botón "Buscar otra impresora" → abre modal de discovery.
  - Modal de discovery: lista de dispositivos detectados con prueba inline antes de aceptar.
- Sección **Router:** placeholder en esta fase (se completa en Fase 4).
- Sección **Programación:** input de hora de rotación, timezone.
- Sección **Negocio:** nombre, mensaje del ticket, upload de logo (opcional).
- Sección **Estadísticas:** gráfico simple de impresiones por día/semana/mes.
- Sección **Logs:** tabla de últimos 100 eventos del audit_log con exportación a CSV.
- Validación de inputs (no aceptar IPs malformadas, hora cron inválida, etc.).
- Bloqueo del PIN tras 3 intentos fallidos por 5 minutos.

**Tests:**
- Component: validación de PIN con bcrypt.
- Component: modal de discovery muestra resultados, prueba inline, habilita botón solo tras éxito.
- Integration: cambio de configuración persiste en electron-store y sobrevive a restart.
- Integration: PIN bloquea correctamente y desbloquea tras timeout.

**Criterio de aceptación:**
- El admin puede:
  - Cambiar SSID, contraseña router, hora de rotación y mensaje del ticket sin abrir archivos.
  - Descubrir impresoras disponibles, probar conexión, imprimir prueba y guardar selección.
  - Ver el estado del sistema de un vistazo desde el dashboard de Inicio.
- La pantalla cumple con todos los lineamientos UX/UI de Sección 5.6 (revisión visual obligatoria por el agente orquestador antes de cerrar la fase).

### Fase 4 — RouterService + TPLinkArcherAdapter (estimado: 2-3 días)

**Bloqueador:** Cliente debe haber comprado el TP-Link Archer C24/A6.

**Entregables:**
- `IRouterAdapter` interface.
- `TPLinkArcherAdapter` implementado contra modelo real.
- `MockRouterAdapter` para tests.
- Cifrado de credenciales del router con `safeStorage` de Electron.
- Modo fallback manual si el adapter falla.
- Sección **Router** completa en AdminView:
  - Inputs: IP, usuario, contraseña, modelo, SSID guest.
  - Botón "Probar alcanzabilidad" → llama a `pingRouter()` (sin login).
  - Botón "Probar conexión completa" → llama a `testRouterConnection()` (login + lectura SSID).
  - Indicador visual del último resultado (con detalle del paso que falló si aplica).
- Manejo de fallback manual: si el adapter falla, muestra contraseña nueva con instrucciones para cambiar manualmente en el router web.

**Tests:**
- Unit: parsing de respuestas HTML/JSON del router (con fixtures grabados).
- Integration con `nock`: simular login, listar SSIDs, cambiar password, logout.
- Manual: cambiar contraseña real 10 veces seguidas sin desincronización entre app y router.
- Manual: probar fallback manual desconectando físicamente el router.

**Criterio de aceptación:**
- App ejecuta cambio de contraseña en TP-Link Archer real, los nuevos clientes pueden conectarse y los viejos quedan desconectados al expirar DHCP.
- Admin puede probar la conexión al router desde la app antes de guardar configuración.

**Riesgos identificados:**
- 🔴 ALTO: Cambio de firmware TP-Link puede romper el adapter. Mitigación: fallback manual + tests con fixtures versionados.
- 🟡 MEDIO: Routers con encriptación RSA en login son más complejos. Mitigación: probar primero el modelo más simple.

### Fase 5 — SchedulerService + rotación automática (estimado: 1 día)

**Entregables:**
- `SchedulerService` con `node-cron`.
- Verificación al startup: si última rotación fue hace > 24h, ejecutar.
- Reintentos con backoff exponencial.
- Notificación visual persistente si la rotación falla.
- Integración con `audit_log`.

**Tests:**
- Unit: lógica de scheduling con tiempo mockeado.
- Integration: ejecución completa simulada.

**Criterio de aceptación:**
- Dejar la app corriendo 24h y verificar que la rotación se ejecutó a las 23:00 sin intervención.

### Fase 6 — Pulido + Empaquetado + Documentación (estimado: 1.5 días)

**Entregables:**
- Auto-arranque al iniciar Windows.
- Icono y branding final.
- Instalador `.exe` con `electron-builder`.
- Code signing (si el cliente provee certificado, opcional v1).
- Manual de usuario (PDF) para mesero y admin.
- Manual de instalación (PDF) para Okuni Solutions.
- Video corto (loom) de cómo opera el mesero.

**Criterio de aceptación:**
- Instalación limpia en una laptop nueva (sin dependencias dev) funciona end-to-end.

### Fase 7 — Piloto en producción (estimado: 1-2 semanas en operación)

**Entregables:**
- Despliegue en restaurante.
- Capacitación a meseros (15 min).
- Monitoreo diario de logs los primeros 7 días.
- Hotfixes según incidencias.

**Métricas de éxito:**
- 0 días sin servicio WiFi en la primera semana.
- ≥ 95% de impresiones exitosas (medido en `print_log`).
- ≥ 95% de rotaciones automáticas exitosas.
- Mesero capaz de operar sin asistencia tras 1 capacitación.

---

## 7. ESTRATEGIA DE TESTING

### 7.1 Pirámide de tests

- **Unit (vitest):** ≥80% cobertura en `services/` y `adapters/`.
- **Integration (vitest + better-sqlite3 in-memory + nock):** flujos completos main process.
- **E2E (Playwright):** 3 escenarios mínimo:
  1. Mesero presiona botón, ve preview, "imprime" (con mock).
  2. Admin entra con PIN, cambia configuración, persiste tras restart.
  3. Scheduler dispara rotación, password se actualiza en DB.

### 7.2 Comandos esperados

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint . --ext ts,tsx",
    "type-check": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```

### 7.3 Criterios para merge

Ningún PR se mergea sin:
1. ✅ `npm run test` pasa sin warnings.
2. ✅ `npm run lint` con 0 errores y 0 warnings.
3. ✅ `npm run type-check` con 0 errores.
4. ✅ Cobertura de tests no decrece más de 2 puntos.
5. ✅ Code review por agente orquestador.
6. ✅ `DECISIONS.md` actualizado si hubo cambios arquitectónicos.

---

## 8. SEGURIDAD

### 8.1 Reglas no negociables

- **Electron BrowserWindow** debe usar `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
- **Credenciales del router** se almacenan con `safeStorage.encryptString()` (DPAPI en Windows).
- **PIN del admin** se almacena con bcrypt (rondas ≥10), nunca en plano.
- **CSP estricta** en index.html: `default-src 'self'`.
- **Sin remote module:** `enableRemoteModule: false` (deprecated, evitarlo de origen).
- **Auto-updater** (si se implementa): solo desde HTTPS, verificación de firma obligatoria.
- **Logs** nunca contienen passwords ni tokens. Sanitización en `electron-log` con regex.

### 8.2 Threat model resumido

| Amenaza | Mitigación |
|---|---|
| Atacante físico accede a la laptop | DPAPI cifra credenciales con la cuenta del usuario Windows. |
| Mesero curioso intenta leer admin | PIN bcrypt + bloqueo tras 3 intentos fallidos. |
| Cliente WiFi escanea la red interna | Aislado por router secundario (capa de red, no app). |
| MITM en cambio de contraseña router | Comunicación local (LAN), ataque requiere acceso físico. Aceptable. |
| Inyección en formato WIFI:T:... | Escape estricto de caracteres reservados en QRService. |

---

## 9. REGLAS PARA AGENTES DE DESARROLLO

> Esta sección está dirigida a los agentes especializados (Angular dev, Laravel dev, etc. del ecosistema Claude Code de Okuni Solutions). Para este proyecto se requieren los agentes: **`frontend-react-dev`**, **`backend-node-dev`**, **`qa-tester`**, **`security-reviewer`**, y **`orchestrator`**.

### 9.1 Reglas generales

1. **NUNCA modificar versiones del `package.json`** sin actualizar también `DECISIONS.md` con la justificación.
2. **NUNCA introducir nuevas dependencias** sin validar:
   - Mantenida activamente (release < 18 meses).
   - ≥ 1000 descargas semanales en npm.
   - Licencia compatible (MIT, Apache 2.0, BSD, ISC). Rechazar GPL.
3. **NUNCA usar `any` en TypeScript.** Si es absolutamente necesario, usar `unknown` y narrow.
4. **NUNCA hacer commits con `console.log`** en código de producción. Usar `electron-log`.
5. **NUNCA mergear código que rompa el contrato IPC** sin actualizar `src/shared/types.ts`.
6. **SIEMPRE** escribir tests antes de marcar una tarea como terminada.
7. **SIEMPRE** documentar funciones públicas con JSDoc.
8. **SIEMPRE** revisar `.context/ARCHITECTURE.md` antes de empezar trabajo en una nueva fase.
9. **SIEMPRE** actualizar `.context/DEPENDENCIES.md` al agregar/quitar dependencias.

### 9.2 Reglas específicas frontend (React)

- Componentes funcionales, hooks. NO componentes de clase.
- Estado local con `useState`/`useReducer`. Estado global con Zustand. NO Redux.
- Estilos con Tailwind. NO CSS modules ni styled-components.
- Sin librerías de UI pesadas (Material UI, Ant). Componentes propios o shadcn copy-paste.
- Accesibilidad: roles ARIA en botones, focus visible, contraste WCAG AA.
- **Adherencia estricta a Sección 5.6 (UX/UI):**
  - La paleta de colores definida es la única permitida. No introducir nuevos tonos sin aprobación del orquestador.
  - Tipografía: solo Inter (UI) y JetBrains Mono (passwords/IDs). NO importar otras familias.
  - Sombras, bordes y radios deben respetar los tokens definidos.
  - Cada componente nuevo debe pasar revisión visual del orquestador antes de merge.
  - PROHIBIDO: gradientes decorativos, glassmorphism, neón, animaciones ostentosas, emojis en UI, drop shadows agresivas.
- Crear archivo `src/renderer/styles/tokens.ts` exportando la paleta y escala tipográfica como constantes TypeScript reutilizables. Tailwind config debe consumir estos tokens.

### 9.3 Reglas específicas backend (Node/Electron main)

- Async/await siempre. NO callbacks (excepto APIs nativas que lo requieran).
- Errores con `try/catch` explícito. NO promesas sin manejar.
- Servicios son clases con dependencias inyectadas en constructor.
- Acceso a DB encapsulado en repositorios. NO queries SQL en servicios.
- Nunca bloquear el main process > 100ms. Operaciones pesadas en `worker_threads` si necesario.

### 9.4 Reglas específicas QA

- E2E debe correr en CI con Electron headless.
- Cada bug encontrado en producción debe convertirse en test de regresión antes del fix.
- Smoke test diario en piloto (Fase 7) automatizado.

### 9.5 Reglas específicas security

- Auditoría obligatoria al final de Fase 4 (router) y Fase 6 (empaquetado).
- `npm audit` con severidad ≥ moderate debe resolverse antes de release.
- Threat model actualizado en cada cambio mayor.

### 9.6 Cómo solicitar excepciones

Si un agente considera que una regla bloquea avance legítimo:
1. Documentar la situación en `DECISIONS.md` con encabezado `## Excepción solicitada: ...`.
2. Esperar review del orquestador antes de proceder.
3. La excepción aceptada queda en `DECISIONS.md` permanentemente como historial.

---

## 10. RIESGOS Y MITIGACIONES

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | TP-Link cambia firmware y rompe adapter | Media | Alto | Modo fallback manual + tests con fixtures + considerar OpenWrt si es crítico |
| R2 | Impresora térmica del cliente no es ESC/POS estándar | Baja | Alto | Validar modelo antes de Fase 2; node-thermal-printer cubre 95% del mercado |
| R3 | Windows Defender bloquea el `.exe` sin firma | Alta | Medio | Documentar instrucciones para whitelist; opcional: firmar con cert EV |
| R4 | Cliente pierde contraseña y queda fuera del router | Baja | Alto | Backup automático de password en SQLite; pantalla de recovery con PIN admin |
| R5 | Pérdida de energía durante rotación deja router/DB desincronizados | Media | Medio | Transacción de DB se commitea SOLO después de confirmación HTTP del router |
| R6 | Soft Restaurant satura impresora con comandas y QR no imprime | Media | Bajo | Cola de impresión propia con prioridad baja; reintentos automáticos |
| R7 | Cliente compra TP-Link incompatible con adapter | Media | Alto | Lista corta de modelos validados antes de la compra (Archer C24, A6 v3) |

---

## 11. ENTREGABLES FINALES

Al cierre del proyecto el cliente recibe:

1. **App instalada** en la laptop POS, configurada y operando.
2. **Router TP-Link** configurado y conectado al módem Telmex.
3. **Manual de usuario** en PDF (mesero + admin).
4. **Manual de instalación/troubleshooting** en PDF.
5. **Video tutorial** (5 min máx) en formato Loom o similar.
6. **Acceso al repositorio** privado de GitHub con todo el código.
7. **30 días de soporte post-go-live** (ajustar según contrato).

---

## 12. POST-LAUNCH ROADMAP (v2 — fuera de alcance v1)

Ideas para futuras versiones, NO desarrollar en v1:

- Generación de QR con logo del restaurante embebido.
- Mensajes promocionales rotativos en el ticket.
- Dashboard web para ver estadísticas remotamente.
- Multi-impresora (mesa + barra + cocina).
- Soporte para múltiples sucursales con sincronización en la nube.
- Integración directa con Soft Restaurant para imprimir QR junto con la cuenta.
- App móvil para que el dueño vea estadísticas en el celular.
- Modo "happy hour": rotación más frecuente en horarios pico.

---

## APÉNDICE A — Comandos de inicialización del proyecto

```bash
# 1. Crear proyecto
mkdir wifi-voucher-manager && cd wifi-voucher-manager
npm init -y

# 2. Dependencias de producción (versiones exactas)
npm install --save \
  better-sqlite3@^11.5.0 \
  qrcode@^1.5.4 \
  node-thermal-printer@^4.6.0 \
  axios@^1.7.7 \
  node-cron@^3.0.3 \
  electron-store@^10.0.0 \
  electron-log@^5.2.0 \
  bcrypt@^5.1.1 \
  zustand@^5.0.0 \
  usb@^2.14.0

# 3. Dependencias de desarrollo
npm install --save-dev \
  electron@^39.0.0 \
  electron-builder@^25.1.0 \
  vite@^5.4.0 \
  @vitejs/plugin-react@^4.3.0 \
  react@^18.3.1 \
  react-dom@^18.3.1 \
  @types/react@^18.3.0 \
  @types/react-dom@^18.3.0 \
  @types/node@^22.0.0 \
  typescript@^5.6.3 \
  tailwindcss@^3.4.0 \
  autoprefixer@^10.4.0 \
  postcss@^8.4.0 \
  lucide-react@^0.460.0 \
  @fontsource/inter@^5.1.0 \
  @fontsource/jetbrains-mono@^5.1.0 \
  recharts@^2.13.0 \
  vitest@^2.1.0 \
  @testing-library/react@^16.0.0 \
  playwright@^1.48.0 \
  eslint@^9.0.0 \
  prettier@^3.3.0 \
  nock@^13.5.0

# 4. Inicializar TypeScript
npx tsc --init

# 5. Inicializar Tailwind
npx tailwindcss init -p

# 6. Crear estructura
mkdir -p src/{main/{ipc,services,adapters/{routers,printers},db/{migrations,repositories},utils},preload,renderer/{pages,components,hooks,store,types},shared} tests/{unit,integration,e2e} resources/installer .context
```

---

## APÉNDICE B — Glosario

- **ESC/POS:** Comandos estándar de Epson para impresoras térmicas. Soportado por la mayoría de marcas.
- **DPAPI:** Data Protection API de Windows; cifra datos por usuario sin manejar llaves.
- **Portal cautivo:** Página que aparece al conectarse a un WiFi público antes de tener acceso. **NO usamos esto**, usamos QR directo.
- **safeStorage (Electron):** API que envuelve DPAPI/keychain para cifrado seguro local.
- **WIFI:T:WPA;...:** Estándar de QR para conexión automática WiFi (definido en IEEE 802.11u y soportado nativamente por iOS y Android).
- **Soft Restaurant:** POS comercial usado por el cliente; NO se modifica.

---

**Fin del plan técnico v1.0**
