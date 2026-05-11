import { useEffect, useState, type FC } from 'react';

import type { DiscoveredPrinter, PrinterRecord } from '../../../shared/types.js';
import { DiscoveryModal } from '../../components/DiscoveryModal.js';

export const PrinterPanel: FC = () => {
  const [records, setRecords] = useState<PrinterRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    setRecords(await window.api.printer.list());
  };

  useEffect(() => {
    void reload();
  }, []);

  const active = records.find((r) => r.active) ?? null;

  const handleSelected = async (p: DiscoveredPrinter): Promise<void> => {
    setOpen(false);
    const match = records.find((r) => r.identifier === p.identifier);
    if (match) {
      await window.api.printer.setActive(match.id);
      await reload();
      setFeedback(`Activada ${match.name}.`);
    } else {
      setFeedback('Esta impresora aún no está registrada. La creación se completa en Fase 6.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-textPrimary">Impresora</h1>

      <section className="rounded-lg border border-border bg-surface p-6 shadow-card">
        <h2 className="mb-3 text-lg font-medium text-textPrimary">Impresora activa</h2>
        {active ? (
          <div className="space-y-1 text-sm text-textSecondary">
            <p>
              <span className="text-textPrimary">{active.name}</span>{' '}
              <span className="ml-2 rounded-sm bg-surfaceMuted px-2 py-0.5 font-mono text-xs">
                {active.connection}
              </span>
            </p>
            <p className="font-mono text-xs">{active.identifier}</p>
          </div>
        ) : (
          <p className="text-sm text-textSecondary">No hay impresora activa.</p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover"
      >
        Detectar impresoras
      </button>

      {feedback ? <p className="text-sm text-textSecondary">{feedback}</p> : null}

      <DiscoveryModal open={open} onClose={() => setOpen(false)} onSelect={(p) => void handleSelected(p)} />
    </div>
  );
};
