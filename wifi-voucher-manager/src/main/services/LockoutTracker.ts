export interface LockoutOptions {
  maxAttempts: number;
  windowMs: number;
}

export class LockoutTracker {
  private failures: number[] = [];

  constructor(private readonly opts: LockoutOptions) {}

  recordFailure(): void {
    this.purgeExpired();
    this.failures.push(Date.now());
  }

  reset(): void {
    this.failures = [];
  }

  isLocked(): boolean {
    this.purgeExpired();
    return this.failures.length >= this.opts.maxAttempts;
  }

  remainingMs(): number {
    this.purgeExpired();
    if (this.failures.length < this.opts.maxAttempts) return 0;
    const oldest = this.failures[0]!;
    return Math.max(0, oldest + this.opts.windowMs - Date.now());
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - this.opts.windowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
