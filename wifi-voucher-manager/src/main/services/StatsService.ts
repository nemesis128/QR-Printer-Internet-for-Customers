import type { Knex } from 'knex';

import type { AuditLogRepository } from '../db/repositories/AuditLogRepository.js';

export interface StatsSummary {
  totalPrints: number;
  successfulPrints: number;
  failedPrints: number;
  totalRotations: number;
  successfulRotations: number;
}

export interface DailyPrintPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export class StatsService {
  constructor(
    private readonly db: Knex,
    private readonly audit: AuditLogRepository,
  ) {}

  async getSummary(): Promise<StatsSummary> {
    const total = await this.db('print_log').count<{ c: number }[]>('* as c').first();
    const success = await this.db('print_log').where('success', 1).count<{ c: number }[]>('* as c').first();
    const totalRotations = await this.audit.countByType('password_rotation');
    const successRotations = await this.db('audit_log')
      .where('event_type', 'password_rotation')
      .whereRaw("json_extract(payload, '$.success') = 1")
      .count<{ c: number }[]>('* as c')
      .first();
    return {
      totalPrints: Number(total?.c ?? 0),
      successfulPrints: Number(success?.c ?? 0),
      failedPrints: Number(total?.c ?? 0) - Number(success?.c ?? 0),
      totalRotations,
      successfulRotations: Number(successRotations?.c ?? 0),
    };
  }

  async getDailyPrints(days: number): Promise<DailyPrintPoint[]> {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const rows = await this.db('print_log')
      .where('printed_at', '>=', cutoffStr)
      .select(this.db.raw("substr(printed_at, 1, 10) as day"))
      .count<{ day: string; c: number }[]>('* as c')
      .groupBy('day');
    const counts = new Map<string, number>(rows.map((r) => [r.day, Number(r.c)]));
    const out: DailyPrintPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: counts.get(iso) ?? 0 });
    }
    return out;
  }
}
