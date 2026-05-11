import { useEffect, useState, type FC } from 'react';

import type { DiscoveredPrinter, PrinterTestResult } from '../../shared/types.js';

interface DiscoveryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (p: DiscoveredPrinter) => void;
}

const BADGE_LABEL: Record<DiscoveredPrinter['connection'], string> = {
  usb: 'USB',
  bluetooth: 'BT',
  'bluetooth-ble': 'BLE',
};

export const DiscoveryModal: FC<DiscoveryModalProps> = ({ open, onClose, onSelect }) => {
  const [items, setItems] = useState<DiscoveredPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DiscoveredPrinter | null>(null);
  const [test, setTest] = useState<PrinterTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setItems([]);
    setSelected(null);
    setTest(null);
    void window.api.printer
      .discover()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!selected) return;
    setTesting(true);
    setTest(null);
    void window.api.printer
      .testConnection({
        connection: selected.connection,
        identifier: selected.identifier,
        width_chars: 32,
      })
      .then(setTest)
      .finally(() => setTesting(false));
  }, [selected]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-center justify-center bg-textPrimary/55"
      onClick={onClose}
    >
      <div
        className="flex h-[520px] w-[640px] flex-col gap-4 rounded-lg bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-textPrimary">Detectar impresoras</h2>
        {loading ? (
          <p className="text-sm text-textSecondary">Buscando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-textSecondary">No se encontraron impresoras.</p>
        ) : (
          <ul className="flex-1 space-y-2 overflow-auto">
            {items.map((p) => (
              <li key={p.identifier}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left text-sm ${
                    selected?.identifier === p.identifier
                      ? 'border-accent bg-surfaceMuted'
                      : 'border-border bg-surface hover:bg-surfaceMuted'
                  }`}
                >
                  <span className="rounded-sm bg-textPrimary px-2 py-0.5 font-mono text-xs text-accentForeground">
                    {BADGE_LABEL[p.connection]}
                  </span>
                  <span className="flex-1 text-textPrimary">{p.label}</span>
                  <span className="font-mono text-xs text-textSecondary">{p.identifier}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <div className="rounded-md border border-border bg-surfaceMuted p-3 text-sm text-textSecondary">
            {testing
              ? 'Probando conexión…'
              : test?.success
                ? `Conectado en ${test.latencyMs} ms.`
                : test
                  ? `Falló: ${test.errorMessage ?? 'sin detalle'}`
                  : 'Selecciona una impresora.'}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-textPrimary hover:bg-surfaceMuted"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selected || !test?.success}
            onClick={() => selected && onSelect(selected)}
            className="rounded-md bg-accent px-4 py-2 text-sm text-accentForeground hover:bg-accentHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Usar esta impresora
          </button>
        </div>
      </div>
    </div>
  );
};
