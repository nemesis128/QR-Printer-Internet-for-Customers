import type { Knex } from 'knex';

export type AuditEventType =
  | 'password_rotation'
  | 'print'
  | 'config_change'
  | 'error'
  | 'health_check'
  | 'admin_login'
  | 'admin_pin_change';

export interface AuditLogRow {
  id: number;
  event_type: AuditEventType;
  payload: string | null;
  created_at: string;
}

export interface AuditEntryInput {
  event_type: AuditEventType;
  payload: unknown;
}

export interface ListOptions {
  limit?: number;
  eventType?: AuditEventType;
}

export class AuditLogRepository {
  constructor(private readonly db: Knex) {}

  async insert(entry: AuditEntryInput): Promise<void> {
    await this.db('audit_log').insert({
      event_type: entry.event_type,
      payload: entry.payload === null ? null : JSON.stringify(entry.payload),
    });
  }

  async list(opts: ListOptions = {}): Promise<AuditLogRow[]> {
    const limit = opts.limit ?? 100;
    let q = this.db<AuditLogRow>('audit_log').orderBy('id', 'desc').limit(limit);
    if (opts.eventType) q = q.where('event_type', opts.eventType);
    return q;
  }

  async countByType(eventType: AuditEventType): Promise<number> {
    const row = await this.db('audit_log').where('event_type', eventType).count<{ c: number }[]>('* as c').first();
    return Number(row?.c ?? 0);
  }
}
