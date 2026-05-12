// src/renderer/pages/admin/HomePanel.tsx
import { useEffect, useState, type FC } from 'react';

import { ManualFallbackBanner } from '../../components/ManualFallbackBanner.js';
import { useSystemHealth } from '../../hooks/useSystemHealth.js';
import { useAdminStore } from '../../store/adminStore.js';
import { useRouterStore } from '../../store/routerStore.js';

export const HomePanel: FC = () => {
  const { health, isLoading, refetch } = useSystemHealth();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const { pending, reloadPending } = useRouterStore();
  const [rotating, setRotating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (sessionToken) void reloadPending(sessionToken);
  }, [sessionToken, reloadPending]);

  const triggerRotation = async (): Promise<void> => {
    if (!sessionToken) return;
    setRotating(true);
    setFeedback(null);
    try {
      const r = await window.api.admin.rotatePasswordNow({ sessionToken });
      setFeedback(r.message ?? (r.ok ? 'Rotación ejecutada.' : 'No fue posible rotar.'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Inicio</h1>

      {pending.length > 0 && pending[0] && sessionToken ? (
        <ManualFallbackBanner
          pending={pending[0]}
          sessionToken={sessionToken}
          onConfirmed={() => void reloadPending(sessionToken)}
        />
      ) : null}

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Salud del sistema</h2>
        {isLoading ? (
          <p className="text-sm text-textSecondary">Cargando…</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 text-sm">
            <li>
              Impresora:{' '}
              <span className={health?.printerOnline ? 'text-success' : 'text-error'}>
                {health?.printerOnline ? 'Activa' : 'Sin configurar'}
              </span>
            </li>
            <li>
              Contraseña:{' '}
              <span className={health?.passwordValid ? 'text-success' : 'text-error'}>
                {health?.passwordValid ? 'Vigente' : 'Sin definir'}
              </span>
            </li>
            <li>
              Router:{' '}
              <span className={health?.routerReachable ? 'text-success' : 'text-warning'}>
                {health?.routerReachable ? 'Alcanzable' : 'No verificado'}
              </span>
            </li>
            <li>
              Auto-rotación:{' '}
              <span className={health?.schedulerRunning ? 'text-success' : 'text-warning'}>
                {health?.schedulerRunning ? 'Activa' : 'Detenida'}
              </span>
            </li>
            <li>
              Self-check diario:{' '}
              <span className={health?.lastHealthCheckFailed ? 'text-warning' : 'text-success'}>
                {health?.lastHealthCheckFailed ? 'Última falló — revisar logs' : 'OK'}
              </span>
            </li>
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-4 text-lg font-medium text-textPrimary">Acciones rápidas</h2>
        <button
          type="button"
          onClick={() => void triggerRotation()}
          disabled={rotating}
          className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:opacity-50"
        >
          {rotating ? 'Procesando…' : 'Rotar contraseña ahora'}
        </button>
        {feedback ? <p className="mt-3 text-sm text-textSecondary">{feedback}</p> : null}
      </section>
    </div>
  );
};
