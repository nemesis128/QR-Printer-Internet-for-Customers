import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PrinterRepository } from '../../src/main/db/repositories/PrinterRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PrinterRepository', () => {
  let db: Knex;
  let repo: PrinterRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PrinterRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  function newPrinterInput() {
    return {
      id: randomUUID(),
      name: 'Aomus My A1',
      connection: 'bluetooth-ble' as const,
      identifier: 'peripheralid|svc|char',
      width_chars: 32 as const,
      active: 1 as const,
      notes: null,
    };
  }

  it('create + findById', async () => {
    const created = await repo.create(newPrinterInput());
    const found = await repo.findById(created.id);
    expect(found?.name).toBe('Aomus My A1');
    expect(found?.connection).toBe('bluetooth-ble');
  });

  it('findById retorna null cuando no existe', async () => {
    const found = await repo.findById('no-existe');
    expect(found).toBeNull();
  });

  it('list devuelve todas las filas', async () => {
    await repo.create(newPrinterInput());
    await repo.create({ ...newPrinterInput(), id: randomUUID(), name: 'Otra' });
    const rows = await repo.list();
    expect(rows).toHaveLength(2);
  });

  it('update modifica solo los campos pasados', async () => {
    const created = await repo.create(newPrinterInput());
    const updated = await repo.update({ id: created.id, name: 'Renombrada' });
    expect(updated.name).toBe('Renombrada');
    expect(updated.connection).toBe(created.connection);
  });

  it('setActive invariante: solo una row activa', async () => {
    const a = await repo.create({ ...newPrinterInput(), id: randomUUID(), active: 1 });
    const b = await repo.create({ ...newPrinterInput(), id: randomUUID(), active: 0 });
    await repo.setActive(b.id);
    const rows = await repo.list();
    expect(rows.find((r) => r.id === a.id)?.active).toBe(0);
    expect(rows.find((r) => r.id === b.id)?.active).toBe(1);
  });

  it('delete remueve la fila', async () => {
    const created = await repo.create(newPrinterInput());
    await repo.delete(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });
});
