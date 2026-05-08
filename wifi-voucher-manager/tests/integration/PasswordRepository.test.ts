import type { Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createConnection } from '../../src/main/db/connection.js';
import { PasswordRepository } from '../../src/main/db/repositories/PasswordRepository.js';
import { runMigrations } from '../../src/main/db/run-migrations.js';

describe('PasswordRepository', () => {
  let db: Knex;
  let repo: PasswordRepository;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
    repo = new PasswordRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('insert + getActive happy path', async () => {
    const inserted = await repo.insert({
      password: 'ABCD23PQRS',
      ssid: 'Restaurante-Clientes',
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.password).toBe('ABCD23PQRS');

    const active = await repo.getActive();
    expect(active).not.toBeNull();
    expect(active?.password).toBe('ABCD23PQRS');
  });

  it('getActive() retorna null cuando no hay rows', async () => {
    const active = await repo.getActive();
    expect(active).toBeNull();
  });

  it('setActive() invariante: solo una row con active=1', async () => {
    const a = await repo.insert({
      password: 'AAAA11AAAA',
      ssid: 'X',
      active: 1,
      rotated_by: 'seed',
      router_response: null,
    });
    const b = await repo.insert({
      password: 'BBBB22BBBB',
      ssid: 'X',
      active: 0,
      rotated_by: 'auto',
      router_response: null,
    });
    expect(a.active).toBe(1);
    expect(b.active).toBe(0);

    await repo.setActive(b.id);

    const rows = await db('passwords').orderBy('id');
    expect(rows.find((r) => r.id === a.id)?.active).toBe(0);
    expect(rows.find((r) => r.id === b.id)?.active).toBe(1);

    const active = await repo.getActive();
    expect(active?.id).toBe(b.id);
  });

  it('listRecent(limit) devuelve rows ordenadas DESC por created_at', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.insert({
        password: `PASSWORD${i}`.padEnd(10, 'X'),
        ssid: 'X',
        active: 0,
        rotated_by: 'auto',
        router_response: null,
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    const recent = await repo.listRecent(3);
    expect(recent).toHaveLength(3);
    const ids = recent.map((r) => r.id);
    expect(ids[0]).toBeGreaterThan(ids[2]);
  });
});
