import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockPrinterDriver } from '../../../src/main/adapters/printers/mock-driver.js';
import type { PrinterDriver } from '../../../src/main/adapters/printers/driver-types.js';
import { createConnection } from '../../../src/main/db/connection.js';
import { PrintJobRepository } from '../../../src/main/db/repositories/PrintJobRepository.js';
import { PrinterRepository } from '../../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../../src/main/db/run-migrations.js';
import { PrintQueue } from '../../../src/main/services/PrintQueue.js';

describe('PrintQueue', () => {
  let db: Knex;
  let jobs: PrintJobRepository;
  let printers: PrinterRepository;
  let printerId: string;
  let mockDriver: MockPrinterDriver;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    jobs = new PrintJobRepository(db);
    printers = new PrinterRepository(db);
    const p = await printers.create({
      id: randomUUID(),
      name: 'Mock',
      connection: 'bluetooth-ble',
      identifier: 'a|b|c',
      width_chars: 32,
      active: 1,
      notes: null,
    });
    printerId = p.id;
    mockDriver = new MockPrinterDriver({ mode: 'success', latencyMs: 10 });
  });

  afterEach(async () => {
    await db.destroy();
  });

  function makeQueue(driver: PrinterDriver): PrintQueue {
    const renderBytes = (): Uint8Array => new Uint8Array([0x1b, 0x40]);
    const drivers = {
      usb: driver,
      bluetooth: driver,
      'bluetooth-ble': driver,
    };
    return new PrintQueue({ db, jobs, printers, drivers, renderBytes });
  }

  it('enqueue procesa el job y lo marca printed', async () => {
    const queue = makeQueue(mockDriver);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: { x: 1 },
      triggered_by: 'waiter',
    });
    await queue.waitIdle();
    const job = await jobs.findById(jobId);
    expect(job?.status).toBe('printed');
    expect(mockDriver.lastWrites).toHaveLength(1);
  });

  it('múltiples enqueues se procesan secuencialmente', async () => {
    const queue = makeQueue(mockDriver);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await queue.enqueue({
        printer_id: printerId,
        use_case: 'voucher',
        payload: { i },
        triggered_by: null,
      });
      ids.push(id);
    }
    await queue.waitIdle();
    for (const id of ids) {
      const job = await jobs.findById(id);
      expect(job?.status).toBe('printed');
    }
    expect(mockDriver.lastWrites).toHaveLength(5);
  });

  it('cuando el driver falla, marca failed con last_error', async () => {
    const failing = new MockPrinterDriver({ mode: 'always-fail' });
    const queue = makeQueue(failing);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: { x: 1 },
      triggered_by: null,
    });
    await queue.waitIdle();
    const job = await jobs.findById(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.last_error).toBeTruthy();
    expect(job?.attempts).toBe(1);
  });

  it('retry(jobId) re-encola un job failed', async () => {
    const failing = new MockPrinterDriver({ mode: 'always-fail' });
    const queue = makeQueue(failing);
    const jobId = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: {},
      triggered_by: null,
    });
    await queue.waitIdle();
    expect((await jobs.findById(jobId))?.status).toBe('failed');

    // Cambiar driver a success vía nuevo queue
    const queue2 = makeQueue(mockDriver);
    await queue2.retry(jobId);
    await queue2.waitIdle();
    expect((await jobs.findById(jobId))?.status).toBe('printed');
  });

  it('bootstrap procesa pending pre-existentes', async () => {
    // Insertar un job pending sin queue
    await jobs.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    const queue = makeQueue(mockDriver);
    await queue.bootstrap();
    await queue.waitIdle();
    const pending = await jobs.listPending();
    expect(pending).toHaveLength(0);
    expect(mockDriver.lastWrites).toHaveLength(1);
  });

  it('getJobStatus expone status + last_error', async () => {
    const queue = makeQueue(mockDriver);
    const id = await queue.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload: {},
      triggered_by: null,
    });
    await queue.waitIdle();
    const status = await queue.getJobStatus(id);
    expect(status?.status).toBe('printed');
    expect(status?.lastError).toBeNull();
  });
});
