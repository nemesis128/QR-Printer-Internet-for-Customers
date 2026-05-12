export interface AppConfigBackend {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface BusinessConfig {
  name: string;
  footerMessage: string;
  logoPath: string | null;
}

export interface ScheduleConfig {
  hour: number;
  minute: number;
  timezone: string;
}

export interface AdminConfig {
  pinHash: string;
  pinIsDefault: boolean;
}

export interface RouterConfig {
  host: string;
  user: string;
  model: string;
  ssidGuest: string;
}

export interface SystemConfig {
  lastHealthCheckFailed: boolean;
  lastHealthCheckAt: string | null;
}

export interface AppConfig {
  business: BusinessConfig;
  schedule: ScheduleConfig;
  admin: AdminConfig;
  router: RouterConfig;
  system: SystemConfig;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  business: {
    name: 'Mi Restaurante',
    footerMessage: '¡Gracias por tu visita!',
    logoPath: null,
  },
  schedule: { hour: 23, minute: 0, timezone: 'America/Mexico_City' },
  admin: { pinHash: '', pinIsDefault: true },
  router: { host: '', user: 'admin', model: 'TP-Link Archer C24', ssidGuest: '' },
  system: { lastHealthCheckFailed: false, lastHealthCheckAt: null },
};

export class AppConfigStore {
  constructor(private readonly backend: AppConfigBackend) {}

  getAll(): AppConfig {
    return {
      business: this.backend.get('business', DEFAULT_APP_CONFIG.business),
      schedule: this.backend.get('schedule', DEFAULT_APP_CONFIG.schedule),
      admin: this.backend.get('admin', DEFAULT_APP_CONFIG.admin),
      router: this.backend.get('router', DEFAULT_APP_CONFIG.router),
      system: this.backend.get('system', DEFAULT_APP_CONFIG.system),
    };
  }

  updateBusiness(b: BusinessConfig): void {
    this.backend.set('business', b);
  }

  updateSchedule(s: ScheduleConfig): void {
    this.backend.set('schedule', s);
  }

  updateAdmin(a: AdminConfig): void {
    this.backend.set('admin', a);
  }

  updateRouter(r: RouterConfig): void {
    this.backend.set('router', r);
  }

  updateSystem(s: SystemConfig): void {
    this.backend.set('system', s);
  }
}
