import { useEffect, useState, type FC } from 'react';

import type { AuditLogEntryDTO } from '../../../shared/types.js';
import { useAdminStore } from '../../store/adminStore.js';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'print', label: 'Impresiones' },
  { value: 'password_rotation', label: 'Rotación' },
  { value: 'config_change', label: 'Configuración' },
  { value: 'admin_login', label: 'Login admin' },
  { value: 'error', label: 'Errores' },
];

function toCsv(rows: AuditLogEntryDTO[]): string {
  const header = 'id,event_type,created_at,payload\n';
  const escape = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  return (
    header +
    rows
      .map((r) => [r.id, r.event_type, r.created_at, escape(r.payload ?? '')].join(','))
      .join('\n')
  );
}

export const LogsPanel: FC = () => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [rows, setRows] = useState<AuditLogEntryDTO[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!sessionToken) return;
    void window.api.admin
      .listLogs({
        sessionToken,
        limit: 500,
        ...(filter ? { eventType: filter } : {}),
      })
      .then(setRows);
  }, [filter, sessionToken]);

  const exportCsv = (): void => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Logs</h1>

      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
        >
          Exportar CSV
        </button>
      </div>

      <section className="rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-textSecondary">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Payload</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-textSecondary">
                  Sin eventos.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.id}</td>
                  <td className="px-4 py-2">{r.event_type}</td>
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.created_at}</td>
                  <td className="px-4 py-2 font-mono text-xs text-textSecondary">{r.payload}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};
