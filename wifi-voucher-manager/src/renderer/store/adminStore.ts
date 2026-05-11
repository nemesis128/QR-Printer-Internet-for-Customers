import { create } from 'zustand';

export type AdminPanelKey =
  | 'home'
  | 'printer'
  | 'router'
  | 'schedule'
  | 'business'
  | 'stats'
  | 'logs';

export interface AdminState {
  sessionToken: string | null;
  pinIsDefault: boolean;
  locked: boolean;
  remainingMs: number;
  error: string | null;
  currentPanel: AdminPanelKey;
  attemptLogin: (pin: string) => Promise<void>;
  logout: () => void;
  setPanel: (p: AdminPanelKey) => void;
  setPinIsDefault: (v: boolean) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  sessionToken: null,
  pinIsDefault: false,
  locked: false,
  remainingMs: 0,
  error: null,
  currentPanel: 'home',
  attemptLogin: async (pin: string) => {
    set({ error: null });
    const r = await window.api.admin.validatePin({ pin });
    if (r.ok) {
      set({
        sessionToken: r.sessionToken,
        pinIsDefault: r.pinIsDefault,
        locked: false,
        remainingMs: 0,
        error: null,
      });
      return;
    }
    if (r.code === 'LOCKED') {
      set({
        locked: true,
        remainingMs: r.remainingMs ?? 0,
        error: 'Cuenta bloqueada por intentos fallidos.',
      });
      return;
    }
    set({ error: 'PIN incorrecto.' });
  },
  logout: () => set({ sessionToken: null, currentPanel: 'home', error: null }),
  setPanel: (currentPanel) => set({ currentPanel }),
  setPinIsDefault: (v) => set({ pinIsDefault: v }),
}));
