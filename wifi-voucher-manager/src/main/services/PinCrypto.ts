import argon2, { type Options } from 'argon2';

const HASH_OPTIONS: Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 2 ** 16,
  parallelism: 1,
};

export class PinCrypto {
  static async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, HASH_OPTIONS);
  }

  static async verifyPin(pin: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, pin);
    } catch {
      return false;
    }
  }
}
