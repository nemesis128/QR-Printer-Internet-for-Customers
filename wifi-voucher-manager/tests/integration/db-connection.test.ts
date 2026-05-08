import { describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';

describe('createConnection', () => {
  it('crea Knex con SQLite in-memory + pragmas activos', async () => {
    const db = createConnection({ filename: ':memory:' });

    const fkResult = await db.raw('PRAGMA foreign_keys');
    expect(fkResult[0].foreign_keys).toBe(1);

    const journalResult = await db.raw('PRAGMA journal_mode');
    expect(['memory', 'wal']).toContain(journalResult[0].journal_mode);

    await db.destroy();
  });

  it('SELECT 1 ejecuta correctamente', async () => {
    const db = createConnection({ filename: ':memory:' });
    const result = await db.raw('SELECT 1 as one');
    expect(result[0].one).toBe(1);
    await db.destroy();
  });
});
