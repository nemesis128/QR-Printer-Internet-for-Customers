import { create } from 'zustand';

export type PrintStatus = 'idle' | 'enqueuing' | 'printing' | 'printed' | 'print-failed';

const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 60; // 30s total

export interface PrintState {
  status: PrintStatus;
  lastError: string | null;
  lastJobId: string | null;
  startPrint: () => Promise<void>;
  retryLastJob: () => Promise<void>;
  clear: () => void;
}

async function pollUntilDone(jobId: string): Promise<{ status: 'printed' | 'failed'; lastError: string | null }> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const snapshot = await window.api.printer.getJobStatus(jobId);
    if (snapshot && snapshot.status !== 'pending') {
      return { status: snapshot.status, lastError: snapshot.lastError };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: 'failed', lastError: `Timeout esperando job ${jobId} (>${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms)` };
}

export const usePrintStore = create<PrintState>((set, get) => ({
  status: 'idle',
  lastError: null,
  lastJobId: null,
  startPrint: async () => {
    set({ status: 'enqueuing', lastError: null, lastJobId: null });
    try {
      const result = await window.api.waiter.printVoucher();
      if (!result.ok) {
        set({ status: 'print-failed', lastError: result.message });
        return;
      }
      set({ status: 'printing', lastJobId: result.jobId });
      const final = await pollUntilDone(result.jobId);
      if (final.status === 'printed') {
        set({ status: 'printed', lastError: null });
      } else {
        set({ status: 'print-failed', lastError: final.lastError ?? 'Falló sin mensaje' });
      }
    } catch (err) {
      set({
        status: 'print-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  retryLastJob: async () => {
    const { lastJobId } = get();
    if (!lastJobId) return;
    set({ status: 'printing', lastError: null });
    try {
      await window.api.printer.retryJob(lastJobId);
      const final = await pollUntilDone(lastJobId);
      if (final.status === 'printed') {
        set({ status: 'printed', lastError: null });
      } else {
        set({ status: 'print-failed', lastError: final.lastError ?? 'Falló sin mensaje' });
      }
    } catch (err) {
      set({
        status: 'print-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  clear: () => {
    set({ status: 'idle', lastError: null, lastJobId: null });
  },
}));
