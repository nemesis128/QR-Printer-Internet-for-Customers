import { describe, expect, it } from 'vitest';

import {
  AppConfigStore,
  DEFAULT_APP_CONFIG,
  type AppConfig,
} from '../../../src/main/services/AppConfigStore.js';

class InMemoryBackend {
  private data: Record<string, unknown> = {};
  get<T>(key: string, fallback: T): T {
    return (this.data[key] as T) ?? fallback;
  }
  set(key: string, value: unknown): void {
    this.data[key] = value;
  }
}

describe('AppConfigStore', () => {
  it('getAll devuelve defaults si nunca se persistió', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    expect(store.getAll()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('updateBusiness persiste y getAll lo refleja', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateBusiness({
      name: 'Restaurante Demo',
      footerMessage: '¡Vuelve pronto!',
      logoPath: null,
    });
    expect(store.getAll().business.name).toBe('Restaurante Demo');
  });

  it('updateAdmin persiste el hash y el flag pinIsDefault', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateAdmin({ pinHash: '$argon2id$xxx', pinIsDefault: false });
    expect(store.getAll().admin.pinIsDefault).toBe(false);
  });

  it('updateSchedule persiste hora y minuto', () => {
    const store = new AppConfigStore(new InMemoryBackend());
    store.updateSchedule({ hour: 23, minute: 30, timezone: 'America/Mexico_City' });
    const cfg: AppConfig = store.getAll();
    expect(cfg.schedule).toEqual({ hour: 23, minute: 30, timezone: 'America/Mexico_City' });
  });
});
