import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { AuditLogRepository } from '../../src/main/db/repositories/AuditLogRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';
import { StatsService } from '../../src/main/services/StatsService.js';

async function seedPassword(db: ReturnType<typeof createConnection>): Promise<number> {
  const [id] = await db('passwords').insert({
    password: 'ABCDEFG123',
    ssid: 'test-ssid',
    active: 1,
    rotated_by: 'test',
    router_response: null,
  });
  return id!;
}

describe('StatsService', () => {
  let db: ReturnType<typeof createConnection>;
  let stats: StatsService;
  let audit: AuditLogRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    audit = new AuditLogRepository(db);
    stats = new StatsService(db, audit);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('getSummary devuelve totales en cero cuando no hay datos', async () => {
    const s = await stats.getSummary();
    expect(s.totalPrints).toBe(0);
    expect(s.successfulPrints).toBe(0);
    expect(s.totalRotations).toBe(0);
  });

  it('getSummary cuenta prints de print_log', async () => {
    const passwordId = await seedPassword(db);
    await db('print_log').insert([
      { password_id: passwordId, success: 1 },
      { password_id: passwordId, success: 1 },
      { password_id: passwordId, success: 0, error_message: 'fail' },
    ]);
    const s = await stats.getSummary();
    expect(s.totalPrints).toBe(3);
    expect(s.successfulPrints).toBe(2);
  });

  it('getDailyPrints devuelve serie de últimos N días', async () => {
    const passwordId = await seedPassword(db);
    await db('print_log').insert({ password_id: passwordId, success: 1 });
    const series = await stats.getDailyPrints(7);
    expect(series).toHaveLength(7);
    expect(series.reduce((acc, p) => acc + p.count, 0)).toBe(1);
  });
});
