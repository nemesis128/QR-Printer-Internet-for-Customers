import { describe, expect, it } from 'vitest';

import { MockPrinterDriver } from '../../../../src/main/adapters/printers/mock-driver.js';
import type { PrinterRow } from '../../../../src/main/db/repositories/PrinterRepository.js';

const printer: PrinterRow = {
  id: 'p1',
  name: 'Mock',
  connection: 'bluetooth-ble',
  identifier: 'a|b|c',
  width_chars: 32,
  active: 1,
  notes: null,
};

describe('MockPrinterDriver', () => {
  it('mode=success: write resuelve y guarda los bytes', async () => {
    const drv = new MockPrinterDriver({ mode: 'success' });
    await drv.write(printer, new Uint8Array([1, 2, 3]));
    expect(drv.lastWrites).toHaveLength(1);
    expect(Array.from(drv.lastWrites[0]!)).toEqual([1, 2, 3]);
  });

  it('mode=success: testConnection resuelve', async () => {
    const drv = new MockPrinterDriver({ mode: 'success' });
    await expect(drv.testConnection(printer)).resolves.toBeUndefined();
  });

  it('mode=always-fail: write rechaza', async () => {
    const drv = new MockPrinterDriver({ mode: 'always-fail' });
    await expect(drv.write(printer, new Uint8Array([1]))).rejects.toThrow();
  });

  it('mode=always-fail: testConnection rechaza', async () => {
    const drv = new MockPrinterDriver({ mode: 'always-fail' });
    await expect(drv.testConnection(printer)).rejects.toThrow();
  });

  it('mode=fail-after-n: las primeras N writes pasan; la N+1 falla', async () => {
    const drv = new MockPrinterDriver({ mode: 'fail-after-n', failAfterN: 2 });
    await drv.write(printer, new Uint8Array([1]));
    await drv.write(printer, new Uint8Array([2]));
    await expect(drv.write(printer, new Uint8Array([3]))).rejects.toThrow();
  });

  it('latencyMs simula delay', async () => {
    const drv = new MockPrinterDriver({ mode: 'success', latencyMs: 50 });
    const start = Date.now();
    await drv.write(printer, new Uint8Array([1]));
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
