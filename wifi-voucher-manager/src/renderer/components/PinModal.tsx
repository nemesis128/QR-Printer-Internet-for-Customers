import { useEffect, useState, type FC } from 'react';

import { PinInput } from './PinInput.js';

interface PinModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => void;
  error: string | null;
  locked: boolean;
  remainingMs: number;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const PinModal: FC<PinModalProps> = ({ open, onClose, onSubmit, error, locked, remainingMs }) => {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [tickMs, setTickMs] = useState(remainingMs);

  useEffect(() => {
    setTickMs(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => {
      setTickMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  useEffect(() => {
    if (!error) return;
    setShake(true);
    const id = setTimeout(() => setShake(false), 250);
    return () => clearTimeout(id);
  }, [error]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
      onClick={onClose}
    >
      <div
        className="rounded-lg bg-surface p-8 shadow-card w-[360px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-textPrimary">PIN de Administración</h2>

        <PinInput value={pin} onChange={setPin} shake={shake} disabled={locked} autoFocus />

        {error ? (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}

        {locked ? (
          <p className="text-sm text-textSecondary">
            Bloqueado por intentos fallidos. Reintenta en{' '}
            <span className="font-mono text-textPrimary">{formatRemaining(tickMs)}</span>
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pin.length !== 4 || locked}
            onClick={() => onSubmit(pin)}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
};
