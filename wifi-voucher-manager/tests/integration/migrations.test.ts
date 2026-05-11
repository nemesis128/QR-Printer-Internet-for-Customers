import { describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('migrations — Fase 1–4 schema', () => {
  it('aplica las 6 migraciones desde DB vacía', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      const result = await runMigrations(db);
      expect(result.filesApplied).toHaveLength(6);
      expect(result.filesApplied).toEqual(
        expect.arrayContaining([
          expect.stringContaining('init_system'),
          expect.stringContaining('passwords'),
          expect.stringContaining('print_log'),
          expect.stringContaining('config_audit'),
          expect.stringContaining('printers'),
          expect.stringContaining('passwords_applied'),
        ])
      );
    } finally {
      await db.destroy();
    }
  });

  it('crea las 7 tablas esperadas', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      for (const tableName of [
        'system_info',
        'passwords',
        'print_log',
        'config',
        'audit_log',
        'printer',
        'print_job',
      ]) {
        const exists = await db.schema.hasTable(tableName);
        expect(exists, `tabla ${tableName} debe existir`).toBe(true);
      }
    } finally {
      await db.destroy();
    }
  });

  it('seed inicial de system_info presente', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      const rows = await db('system_info').select('*');
      const keys = rows.map((r) => r.key);
      expect(keys).toContain('schema_version');
      expect(keys).toContain('app_version_last_run');
    } finally {
      await db.destroy();
    }
  });

  it('migrate.latest() es idempotente — segunda corrida no aplica nada', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      const first = await runMigrations(db);
      expect(first.filesApplied.length).toBe(6);
      const second = await runMigrations(db);
      expect(second.filesApplied.length).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('FK enforcement está activo (insert con FK rota falla)', async () => {
    const db = createConnection({ filename: ':memory:' });
    try {
      await runMigrations(db);
      await expect(
        db('print_log').insert({
          password_id: 9999,
          success: 1,
          printed_at: new Date().toISOString(),
        })
      ).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
