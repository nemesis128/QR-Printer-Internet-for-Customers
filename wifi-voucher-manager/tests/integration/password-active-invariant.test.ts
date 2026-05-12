import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('Invariante: 0 ó 1 password con active=1 (property test)', () => {
  let db: ReturnType<typeof createConnection>;
  let repo: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PasswordRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('después de 1000 inserts + setActive intercalados, exactamente 0 ó 1 row tiene active=1', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const row = await repo.insert({
        password: `PW${i.toString().padStart(7, '0')}`,
        ssid: 'guest',
        active: 0,
        rotated_by: 'auto',
        router_response: null,
      });
      ids.push(row.id);
      if (i % 3 === 0) {
        const target = ids[Math.floor(Math.random() * ids.length)]!;
        await repo.setActive(target);
      }
    }
    const activeCount = await db('passwords').where({ active: 1 }).count<{ c: number }[]>('* as c').first();
    expect(Number(activeCount?.c ?? 0)).toBeLessThanOrEqual(1);
  });
});
