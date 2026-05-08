import { describe, expect, it } from 'vitest';

import { PasswordService } from '../../../src/main/services/PasswordService.js';

describe('PasswordService', () => {
  describe('CHARSET y LENGTH', () => {
    it('CHARSET excluye chars confundibles y reservados WIFI:', () => {
      expect(PasswordService.CHARSET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      expect(PasswordService.CHARSET).not.toContain('0');
      expect(PasswordService.CHARSET).not.toContain('O');
      expect(PasswordService.CHARSET).not.toContain('1');
      expect(PasswordService.CHARSET).not.toContain('I');
      expect(PasswordService.CHARSET).not.toContain('l');
      expect(PasswordService.CHARSET).not.toContain('\\');
      expect(PasswordService.CHARSET).not.toContain(';');
      expect(PasswordService.CHARSET).not.toContain(',');
      expect(PasswordService.CHARSET).not.toContain(':');
      expect(PasswordService.CHARSET).not.toContain('"');
    });

    it('LENGTH es 10', () => {
      expect(PasswordService.LENGTH).toBe(10);
    });
  });

  describe('generate()', () => {
    it('produce string de 10 chars', () => {
      const pwd = PasswordService.generate();
      expect(pwd).toHaveLength(10);
    });

    it('todos los chars están en el CHARSET (10000 iteraciones)', () => {
      for (let i = 0; i < 10_000; i++) {
        const pwd = PasswordService.generate();
        for (const c of pwd) {
          expect(PasswordService.CHARSET).toContain(c);
        }
      }
    });

    it('no produce colisiones en 10000 iteraciones', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 10_000; i++) {
        seen.add(PasswordService.generate());
      }
      expect(seen.size).toBe(10_000);
    });

    it('distribución uniforme: cada char aparece al menos N/charset.length × 0.5 veces', () => {
      const counts = new Map<string, number>();
      const N = 10_000;
      for (let i = 0; i < N; i++) {
        for (const c of PasswordService.generate()) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
      }
      const expectedPerChar = (N * PasswordService.LENGTH) / PasswordService.CHARSET.length;
      const minAcceptable = expectedPerChar * 0.5;
      for (const c of PasswordService.CHARSET) {
        expect(counts.get(c) ?? 0).toBeGreaterThan(minAcceptable);
      }
    });
  });

  describe('isValidCharset()', () => {
    it('acepta strings con chars del charset', () => {
      expect(PasswordService.isValidCharset('ABCD23PQRS')).toBe(true);
      expect(PasswordService.isValidCharset('XYZK7M3PQA')).toBe(true);
    });

    it('rechaza chars fuera del charset', () => {
      expect(PasswordService.isValidCharset('abcd23pqrs')).toBe(false);
      expect(PasswordService.isValidCharset('ABCD0123IL')).toBe(false);
      expect(PasswordService.isValidCharset('AB CD23PQR')).toBe(false);
      expect(PasswordService.isValidCharset('AB:CD23PQR')).toBe(false);
    });

    it('rechaza string vacío', () => {
      expect(PasswordService.isValidCharset('')).toBe(false);
    });
  });
});
