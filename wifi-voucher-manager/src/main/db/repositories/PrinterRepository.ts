import type { Knex } from 'knex';

export type PrinterConnection = 'usb' | 'bluetooth' | 'bluetooth-ble';

export interface PrinterRow {
  id: string;
  name: string;
  connection: PrinterConnection;
  identifier: string;
  width_chars: 32 | 48;
  active: 0 | 1;
  notes: string | null;
}

export type PrinterCreateInput = PrinterRow;

export class PrinterRepository {
  constructor(private readonly db: Knex) {}

  async create(input: PrinterCreateInput): Promise<PrinterRow> {
    await this.db('printer').insert(input);
    const row = await this.findById(input.id);
    if (!row) throw new Error(`PrinterRepository.create: row id=${input.id} no encontrada`);
    return row;
  }

  async list(): Promise<PrinterRow[]> {
    return this.db<PrinterRow>('printer').select('*').orderBy('name');
  }

  async findById(id: string): Promise<PrinterRow | null> {
    const row = await this.db<PrinterRow>('printer').where({ id }).first();
    return row ?? null;
  }

  async update(input: Partial<PrinterRow> & { id: string }): Promise<PrinterRow> {
    const { id, ...rest } = input;
    await this.db('printer').where({ id }).update(rest);
    const row = await this.findById(id);
    if (!row) throw new Error(`PrinterRepository.update: row id=${id} no encontrada después de update`);
    return row;
  }

  async setActive(id: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await trx('printer').update({ active: 0 });
      await trx('printer').where({ id }).update({ active: 1 });
    });
  }

  async delete(id: string): Promise<void> {
    await this.db('printer').where({ id }).delete();
  }
}
