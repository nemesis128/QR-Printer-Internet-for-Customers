import { useState, type FC, type ReactNode } from 'react';

import { Spinner } from './Spinner.js';

export interface PrintButtonProps {
  onClick: () => Promise<void>;
  disabled?: boolean;
  size?: 'lg' | 'md';
  children: ReactNode;
}

export const PrintButton: FC<PrintButtonProps> = ({ onClick, disabled, size = 'lg', children }) => {
  const [busy, setBusy] = useState(false);
  const dimensions =
    size === 'lg' ? 'min-w-[240px] h-20 text-lg' : 'min-w-[160px] h-12 text-base';

  const handle = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await onClick();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handle();
      }}
      disabled={disabled || busy}
      className={`${dimensions} rounded-md bg-accent px-6 font-medium text-accentForeground transition-colors duration-default ease-out hover:bg-accentHover disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center`}
    >
      {busy ? <Spinner label="Procesando" /> : children}
    </button>
  );
};
