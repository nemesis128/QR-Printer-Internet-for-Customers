import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LockoutTracker } from '../../../src/main/services/LockoutTracker.js';

describe('LockoutTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('permite intentos hasta el límite y luego bloquea', () => {
    const t = new LockoutTracker({ maxAttempts: 3, windowMs: 5 * 60_000 });
    expect(t.isLocked()).toBe(false);
    t.recordFailure();
    t.recordFailure();
    expect(t.isLocked()).toBe(false);
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
  });

  it('expone remainingMs durante el bloqueo', () => {
    const t = new LockoutTracker({ maxAttempts: 1, windowMs: 5 * 60_000 });
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
    expect(t.remainingMs()).toBeLessThanOrEqual(5 * 60_000);
    expect(t.remainingMs()).toBeGreaterThan(0);
  });

  it('libera el bloqueo tras windowMs', () => {
    const t = new LockoutTracker({ maxAttempts: 1, windowMs: 60_000 });
    t.recordFailure();
    expect(t.isLocked()).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(t.isLocked()).toBe(false);
  });

  it('reset() limpia los intentos', () => {
    const t = new LockoutTracker({ maxAttempts: 2, windowMs: 60_000 });
    t.recordFailure();
    t.reset();
    t.recordFailure();
    expect(t.isLocked()).toBe(false);
  });
});
