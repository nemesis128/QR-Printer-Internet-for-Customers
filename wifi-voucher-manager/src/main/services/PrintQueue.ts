import type { Knex } from 'knex';

import type { PrinterDriver } from '../adapters/printers/driver-types.js';
import type { PrintJobRepository, JobStatus } from '../db/repositories/PrintJobRepository.js';
import type { PrinterRepository } from '../db/repositories/PrinterRepository.js';

import type { PrintUseCase } from './render.js';

export interface PrintQueueDeps {
  db: Knex;
  jobs: PrintJobRepository;
  printers: PrinterRepository;
  drivers: Record<'usb' | 'bluetooth' | 'bluetooth-ble', PrinterDriver>;
  renderBytes: (useCase: PrintUseCase, payload: object, widthChars: 32 | 48) => Uint8Array;
}

export interface EnqueueInput {
  printer_id: string;
  use_case: PrintUseCase;
  payload: object;
  triggered_by: string | null;
}

export interface JobStatusSnapshot {
  status: JobStatus;
  lastError: string | null;
}

export class PrintQueue {
  private processing = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly deps: PrintQueueDeps) {}

  async enqueue(input: EnqueueInput): Promise<string> {
    const job = await this.deps.jobs.enqueue({
      printer_id: input.printer_id,
      use_case: input.use_case,
      payload_data: JSON.stringify(input.payload),
      triggered_by: input.triggered_by,
    });
    void this.processNext();
    return job.id;
  }

  async retry(jobId: string): Promise<void> {
    await this.deps.jobs.resetToPending(jobId);
    void this.processNext();
  }

  bootstrap(): void {
    void this.processNext();
  }

  async getJobStatus(jobId: string): Promise<JobStatusSnapshot | null> {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) return null;
    return { status: job.status, lastError: job.last_error };
  }

  async waitIdle(): Promise<void> {
    if (!this.processing) {
      const pending = await this.deps.jobs.listPending();
      if (pending.length === 0) return;
    }
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      // Drain todos los pending serializados
      while (true) {
        const pending = await this.deps.jobs.listPending();
        if (pending.length === 0) break;
        const job = pending[0]!;
        await this.processOne(job.id);
      }
    } finally {
      this.processing = false;
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];
      for (const r of resolvers) r();
    }
  }

  private async processOne(jobId: string): Promise<void> {
    const job = await this.deps.jobs.findById(jobId);
    if (!job) return;
    const printer = await this.deps.printers.findById(job.printer_id);
    if (!printer) {
      await this.deps.jobs.markFailed(jobId, `Printer ${job.printer_id} no existe`);
      return;
    }
    const driver = this.deps.drivers[printer.connection];
    if (!driver) {
      await this.deps.jobs.markFailed(jobId, `Sin driver para connection=${printer.connection}`);
      return;
    }
    try {
      const payload = JSON.parse(job.payload_data) as object;
      const bytes = this.deps.renderBytes(job.use_case, payload, printer.width_chars);
      await driver.write(printer, bytes);
      await this.deps.jobs.markPrinted(jobId);
    } catch (err) {
      await this.deps.jobs.markFailed(
        jobId,
        err instanceof Error ? err.message : 'Error desconocido'
      );
    }
  }
}
