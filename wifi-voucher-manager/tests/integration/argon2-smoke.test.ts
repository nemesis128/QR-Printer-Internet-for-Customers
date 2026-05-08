import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';

describe('argon2 native binding — smoke', () => {
  it('hash + verify funciona post-rebuild', async () => {
    const hash = await argon2.hash('test-pin-1234', {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 2 ** 16,
      parallelism: 1,
    });

    expect(hash).toMatch(/^\$argon2id\$/);

    const ok = await argon2.verify(hash, 'test-pin-1234');
    expect(ok).toBe(true);

    const wrong = await argon2.verify(hash, 'wrong-pin');
    expect(wrong).toBe(false);
  });
});
