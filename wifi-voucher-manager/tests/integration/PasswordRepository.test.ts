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

describe('PasswordRepository — applied lifecycle (Fase 4)', () => {
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

  it('insert default applied=1 si no se especifica', async () => {
    const row = await repo.insert({
      password: 'PW123ABC',
      ssid: 'guest',
      active: 1,
      rotated_by: 'auto',
      router_response: null,
    });
    expect(row.applied).toBe(1);
    expect(row.applied_method).toBeNull();
  });

  it('markPendingManualApply marca applied=0 y applied_method', async () => {
    const row = await repo.insert({
      password: 'PW123ABC',
      ssid: 'guest',
      active: 1,
      rotated_by: 'auto',
      router_response: null,
    });
    await repo.markPendingManualApply(row.id);
    const updated = await repo.getActive();
    expect(updated?.applied).toBe(0);
    expect(updated?.applied_method).toBe('manual_pending');
  });

  it('markAppliedManually marca applied=1 con applied_method="manual"', async () => {
    const row = await repo.insert({
      password: 'PW123ABC',
      ssid: 'guest',
      active: 1,
      rotated_by: 'auto',
      router_response: null,
    });
    await repo.markPendingManualApply(row.id);
    await repo.markAppliedManually(row.id);
    const updated = await repo.getActive();
    expect(updated?.applied).toBe(1);
    expect(updated?.applied_method).toBe('manual');
  });

  it('listPendingManualApply devuelve sólo rows con applied=0 AND applied_method="manual_pending"', async () => {
    const ok = await repo.insert({
      password: 'A', ssid: 'guest', active: 0, rotated_by: 'auto', router_response: null,
    });
    const pending = await repo.insert({
      password: 'B', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await repo.markPendingManualApply(pending.id);
    const list = await repo.listPendingManualApply();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(pending.id);
    expect(ok).toBeDefined();
  });
});
