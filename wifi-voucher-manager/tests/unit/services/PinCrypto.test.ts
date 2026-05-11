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

describe('PinCrypto.isAcceptablePin (D-018)', () => {
  const cases: Array<[string, boolean, string?]> = [
    ['1234', false, 'asc'],
    ['4321', false, 'desc'],
    ['1111', false, 'repeated'],
    ['0000', false, 'default'],
    ['12a4', false, 'non-digit'],
    ['123', false, 'short'],
    ['12345', false, 'long'],
    ['', false, 'empty'],
    ['1357', true],
    ['8642', true],
    ['1928', true],
    ['9518', true],
  ];

  it.each(cases)('isAcceptablePin(%s) === %s (%s)', (pin, expected) => {
    expect(PinCrypto.isAcceptablePin(pin).ok).toBe(expected);
  });

  it('reporta el código de regla violada', () => {
    expect(PinCrypto.isAcceptablePin('0000').code).toBe('default');
    expect(PinCrypto.isAcceptablePin('1111').code).toBe('repeated');
    expect(PinCrypto.isAcceptablePin('1234').code).toBe('ascending');
    expect(PinCrypto.isAcceptablePin('4321').code).toBe('descending');
    expect(PinCrypto.isAcceptablePin('12a4').code).toBe('non-digit');
    expect(PinCrypto.isAcceptablePin('123').code).toBe('length');
  });
});
