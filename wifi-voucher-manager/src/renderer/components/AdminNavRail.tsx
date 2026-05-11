import { type FC } from 'react';

import { useAdminStore, type AdminPanelKey } from '../store/adminStore.js';

const ITEMS: Array<{ key: AdminPanelKey; label: string }> = [
  { key: 'home', label: 'Inicio' },
  { key: 'printer', label: 'Impresora' },
  { key: 'router', label: 'Router' },
  { key: 'schedule', label: 'Programación' },
  { key: 'business', label: 'Negocio' },
  { key: 'stats', label: 'Estadísticas' },
  { key: 'logs', label: 'Logs' },
];

interface AdminNavRailProps {
  onLogout: () => void;
}

export const AdminNavRail: FC<AdminNavRailProps> = ({ onLogout }) => {
  const current = useAdminStore((s) => s.currentPanel);
  const setPanel = useAdminStore((s) => s.setPanel);

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-border bg-surface p-4">
      <h1 className="mb-6 px-2 text-base font-semibold text-textPrimary">Administración</h1>
      <nav className="flex-1 space-y-1">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPanel(item.key)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
              current === item.key
                ? 'bg-surfaceMuted text-textPrimary'
                : 'text-textSecondary hover:bg-surfaceMuted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-textSecondary hover:bg-surfaceMuted"
      >
        Cerrar sesión
      </button>
    </aside>
  );
};
