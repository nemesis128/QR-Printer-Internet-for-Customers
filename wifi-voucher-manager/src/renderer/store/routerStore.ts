import { create } from 'zustand';

import type { PendingManualApplyDTO, RouterTestResultDTO } from '../../shared/types.js';

export interface RouterState {
  pending: PendingManualApplyDTO[];
  lastTestResult: RouterTestResultDTO | null;
  error: string | null;
  reloadPending: (sessionToken: string) => Promise<void>;
  runTestConnection: (sessionToken: string) => Promise<void>;
}

export const useRouterStore = create<RouterState>((set) => ({
  pending: [],
  lastTestResult: null,
  error: null,
  reloadPending: async (sessionToken: string) => {
    try {
      const list = await window.api.router.listPendingManualApply({ sessionToken });
      set({ pending: list, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Error cargando pendientes' });
    }
  },
  runTestConnection: async (sessionToken: string) => {
    try {
      const r = await window.api.router.testConnection({ sessionToken });
      set({ lastTestResult: r, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Error en prueba de conexión' });
    }
  },
}));
