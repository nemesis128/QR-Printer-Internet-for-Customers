import argon2, { type Options } from 'argon2';

const HASH_OPTIONS: Options = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 2 ** 16,
  parallelism: 1,
};

export type PinRuleCode =
  | 'length'
  | 'non-digit'
  | 'default'
  | 'repeated'
  | 'ascending'
  | 'descending';

export interface PinValidation {
  ok: boolean;
  code?: PinRuleCode;
  message?: string;
}

const RULE_MESSAGES: Record<PinRuleCode, string> = {
  length: 'El PIN debe tener exactamente 4 dígitos.',
  'non-digit': 'El PIN solo puede contener números.',
  default: 'No puedes usar 0000 como PIN.',
  repeated: 'El PIN no puede tener todos los dígitos iguales.',
  ascending: 'El PIN no puede ser una secuencia ascendente.',
  descending: 'El PIN no puede ser una secuencia descendente.',
};

function fail(code: PinRuleCode): PinValidation {
  return { ok: false, code, message: RULE_MESSAGES[code] };
}

function isAscending(pin: string): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]!) !== Number(pin[i - 1]!) + 1) return false;
  }
  return true;
}

function isDescending(pin: string): boolean {
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]!) !== Number(pin[i - 1]!) - 1) return false;
  }
  return true;
}

function isAllRepeated(pin: string): boolean {
  return pin.split('').every((c) => c === pin[0]);
}

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

  static isAcceptablePin(pin: string): PinValidation {
    if (pin.length !== 4) return fail('length');
    if (!/^[0-9]{4}$/.test(pin)) return fail('non-digit');
    if (pin === '0000') return fail('default');
    if (isAllRepeated(pin)) return fail('repeated');
    if (isAscending(pin)) return fail('ascending');
    if (isDescending(pin)) return fail('descending');
    return { ok: true };
  }
}
