import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('AuditLogRepository', () => {
  let db: ReturnType<typeof createConnection>;
  let repo: AuditLogRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new AuditLogRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('insert + list devuelve eventos en orden descendente', async () => {
    await repo.insert({ event_type: 'print', payload: { jobId: 'a' } });
    await repo.insert({ event_type: 'config_change', payload: { field: 'business.name' } });
    const rows = await repo.list({ limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.event_type).toBe('config_change');
  });

  it('listByType filtra correctamente', async () => {
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'password_rotation', payload: { success: true } });
    const prints = await repo.list({ eventType: 'print', limit: 10 });
    expect(prints).toHaveLength(1);
  });

  it('countByType agrega correctamente', async () => {
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'print', payload: null });
    await repo.insert({ event_type: 'error', payload: null });
    expect(await repo.countByType('print')).toBe(2);
    expect(await repo.countByType('error')).toBe(1);
  });
});
