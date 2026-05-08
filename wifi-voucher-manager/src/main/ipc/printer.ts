import electron from 'electron';
import { z } from 'zod';

import type {
  DiscoveredPrinter,
  JobStatusSnapshot,
  PrinterRecord,
  PrinterTestResult,
  RecentJobSummary,
} from '../../shared/types.js';
import { discoverAll } from '../adapters/printers/detect.js';
import type { PrinterDriver } from '../adapters/printers/driver-types.js';
import type { PrintJobRepository } from '../db/repositories/PrintJobRepository.js';
import type { PrinterRepository, PrinterRow } from '../db/repositories/PrinterRepository.js';
import type { PrintQueue } from '../services/PrintQueue.js';

const { ipcMain } = electron;

const ConnectionSchema = z.union([z.literal('usb'), z.literal('bluetooth'), z.literal('bluetooth-ble')]);

const TestConnectionSchema = z.object({
  connection: ConnectionSchema,
  identifier: z.string().min(1),
  width_chars: z.union([z.literal(32), z.literal(48)]),
});

const SetActiveSchema = z.object({ id: z.string().min(1) });
const JobIdSchema = z.object({ jobId: z.string().min(1) });
const ListRecentSchema = z.object({ limit: z.number().int().positive().max(500).optional() });

function rowToRecord(row: PrinterRow): PrinterRecord {
  return {
    id: row.id,
    name: row.name,
    connection: row.connection,
    identifier: row.identifier,
    width_chars: row.width_chars,
    active: row.active === 1,
    notes: row.notes,
  };
}

export interface PrinterHandlerDeps {
  printers: PrinterRepository;
  jobs: PrintJobRepository;
  queue: PrintQueue;
  drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver>;
}

export function registerPrinterHandlers(deps: PrinterHandlerDeps): void {
  ipcMain.handle('printer:discover', async (): Promise<DiscoveredPrinter[]> => {
    return discoverAll();
  });

  ipcMain.handle(
    'printer:test-connection',
    async (_e, raw: unknown): Promise<PrinterTestResult> => {
      const input = TestConnectionSchema.parse(raw);
      const driver = deps.drivers[input.connection];
      if (!driver) {
        return { success: false, online: false, latencyMs: 0, errorMessage: `No hay driver para ${input.connection}` };
      }
      const fakeRow: PrinterRow = {
        id: '<test>',
        name: 'test',
        connection: input.connection,
        identifier: input.identifier,
        width_chars: input.width_chars,
        active: 0,
        notes: null,
      };
      const start = Date.now();
      try {
        await driver.testConnection(fakeRow);
        return { success: true, online: true, latencyMs: Date.now() - start };
      } catch (err) {
        return {
          success: false,
          online: false,
          latencyMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : 'Error desconocido',
        };
      }
    }
  );

  ipcMain.handle('printer:list', async (): Promise<PrinterRecord[]> => {
    const rows = await deps.printers.list();
    return rows.map(rowToRecord);
  });

  ipcMain.handle('printer:set-active', async (_e, raw: unknown): Promise<void> => {
    const { id } = SetActiveSchema.parse(raw);
    await deps.printers.setActive(id);
  });

  ipcMain.handle(
    'printer:get-job-status',
    async (_e, raw: unknown): Promise<JobStatusSnapshot | null> => {
      const { jobId } = JobIdSchema.parse(raw);
      return deps.queue.getJobStatus(jobId);
    }
  );

  ipcMain.handle('printer:retry-job', async (_e, raw: unknown): Promise<void> => {
    const { jobId } = JobIdSchema.parse(raw);
    await deps.queue.retry(jobId);
  });

  ipcMain.handle('printer:list-recent-jobs', async (_e, raw: unknown): Promise<RecentJobSummary[]> => {
    const { limit } = ListRecentSchema.parse(raw ?? {});
    const rows = await deps.jobs.listRecent(limit);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      lastError: r.last_error,
    }));
  });
}

export function unregisterPrinterHandlers(): void {
  ipcMain.removeHandler('printer:discover');
  ipcMain.removeHandler('printer:test-connection');
  ipcMain.removeHandler('printer:list');
  ipcMain.removeHandler('printer:set-active');
  ipcMain.removeHandler('printer:get-job-status');
  ipcMain.removeHandler('printer:retry-job');
  ipcMain.removeHandler('printer:list-recent-jobs');
}
