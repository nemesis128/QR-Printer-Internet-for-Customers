import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PrintJobRepository } from '../../src/main/db/repositories/PrintJobRepository.js';
import { PrinterRepository } from '../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PrintJobRepository', () => {
  let db: Knex;
  let repo: PrintJobRepository;
  let printerId: string;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const pRepo = new PrinterRepository(db);
    const printer = await pRepo.create({
      id: randomUUID(),
      name: 'X',
      connection: 'bluetooth-ble',
      identifier: 'a|b|c',
      width_chars: 32,
      active: 1,
      notes: null,
    });
    printerId = printer.id;
    repo = new PrintJobRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('enqueue + findById', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{"x":1}',
      triggered_by: 'waiter',
    });
    expect(job.status).toBe('pending');
    const found = await repo.findById(job.id);
    expect(found?.id).toBe(job.id);
  });

  it('listPending devuelve sólo pending', async () => {
    const a = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markPrinted(a.id);
    await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    const pending = await repo.listPending();
    expect(pending).toHaveLength(1);
  });

  it('markPrinted setea status + printed_at', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markPrinted(job.id);
    const found = await repo.findById(job.id);
    expect(found?.status).toBe('printed');
    expect(found?.printed_at).toBeTruthy();
  });

  it('markFailed setea status + last_error + incrementa attempts', async () => {
    const job = await repo.enqueue({
      printer_id: printerId,
      use_case: 'voucher',
      payload_data: '{}',
      triggered_by: null,
    });
    await repo.markFailed(job.id, 'BLE off');
    const found = await repo.findById(job.id);
    expect(found?.status).toBe('failed');
    expect(found?.last_error).toBe('BLE off');
    expect(found?.attempts).toBe(1);
  });

  it('listRecent ordena por created_at DESC', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const j = await repo.enqueue({
        printer_id: printerId,
        use_case: 'voucher',
        payload_data: '{}',
        triggered_by: null,
      });
      ids.push(j.id);
      await new Promise((r) => setTimeout(r, 5));
    }
    const recent = await repo.listRecent(10);
    expect(recent[0]!.id).toBe(ids[2]);
  });
});
