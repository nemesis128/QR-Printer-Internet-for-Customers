import { type FC } from 'react';

export const RouterPanel: FC = () => {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Router</h1>
      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <p className="text-sm text-textSecondary">
          La integración con TP-Link Archer se completa en Fase 4 (bloqueada por compra del hardware).
          Por ahora la rotación se registra en el log pero no se aplica al router real.
        </p>
      </section>
    </div>
  );
};
