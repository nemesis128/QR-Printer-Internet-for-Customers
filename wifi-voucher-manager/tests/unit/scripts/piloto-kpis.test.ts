import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { createConnection } from '../../../src/main/db/connection.js';
import { runMigrations } from '../../../src/main/db/run-migrations.js';
import { computeKpis } from '../../../scripts/piloto-kpis.mjs';

describe('computeKpis', () => {
  let db: ReturnType<typeof createConnection>;

  beforeEach(async () => {
    db = createConnection({ filename: ':memory:' });
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('devuelve totales en cero con DB vacía', async () => {
    const k = await computeKpis(db);
    expect(k.totalPrints).toBe(0);
    expect(k.printSuccessRate).toBe(null);
    expect(k.totalRotations).toBe(0);
    expect(k.rotationSuccessRate).toBe(null);
    expect(k.daysWithoutService).toBe(null);
  });

  it('printSuccessRate = exitosos / totales', async () => {
    const [passId] = await db('passwords').insert({
      password: 'PW123', ssid: 'guest', active: 1, rotated_by: 'auto', router_response: null,
    });
    await db('print_log').insert([
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 1, error_message: null },
      { password_id: passId, success: 0, error_message: 'fail' },
    ]);
    const k = await computeKpis(db);
    expect(k.totalPrints).toBe(4);
    expect(k.successfulPrints).toBe(3);
    expect(k.printSuccessRate).toBeCloseTo(0.75, 2);
  });

  it('rotationSuccessRate filtra por payload.success=true', async () => {
    await db('audit_log').insert([
      { event_type: 'password_rotation', payload: JSON.stringify({ success: true }) },
      { event_type: 'password_rotation', payload: JSON.stringify({ success: true }) },
      { event_type: 'password_rotation', payload: JSON.stringify({ success: false }) },
    ]);
    const k = await computeKpis(db);
    expect(k.totalRotations).toBe(3);
    expect(k.successfulRotations).toBe(2);
    expect(k.rotationSuccessRate).toBeCloseTo(0.6667, 3);
  });

  it('meetsTargets=true cuando ambos rates >= 0.95', async () => {
    const [passId] = await db('passwords').insert({
      password: 'PW', ssid: 'g', active: 1, rotated_by: 'auto', router_response: null,
    });
    for (let i = 0; i < 19; i++) {
      await db('print_log').insert({ password_id: passId, success: 1, error_message: null });
    }
    await db('print_log').insert({ password_id: passId, success: 0, error_message: 'x' });
    for (let i = 0; i < 19; i++) {
      await db('audit_log').insert({
        event_type: 'password_rotation',
        payload: JSON.stringify({ success: true }),
      });
    }
    await db('audit_log').insert({
      event_type: 'password_rotation',
      payload: JSON.stringify({ success: false }),
    });
    const k = await computeKpis(db);
    expect(k.printSuccessRate).toBeCloseTo(0.95, 2);
    expect(k.rotationSuccessRate).toBeCloseTo(0.95, 2);
    expect(k.meetsTargets).toBe(true);
  });
});
