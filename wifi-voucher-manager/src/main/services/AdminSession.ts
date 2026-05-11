import { randomBytes } from 'node:crypto';

export interface AdminSessionOptions {
  ttlMs: number;
}

export class AdminSession {
  private readonly tokens = new Map<string, number>();

  constructor(private readonly opts: AdminSessionOptions) {}

  issue(): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, Date.now() + this.opts.ttlMs);
    return token;
  }

  validate(token: string): boolean {
    const expiry = this.tokens.get(token);
    if (expiry === undefined) return false;
    if (Date.now() > expiry) {
      this.tokens.delete(token);
      return false;
    }
    this.tokens.set(token, Date.now() + this.opts.ttlMs);
    return true;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }
}
