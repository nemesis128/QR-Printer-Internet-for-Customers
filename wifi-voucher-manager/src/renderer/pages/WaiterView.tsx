import { useState, type FC } from 'react';

import { Banner } from '../components/Banner.js';
import { HealthIndicator, type HealthStatus } from '../components/HealthIndicator.js';
import { PrintButton } from '../components/PrintButton.js';
import { SettingsGearButton } from '../components/SettingsGearButton.js';
import { useSystemHealth } from '../hooks/useSystemHealth.js';
import { usePrintStore } from '../store/printStore.js';

function deriveHealth(loading: boolean, error: string | null, passwordValid: boolean | undefined): {
  status: HealthStatus;
  label: string;
} {
  if (loading) return { status: 'idle', label: 'Cargando estado del sistema…' };
  if (error) return { status: 'error', label: `Error: ${error}` };
  if (!passwordValid) return { status: 'error', label: 'Sin contraseña configurada' };
  return { status: 'success', label: 'Sistema listo' };
}

export const WaiterView: FC = () => {
  const { health, isLoading, error, refetch } = useSystemHealth();
  const { status, lastDataUrl, lastSsid, lastPassword, lastError, startPreview, closePreview } =
    usePrintStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const ssid = health
    ? health.passwordValid
      ? lastSsid ?? '—'
      : '—'
    : '—';

  const derivedHealth = deriveHealth(isLoading, error, health?.passwordValid);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      {status === 'preview-failed' && lastError ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2">
          <Banner variant="error" message={lastError} />
        </div>
      ) : null}

      <p className="font-mono text-sm text-textSecondary">Red: {ssid}</p>

      <PrintButton
        onClick={async () => {
          await startPreview();
          await refetch();
        }}
        disabled={!health?.passwordValid}
      >
        Imprimir QR de WiFi
      </PrintButton>

      <HealthIndicator status={derivedHealth.status} label={derivedHealth.label} />

      <SettingsGearButton onClick={() => setPinModalOpen(true)} />

      {pinModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
          onClick={() => setPinModalOpen(false)}
        >
          <div className="rounded-lg bg-surface p-8 shadow-card">
            <p className="text-base text-textPrimary">PIN admin — disponible en Fase 3.</p>
          </div>
        </div>
      ) : null}

      {status === 'preview-shown' && lastDataUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del QR"
          className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
          onClick={closePreview}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-lg bg-surface p-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-textPrimary">Vista previa</h2>
            <img src={lastDataUrl} alt="QR de WiFi" className="h-72 w-72" />
            {lastPassword ? (
              <p className="font-mono text-base text-textSecondary">
                Contraseña: <span className="text-textPrimary">{lastPassword}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={closePreview}
              className="rounded-md border border-border px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
