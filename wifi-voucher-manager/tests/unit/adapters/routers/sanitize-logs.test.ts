import { describe, expect, it } from 'vitest';

import { sanitizeForLog } from '../../../../src/main/adapters/routers/sanitize-logs.js';

describe('sanitizeForLog', () => {
  it('redacta password en query params', () => {
    expect(sanitizeForLog('POST /login?password=s3cr3t&user=admin')).toBe(
      'POST /login?password=***REDACTED***&user=admin'
    );
  });

  it('redacta key en JSON body', () => {
    const input = JSON.stringify({ key: 'abc123', other: 'visible' });
    const out = sanitizeForLog(input);
    expect(out).not.toContain('abc123');
    expect(out).toContain('visible');
    expect(out).toContain('***REDACTED***');
  });

  it('redacta múltiples ocurrencias', () => {
    const input = 'password=a&token=b&secret=c';
    const out = sanitizeForLog(input);
    expect(out).not.toMatch(/=a&|=b&|=c$/);
    expect(out.split('***REDACTED***').length - 1).toBe(3);
  });

  it('respeta texto sin secretos', () => {
    expect(sanitizeForLog('GET /status?lang=es')).toBe('GET /status?lang=es');
  });
});
