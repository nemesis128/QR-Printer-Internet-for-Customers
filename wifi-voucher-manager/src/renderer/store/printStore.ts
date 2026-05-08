import { create } from 'zustand';

export type PrintStatus = 'idle' | 'previewing' | 'preview-shown' | 'preview-failed';

export interface PrintState {
  status: PrintStatus;
  lastError: string | null;
  lastDataUrl: string | null;
  lastSsid: string | null;
  lastPassword: string | null;
  startPreview: () => Promise<void>;
  closePreview: () => void;
  clear: () => void;
}

export const usePrintStore = create<PrintState>((set) => ({
  status: 'idle',
  lastError: null,
  lastDataUrl: null,
  lastSsid: null,
  lastPassword: null,
  startPreview: async () => {
    set({ status: 'previewing', lastError: null });
    try {
      const result = await window.api.waiter.printVoucher();
      if (result.ok) {
        set({
          status: 'preview-shown',
          lastDataUrl: result.dataUrl,
          lastSsid: result.ssid,
          lastPassword: result.password,
          lastError: null,
        });
      } else {
        set({
          status: 'preview-failed',
          lastError: result.message,
        });
      }
    } catch (err) {
      set({
        status: 'preview-failed',
        lastError: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  },
  closePreview: () => {
    set({ status: 'idle' });
  },
  clear: () => {
    set({
      status: 'idle',
      lastError: null,
      lastDataUrl: null,
      lastSsid: null,
      lastPassword: null,
    });
  },
}));
