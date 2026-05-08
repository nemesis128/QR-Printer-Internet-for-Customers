import type { FC } from 'react';

export type HealthStatus = 'success' | 'warning' | 'error' | 'idle';

export interface HealthIndicatorProps {
  status: HealthStatus;
  label: string;
  className?: string;
}

const STATUS_TO_BG: Record<HealthStatus, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  idle: 'bg-textMuted',
};

export const HealthIndicator: FC<HealthIndicatorProps> = ({ status, label, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        data-health-dot
        className={`h-2 w-2 rounded-full ${STATUS_TO_BG[status]}`}
        aria-hidden="true"
      />
      <span className="text-sm text-textSecondary">{label}</span>
    </span>
  );
};
