import { Settings } from 'lucide-react';
import type { FC } from 'react';

export interface SettingsGearButtonProps {
  onClick: () => void;
  className?: string;
}

export const SettingsGearButton: FC<SettingsGearButtonProps> = ({ onClick, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir configuración de administrador"
      className={`fixed bottom-6 right-6 inline-flex h-8 w-8 items-center justify-center rounded-md text-textMuted transition-colors duration-default ease-out hover:text-textSecondary ${className}`}
    >
      <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
};
