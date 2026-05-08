import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

/**
 * Cada driver implementa write() y testConnection().
 *
 * - write(): envía bytes al hardware. Resuelve void si OK; rechaza con
 *   Error legible si falló.
 * - testConnection(): valida que la impresora responde sin imprimir
 *   contenido visible. Máximo enviar INIT (ESC @).
 *
 * Cada invocación abre y cierra la conexión por sí misma. Sin pool
 * persistente — la próxima impresión re-conecta. Costo: +1-2s en la
 * primera impresión post-desconexión, pero más resiliente.
 */
export interface PrinterDriver {
  write(printer: PrinterRow, bytes: Uint8Array): Promise<void>;
  testConnection(printer: PrinterRow): Promise<void>;
}
