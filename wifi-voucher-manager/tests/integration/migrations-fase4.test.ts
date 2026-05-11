import { describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('migration 20260511_120000_passwords_applied', () => {
  it('agrega columnas applied y applied_method a passwords', async () => {
    const db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const info = await db.raw('PRAGMA table_info(passwords)') as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain('applied');
    expect(cols).toContain('applied_method');
    await db.destroy();
  });

  it('rows existentes reciben applied=1 por default retro-compat', async () => {
    const db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    const [id] = await db('passwords').insert({
      password: 'TEST123XYZ',
      ssid: 'guest',
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
    const row = await db('passwords').where({ id }).first();
    expect(row.applied).toBe(1);
    expect(row.applied_method).toBeNull();
    await db.destroy();
  });
});
