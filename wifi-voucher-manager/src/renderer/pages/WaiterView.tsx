import { useEffect, useState, type FC } from 'react';

import type { PendingManualApplyDTO } from '../../shared/types.js';
import { Banner } from '../components/Banner.js';
import { HealthIndicator, type HealthStatus } from '../components/HealthIndicator.js';
import { PrintButton } from '../components/PrintButton.js';
import { SettingsGearButton } from '../components/SettingsGearButton.js';
import { useSystemHealth } from '../hooks/useSystemHealth.js';
import { usePrintStore } from '../store/printStore.js';

interface WaiterViewProps {
  onOpenAdmin?: () => void;
}

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

export const WaiterView: FC<WaiterViewProps> = ({ onOpenAdmin }) => {
  const { health, isLoading, error, refetch } = useSystemHealth();
  const { status, lastError, startPrint, retryLastJob, clear } = usePrintStore();
  const [ssid, setSsid] = useState('—');
  const [pending, setPending] = useState<PendingManualApplyDTO[]>([]);

  useEffect(() => {
    void window.api.waiter.getCurrentSSID().then(setSsid).catch(() => {
      setSsid('—');
    });
  }, [health]);

  useEffect(() => {
    void window.api.waiter.listPendingManualApply().then(setPending);
  }, []);

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
      {pending.length > 0 && pending[0] ? (
        <div className="absolute left-1/2 top-32 -translate-x-1/2 w-[600px] border-l-[3px] border-error bg-surface p-4 shadow-card">
          <p className="mb-2 text-sm text-textPrimary">Aplicación manual de contraseña pendiente:</p>
          <p className="mb-3 font-mono text-2xl text-textPrimary">{pending[0].password}</p>
          <button
            type="button"
            onClick={() => onOpenAdmin?.()}
            className="rounded-md bg-accent px-3 py-1 text-sm text-accentForeground hover:bg-accentHover"
          >
            Ir a Administración para confirmar
          </button>
        </div>
      ) : null}

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

      <SettingsGearButton onClick={() => onOpenAdmin?.()} />
    </div>
  );
};
