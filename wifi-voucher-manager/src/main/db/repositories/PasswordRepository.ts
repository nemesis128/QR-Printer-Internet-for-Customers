import type { Knex } from 'knex';

export interface PasswordRow {
  id: number;
  password: string;
  ssid: string;
  created_at: string;
  active: 0 | 1;
  rotated_by: 'auto' | 'manual' | 'seed';
  router_response: string | null;
}

export type PasswordInsertInput = Omit<PasswordRow, 'id' | 'created_at'>;

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
}
