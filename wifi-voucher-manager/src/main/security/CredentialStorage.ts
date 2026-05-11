import electron from 'electron';

export interface CredentialStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MockCredentialStorage implements CredentialStorage {
  private readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

export class SafeStorageCredentialStorage implements CredentialStorage {
  private readonly cache = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.cache.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    const { safeStorage } = electron;
    if (!safeStorage.isEncryptionAvailable()) {
      return Promise.reject(new Error('safeStorage no disponible en este sistema'));
    }
    const encrypted = safeStorage.encryptString(value);
    this.cache.set(key, encrypted.toString('base64'));
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.cache.delete(key);
    return Promise.resolve();
  }
}

export function createCredentialStorage(): CredentialStorage {
  if (
    process.env.WIFI_VOUCHER_USE_MOCK_STORAGE === '1' ||
    process.env.NODE_ENV === 'test'
  ) {
    return new MockCredentialStorage();
  }
  return new SafeStorageCredentialStorage();
}
