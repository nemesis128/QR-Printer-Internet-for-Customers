// src/renderer/pages/admin/BusinessPanel.tsx
import { useEffect, useState, type DragEvent, type FC } from 'react';

import { useAdminConfig } from '../../hooks/useAdminConfig.js';
import { useAdminStore } from '../../store/adminStore.js';

export const BusinessPanel: FC = () => {
  const { config, reload } = useAdminConfig();
  const sessionToken = useAdminStore((s) => s.sessionToken);
  const [name, setName] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [logoFeedback, setLogoFeedback] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const handleFile = async (file: File): Promise<void> => {
    if (!sessionToken) return;
    setLogoFeedback(null);
    const sourcePath = (file as File & { path?: string }).path;
    if (!sourcePath) {
      setLogoFeedback('No se pudo leer la ruta del archivo. Arrástralo desde el explorador.');
      return;
    }
    const r = await window.api.admin.uploadLogo({ sessionToken, sourcePath });
    setLogoFeedback(r.ok ? 'Logo cargado.' : (r.message ?? 'Error subiendo logo'));
    await reload();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const removeLogo = async (): Promise<void> => {
    if (!sessionToken) return;
    const r = await window.api.admin.updateConfig({
      sessionToken,
      section: 'business',
      value: { name, footerMessage, logoPath: null },
    });
    setLogoFeedback(r.ok ? 'Logo removido.' : `Error: ${r.code}`);
    await reload();
  };

  if (!config) return <p className="text-sm text-textSecondary">Cargando…</p>;

  const hasLogo = config.business.logoPath !== null;

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
        <button
          type="button"
          onClick={() => void save()}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
        >
          Guardar
        </button>
        {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-medium text-textPrimary">Logo del voucher</h2>
        {hasLogo ? (
          <div className="flex items-center gap-3">
            <p className="font-mono text-xs text-textSecondary">{config.business.logoPath}</p>
            <button
              type="button"
              onClick={() => void removeLogo()}
              className="rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Quitar logo
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 ${
              dragOver ? 'border-accent bg-surfaceMuted' : 'border-border bg-surface'
            }`}
          >
            <p className="mb-2 text-sm text-textSecondary">Arrastra un PNG/JPG aquí</p>
            <label className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted">
              o selecciona un archivo
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
                className="hidden"
              />
            </label>
          </div>
        )}
        {logoFeedback ? <p className="text-sm text-textSecondary">{logoFeedback}</p> : null}
      </section>
    </div>
  );
};
