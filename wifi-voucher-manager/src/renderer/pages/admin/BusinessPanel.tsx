import { useEffect, useState, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const BusinessPanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [name, setName] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setName(config.business.name);
      setFooterMessage(config.business.footerMessage);
    }
  }, [config]);

  const save = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'business',
      value: { name, footerMessage, logoPath: config?.business.logoPath ?? null },
    });
    setFeedback(r.ok ? 'Guardado.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Negocio</h1>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Nombre del negocio
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-textSecondary">
          Mensaje al pie del voucher
          <input
            type="text"
            value={footerMessage}
            onChange={(e) => setFooterMessage(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-textPrimary"
          />
        </label>
        <p className="text-xs text-textSecondary">Logo: drag-and-drop disponible en Fase 6.</p>
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
