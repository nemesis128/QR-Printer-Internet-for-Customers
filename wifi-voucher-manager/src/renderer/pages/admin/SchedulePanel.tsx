import { useState, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const SchedulePanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const effectiveHour = hour ?? config?.schedule.hour ?? 23;
  const effectiveMinute = minute ?? config?.schedule.minute ?? 0;

  const save = async (): Promise<void> => {
    if (!sessionToken || !config) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'schedule',
      value: {
        hour: effectiveHour,
        minute: effectiveMinute,
        timezone: config.schedule.timezone,
      },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Programación</h1>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <p className="text-sm text-textSecondary">
          Hora diaria de rotación de la contraseña (zona horaria {config.schedule.timezone}).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={23}
            value={effectiveHour}
            onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
            className="h-10 w-20 rounded-md border border-border bg-surface text-center font-mono text-textPrimary"
          />
          <span className="font-mono text-textPrimary">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={effectiveMinute}
            onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
            className="h-10 w-20 rounded-md border border-border bg-surface text-center font-mono text-textPrimary"
          />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
        >
          Guardar
        </button>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>
    </div>
  );
};
