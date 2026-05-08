import { randomInt } from 'node:crypto';

export class PasswordService {
  static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static readonly LENGTH = 10;

  static generate(): string {
    const charset = PasswordService.CHARSET;
    const len = PasswordService.LENGTH;
    let result = '';
    for (let i = 0; i < len; i++) {
      result += charset[randomInt(0, charset.length)];
    }
    return result;
  }

  static isValidCharset(s: string): boolean {
    if (s.length === 0) return false;
    const charset = PasswordService.CHARSET;
    for (const c of s) {
      if (!charset.includes(c)) return false;
    }
    return true;
  }
}
