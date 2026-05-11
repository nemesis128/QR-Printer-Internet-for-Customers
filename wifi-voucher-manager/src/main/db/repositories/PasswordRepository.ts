import type { Knex } from 'knex';

export interface PasswordRow {
  id: number;
  password: string;
  ssid: string;
  created_at: string;
  active: 0 | 1;
  rotated_by: 'auto' | 'manual' | 'seed';
  router_response: string | null;
  applied: 0 | 1;
  applied_method: 'auto' | 'manual' | 'manual_pending' | null;
}

export type PasswordInsertInput = Omit<PasswordRow, 'id' | 'created_at' | 'applied' | 'applied_method'>;

export class PasswordRepository {
  constructor(private readonly db: Knex) {}

  async insert(input: PasswordInsertInput): Promise<PasswordRow> {
    const [id] = await this.db('passwords').insert(input);
    const row = await this.db<PasswordRow>('passwords').where({ id }).first();
    if (!row) throw new Error(`PasswordRepository.insert: row id=${id} no encontrada después de insertar`);
    return row;
  }

  async getActive(): Promise<PasswordRow | null> {
    const row = await this.db<PasswordRow>('passwords')
      .where({ active: 1 })
      .orderBy('created_at', 'desc')
      .first();
    return row ?? null;
  }

  async setActive(id: number): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('passwords').update({ active: 0 });
      await trx('passwords').where({ id }).update({ active: 1 });
    });
  }

  async listRecent(limit = 50): Promise<PasswordRow[]> {
    return this.db<PasswordRow>('passwords')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit);
  }

  async markPendingManualApply(id: number): Promise<void> {
    await this.db('passwords')
      .where({ id })
      .update({ applied: 0, applied_method: 'manual_pending' });
  }

  async markAppliedManually(id: number): Promise<void> {
    await this.db('passwords')
      .where({ id })
      .update({ applied: 1, applied_method: 'manual' });
  }

  async markAppliedAutomatically(id: number, routerResponse: string | null): Promise<void> {
    await this.db('passwords')
      .where({ id })
      .update({ applied: 1, applied_method: 'auto', router_response: routerResponse });
  }

  async listPendingManualApply(): Promise<PasswordRow[]> {
    return this.db<PasswordRow>('passwords')
      .where({ applied: 0, applied_method: 'manual_pending' })
      .orderBy('id', 'desc');
  }
}
