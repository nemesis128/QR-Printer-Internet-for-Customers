import { useId, useState, type FC } from 'react';

import type { PendingManualApplyDTO } from '../../shared/types.js';

interface ManualFallbackBannerProps {
  pending: PendingManualApplyDTO;
  sessionToken: string;
  onConfirmed: () => void;
}

export const ManualFallbackBanner: FC<ManualFallbackBannerProps> = ({ pending, sessionToken, onConfirmed }) => {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = useId();

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(pending.password);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      const r = await window.api.router.markAppliedManually({
        sessionToken, passwordId: pending.id, confirmedPassword: confirm,
      });
      if (r.ok) {
        onConfirmed();
      } else {
        setError(r.message ?? 'No coincide');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-l-[3px] border-error bg-surface p-4 shadow-card">
      <h3 className="mb-2 text-base font-medium text-textPrimary">
        Aplicación manual de contraseña pendiente
      </h3>
      <p className="mb-3 text-sm text-textSecondary">
        La rotación automática falló. Aplica esta contraseña al router manualmente:
      </p>
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-2xl text-textPrimary">{pending.password}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted"
        >
          Copiar
        </button>
      </div>
      <ol className="mb-4 ml-4 list-decimal space-y-1 text-sm text-textSecondary">
        <li>Abre la interfaz web del router (TP-Link Archer).</li>
        <li>Ve a la sección de red de invitados (Guest Network).</li>
        <li>Pega la contraseña arriba y guarda los cambios.</li>
        <li>Una vez aplicada, vuelve aquí y confírmalo abajo.</li>
      </ol>
      <div className="mb-2 flex flex-col gap-1 text-sm text-textSecondary">
        <label htmlFor={inputId}>Re-escribe la contraseña (anti-typo)</label>
        <input
          id={inputId}
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 font-mono text-textPrimary"
        />
      </div>
      {error ? <p className="mb-2 text-sm text-error" role="alert">{error}</p> : null}
      <button
        type="button"
        disabled={submitting || !confirm}
        onClick={() => void submit()}
        className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:opacity-50"
      >
        He aplicado la contraseña
      </button>
    </div>
  );
};
