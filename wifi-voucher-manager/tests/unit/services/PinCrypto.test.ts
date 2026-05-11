import { describe, expect, it } from 'vitest';

import { PinCrypto } from '../../../src/main/services/PinCrypto.js';

describe('PinCrypto.hashPin/verifyPin', () => {
  it('hashPin produce un string argon2id verificable', async () => {
    const hash = await PinCrypto.hashPin('1234');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await PinCrypto.verifyPin('1234', hash)).toBe(true);
  });

  it('verifyPin rechaza PIN incorrecto', async () => {
    const hash = await PinCrypto.hashPin('1234');
    expect(await PinCrypto.verifyPin('9999', hash)).toBe(false);
  });

  it('hashPin produce hashes distintos para el mismo input (salt aleatorio)', async () => {
    const a = await PinCrypto.hashPin('0000');
    const b = await PinCrypto.hashPin('0000');
    expect(a).not.toEqual(b);
  });
});
