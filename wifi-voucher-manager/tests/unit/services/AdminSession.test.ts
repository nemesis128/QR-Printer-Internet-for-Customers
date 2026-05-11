import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSession } from '../../../src/main/services/AdminSession.js';

describe('AdminSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('issue() devuelve un token nuevo cada vez', () => {
    const s = new AdminSession({ ttlMs: 30 * 60_000 });
    const a = s.issue();
    const b = s.issue();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(64); // 32 bytes hex
  });

  it('validate() acepta token vigente y refresca el TTL', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    vi.advanceTimersByTime(30_000);
    expect(s.validate(token)).toBe(true);
    vi.advanceTimersByTime(50_000);
    expect(s.validate(token)).toBe(true); // se refrescó
  });

  it('validate() rechaza token vencido', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    vi.advanceTimersByTime(60_001);
    expect(s.validate(token)).toBe(false);
  });

  it('revoke() invalida el token', () => {
    const s = new AdminSession({ ttlMs: 60_000 });
    const token = s.issue();
    s.revoke(token);
    expect(s.validate(token)).toBe(false);
  });
});
