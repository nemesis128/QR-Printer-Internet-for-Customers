import { describe, expect, it } from 'vitest';

import {
  MockCredentialStorage,
  createCredentialStorage,
} from '../../../src/main/security/CredentialStorage.js';

describe('MockCredentialStorage', () => {
  it('set + get devuelve el valor almacenado', async () => {
    const s = new MockCredentialStorage();
    await s.set('router.password', 's3cret');
    expect(await s.get('router.password')).toBe('s3cret');
  });

  it('get() de clave inexistente devuelve null', async () => {
    const s = new MockCredentialStorage();
    expect(await s.get('missing')).toBeNull();
  });

  it('delete() elimina la clave', async () => {
    const s = new MockCredentialStorage();
    await s.set('a', 'b');
    await s.delete('a');
    expect(await s.get('a')).toBeNull();
  });
});

describe('createCredentialStorage', () => {
  it('respeta WIFI_VOUCHER_USE_MOCK_STORAGE=1', () => {
    const original = process.env.WIFI_VOUCHER_USE_MOCK_STORAGE;
    process.env.WIFI_VOUCHER_USE_MOCK_STORAGE = '1';
    const s = createCredentialStorage();
    expect(s).toBeInstanceOf(MockCredentialStorage);
    if (original === undefined) delete process.env.WIFI_VOUCHER_USE_MOCK_STORAGE;
    else process.env.WIFI_VOUCHER_USE_MOCK_STORAGE = original;
  });
});
