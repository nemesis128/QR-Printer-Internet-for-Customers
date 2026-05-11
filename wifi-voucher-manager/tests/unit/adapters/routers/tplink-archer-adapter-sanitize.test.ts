import { describe, expect, it } from 'vitest';

import { TPLinkArcherAdapter } from '../../../../src/main/adapters/routers/tplink-archer-adapter.js';

describe('TPLinkArcherAdapter sanitization', () => {
  it('safeBodyFor redacta passwords en el body que se loguea', () => {
    const out = TPLinkArcherAdapter.safeBodyFor('username=admin&password=s3cret&key=abc');
    expect(out).not.toContain('s3cret');
    expect(out).not.toContain('abc');
    expect(out).toContain('***REDACTED***');
    expect(out).toContain('admin');
  });
});
