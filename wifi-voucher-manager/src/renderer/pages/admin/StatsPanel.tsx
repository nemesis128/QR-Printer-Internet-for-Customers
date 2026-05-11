import { useEffect, useState, type FC } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { StatsBundleDTO } from '../../../shared/types.js';
import { useAdminStore } from '../../store/adminStore.js';

export const StatsPanel: FC = () => {
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [bundle, setBundle] = useState<StatsBundleDTO | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    void window.api.admin.getStats({ sessionToken }).then(setBundle);
  }, [sessionToken]);

  if (!bundle) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Estadísticas</h1>

      <section className="grid grid-cols-3 gap-4">
        <Card label="Impresiones totales" value={bundle.summary.totalPrints} />
        <Card label="Exitosas" value={bundle.summary.successfulPrints} accent="success" />
        <Card label="Fallidas" value={bundle.summary.failedPrints} accent="error" />
        <Card label="Rotaciones totales" value={bundle.summary.totalRotations} />
        <Card label="Rotaciones OK" value={bundle.summary.successfulRotations} accent="success" />
      </section>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Impresiones diarias (14 días)</h2>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={bundle.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#18181B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

const Card: FC<{ label: string; value: number; accent?: 'success' | 'error' }> = ({
  label,
  value,
  accent,
}) => (
  <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
    <p className="text-xs uppercase tracking-wide text-textSecondary">{label}</p>
    <p
      className={`mt-1 font-mono text-2xl ${
        accent === 'success' ? 'text-success' : accent === 'error' ? 'text-error' : 'text-textPrimary'
      }`}
    >
      {value}
    </p>
  </div>
);
