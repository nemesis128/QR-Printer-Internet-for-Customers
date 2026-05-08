import type { FC, ReactNode } from 'react';

export type BannerVariant = 'error' | 'warning' | 'success' | 'info';

export interface BannerProps {
  variant: BannerVariant;
  message: string;
  children?: ReactNode;
  className?: string;
}

const VARIANT_BORDER: Record<BannerVariant, string> = {
  error: 'border-l-error',
  warning: 'border-l-warning',
  success: 'border-l-success',
  info: 'border-l-info',
};

export const Banner: FC<BannerProps> = ({ variant, message, children, className = '' }) => {
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 border-l-[3px] ${VARIANT_BORDER[variant]} bg-surface px-4 py-3 ${className}`}
    >
      <p className="flex-1 text-sm text-textPrimary">{message}</p>
      {children ? <div className="flex-shrink-0">{children}</div> : null}
    </div>
  );
};
