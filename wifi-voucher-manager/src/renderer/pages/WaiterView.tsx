import { useEffect, useState, type FC } from 'react';

import { Banner } from '../components/Banner.js';
import { HealthIndicator, type HealthStatus } from '../components/HealthIndicator.js';
import { PrintButton } from '../components/PrintButton.js';
import { SettingsGearButton } from '../components/SettingsGearButton.js';
import { useSystemHealth } from '../hooks/useSystemHealth.js';
import { usePrintStore } from '../store/printStore.js';

function deriveHealth(
  loading: boolean,
  error: string | null,
  passwordValid: boolean | undefined,
  printerOnline: boolean | undefined
): { status: HealthStatus; label: string } {
  if (loading) return { status: 'idle', label: 'Cargando estado del sistema…' };
  if (error) return { status: 'error', label: `Error: ${error}` };
  if (!passwordValid) return { status: 'error', label: 'Sin contraseña configurada' };
  if (!printerOnline) return { status: 'warning', label: 'Sin impresora activa' };
  return { status: 'success', label: 'Sistema listo' };
}

export const WaiterView: FC = () => {
  const { health, isLoading, error, refetch } = useSystemHealth();
  const { status, lastError, startPrint, retryLastJob, clear } = usePrintStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [ssid, setSsid] = useState('—');

  useEffect(() => {
    void window.api.waiter.getCurrentSSID().then(setSsid).catch(() => {
      setSsid('—');
    });
  }, [health]);

  // Auto-clear printed banner después de 4s
  useEffect(() => {
    if (status === 'printed') {
      const id = setTimeout(() => clear(), 4_000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [status, clear]);

  const derivedHealth = deriveHealth(
    isLoading,
    error,
    health?.passwordValid,
    health?.printerOnline
  );

  const buttonDisabled =
    !health?.passwordValid ||
    !health?.printerOnline ||
    status === 'enqueuing' ||
    status === 'printing';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background">
      {status === 'print-failed' && lastError ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2 w-[480px]">
          <Banner variant="error" message={lastError}>
            <button
              type="button"
              onClick={() => void retryLastJob()}
              className="rounded-md border border-border bg-surface px-3 py-1 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Reintentar
            </button>
          </Banner>
        </div>
      ) : null}

      {status === 'printed' ? (
        <div className="absolute left-1/2 top-12 -translate-x-1/2">
          <Banner variant="success" message="QR impreso correctamente" />
        </div>
      ) : null}

      <p className="font-mono text-sm text-textSecondary">Red: {ssid}</p>

      <PrintButton
        onClick={async () => {
          await startPrint();
          await refetch();
        }}
        disabled={buttonDisabled}
      >
        {status === 'enqueuing'
          ? 'Encolando…'
          : status === 'printing'
            ? 'Imprimiendo…'
            : 'Imprimir QR de WiFi'}
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
    </div>
  );
};
