import { describe, expect, it } from 'vitest';

describe('smoke test — vitest se ejecuta correctamente', () => {
  it('matemática básica funciona', () => {
    expect(2 + 2).toBe(4);
  });

  it('happy-dom expone document', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement).toBeDefined();
  });
});
