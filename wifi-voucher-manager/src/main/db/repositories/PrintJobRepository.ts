import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';

export type JobStatus = 'pending' | 'printed' | 'failed';

export interface PrintJobRow {
  id: string;
  printer_id: string;
  use_case: 'voucher';
  payload_data: string;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  triggered_by: string | null;
  created_at: string;
  printed_at: string | null;
}

export interface EnqueueInput {
  printer_id: string;
  use_case: 'voucher';
  payload_data: string;
  triggered_by: string | null;
}

export class PrintJobRepository {
  constructor(private readonly db: Knex) {}

  async enqueue(input: EnqueueInput): Promise<PrintJobRow> {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    await this.db('print_job').insert({
      id,
      ...input,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at,
      printed_at: null,
    });
    const row = await this.findById(id);
    if (!row) throw new Error(`PrintJobRepository.enqueue: row id=${id} no encontrada`);
    return row;
  }

  async findById(id: string): Promise<PrintJobRow | null> {
    const row = await this.db<PrintJobRow>('print_job').where({ id }).first();
    return row ?? null;
  }

  async listPending(): Promise<PrintJobRow[]> {
    return this.db<PrintJobRow>('print_job').where({ status: 'pending' }).orderBy('created_at');
  }

  async listRecent(limit = 50): Promise<PrintJobRow[]> {
    return this.db<PrintJobRow>('print_job').orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit);
  }

  async markPrinted(id: string): Promise<void> {
    await this.db('print_job').where({ id }).update({
      status: 'printed',
      printed_at: new Date().toISOString(),
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const job = await this.findById(id);
    const attempts = (job?.attempts ?? 0) + 1;
    await this.db('print_job').where({ id }).update({
      status: 'failed',
      last_error: error,
      attempts,
    });
  }

  async resetToPending(id: string): Promise<void> {
    await this.db('print_job').where({ id }).update({
      status: 'pending',
      last_error: null,
    });
  }
}
