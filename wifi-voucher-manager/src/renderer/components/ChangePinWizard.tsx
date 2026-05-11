import { useState, type FC } from 'react';

import { PinInput } from './PinInput.js';

type Step = 'welcome' | 'new-pin' | 'confirm-pin';

interface ChangePinWizardProps {
  onComplete: (pin: string) => void;
  onCancel: () => void;
}

const RULE_HINTS: Array<{ test: (pin: string) => boolean; label: string }> = [
  { test: (p) => p.length === 4, label: 'Tiene exactamente 4 dígitos' },
  { test: (p) => /^[0-9]{4}$/.test(p), label: 'Solo dígitos' },
  { test: (p) => p !== '0000', label: 'No es 0000' },
  { test: (p) => p.length === 4 && new Set(p.split('')).size > 1, label: 'No todos iguales' },
  {
    test: (p) =>
      !(
        p.length === 4 &&
        Number(p[1]) === Number(p[0]) + 1 &&
        Number(p[2]) === Number(p[1]) + 1 &&
        Number(p[3]) === Number(p[2]) + 1
      ),
    label: 'No es secuencia ascendente',
  },
  {
    test: (p) =>
      !(
        p.length === 4 &&
        Number(p[1]) === Number(p[0]) - 1 &&
        Number(p[2]) === Number(p[1]) - 1 &&
        Number(p[3]) === Number(p[2]) - 1
      ),
    label: 'No es secuencia descendente',
  },
];

function firstError(pin: string): string | null {
  if (!pin) return null;
  if (pin.length !== 4) return null;
  if (!/^[0-9]{4}$/.test(pin)) return 'El PIN solo puede contener números.';
  if (pin === '0000') return 'No puedes usar 0000 como PIN.';
  if (new Set(pin.split('')).size === 1) return 'El PIN no puede tener todos los dígitos iguales.';
  if (
    Number(pin[1]) === Number(pin[0]) + 1 &&
    Number(pin[2]) === Number(pin[1]) + 1 &&
    Number(pin[3]) === Number(pin[2]) + 1
  )
    return 'El PIN no puede ser una secuencia ascendente.';
  if (
    Number(pin[1]) === Number(pin[0]) - 1 &&
    Number(pin[2]) === Number(pin[1]) - 1 &&
    Number(pin[3]) === Number(pin[2]) - 1
  )
    return 'El PIN no puede ser una secuencia descendente.';
  return null;
}

export const ChangePinWizard: FC<ChangePinWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const newPinError = firstError(newPin);
  const newPinValid = newPin.length === 4 && newPinError === null;
  const confirmError =
    confirmPin.length === 4 && confirmPin !== newPin ? 'La confirmación no coincide.' : null;

  return (
    <div className="rounded-lg bg-surface p-8 shadow-card w-[420px] flex flex-col gap-5">
      {step === 'welcome' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Tienes que cambiar tu PIN</h2>
          <p className="text-sm text-textSecondary">
            Por seguridad debes reemplazar el PIN de fábrica (0000) antes de continuar.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Más tarde
            </button>
            <button
              type="button"
              onClick={() => setStep('new-pin')}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
            >
              Comenzar
            </button>
          </div>
        </>
      )}

      {step === 'new-pin' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Elige tu nuevo PIN</h2>
          <PinInput value={newPin} onChange={setNewPin} autoFocus />

          {newPinError ? (
            <p className="text-sm text-error" role="alert">
              {newPinError}
            </p>
          ) : null}

          <ul className="space-y-1 text-sm text-textSecondary">
            {RULE_HINTS.map((r) => (
              <li
                key={r.label}
                className={r.test(newPin) ? 'text-success' : 'text-textSecondary'}
              >
                {r.test(newPin) ? '✓' : '·'} {r.label}
              </li>
            ))}
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('welcome')}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={!newPinValid}
              onClick={() => setStep('confirm-pin')}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </>
      )}

      {step === 'confirm-pin' && (
        <>
          <h2 className="text-xl font-semibold text-textPrimary">Confirma tu PIN</h2>
          <PinInput value={confirmPin} onChange={setConfirmPin} autoFocus />
          {confirmError ? (
            <p className="text-sm text-error" role="alert">
              {confirmError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('new-pin')}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={confirmPin !== newPin}
              onClick={() => onComplete(newPin)}
              className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </>
      )}
    </div>
  );
};
