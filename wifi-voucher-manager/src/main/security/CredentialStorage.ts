import electron from 'electron';

export interface CredentialStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MockCredentialStorage implements CredentialStorage {
  private readonly store = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/require-await
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class SafeStorageCredentialStorage implements CredentialStorage {
  private readonly cache = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/require-await
  async get(key: string): Promise<string | null> {
    return this.cache.get(key) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async set(key: string, value: string): Promise<void> {
    const { safeStorage } = electron;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage no disponible en este sistema');
    }
    const encrypted = safeStorage.encryptString(value);
    this.cache.set(key, encrypted.toString('base64'));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
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
