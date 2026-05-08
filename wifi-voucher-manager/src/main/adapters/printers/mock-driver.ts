import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

export type MockMode = 'success' | 'always-fail' | 'fail-after-n';

export interface MockOptions {
  mode: MockMode;
  failAfterN?: number;
  latencyMs?: number;
}

export class MockPrinterDriver implements PrinterDriver {
  readonly lastWrites: Uint8Array[] = [];
  private writeCount = 0;

  constructor(private readonly opts: MockOptions) {}

  private async sleep(): Promise<void> {
    const ms = this.opts.latencyMs ?? 0;
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private maybeFail(): void {
    if (this.opts.mode === 'always-fail') {
      throw new Error('MockPrinterDriver always-fail mode');
    }
    if (this.opts.mode === 'fail-after-n') {
      const n = this.opts.failAfterN ?? 0;
      if (this.writeCount > n) {
        throw new Error(`MockPrinterDriver fail-after-n: count=${this.writeCount} > N=${n}`);
      }
    }
  }

  async write(_printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    await this.sleep();
    this.writeCount++;
    this.maybeFail();
    this.lastWrites.push(new Uint8Array(bytes));
  }

  async testConnection(_printer: PrinterRow): Promise<void> {
    await this.sleep();
    this.maybeFail();
  }
}
