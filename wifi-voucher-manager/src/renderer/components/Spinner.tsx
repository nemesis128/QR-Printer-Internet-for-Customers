import type { FC } from 'react';

export interface SpinnerProps {
  label?: string;
  className?: string;
}

export const Spinner: FC<SpinnerProps> = ({ label = 'Cargando', className = '' }) => {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-spinner-dot
          className="h-1.5 w-1.5 rounded-full bg-textMuted animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
};
