/**
 * Constantes de bytes ESC/POS estándar.
 *
 * Notas críticas:
 * - CUT_FULL usa 'GS V B 0' (1D 56 42 00) en vez del más común 'GS V 0' (1D 56 00)
 *   porque algunas impresoras térmicas chinas (incluida Aomus My A1) ignoran
 *   la variante corta. La variante con función B + cantidad de líneas es
 *   universalmente soportada.
 * - GS_v_0 (raster bit image, minúscula) es DIFERENTE de GS_V (cut, mayúscula).
 *   El raster está documentado en el datasheet original de Epson y es
 *   ampliamente soportado por clones POS-80.
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

// Inicialización
export const INIT = new Uint8Array([ESC, 0x40]); // ESC @

// Codepage (CP858 = Latin1 con € — bueno para mensajes en español)
export const CODEPAGE_CP858 = new Uint8Array([ESC, 0x74, 19]); // ESC t 19

// Alineación
export const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0]);
export const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 1]);
export const ALIGN_RIGHT = new Uint8Array([ESC, 0x61, 2]);

// Tamaño de texto
// GS ! n: bits 4-6 ancho, 0-2 alto. n=0 normal, n=0x11 doble alto+ancho
export const SIZE_NORMAL = new Uint8Array([GS, 0x21, 0x00]);
export const SIZE_DOUBLE = new Uint8Array([GS, 0x21, 0x11]);

// Bold
export const BOLD_ON = new Uint8Array([ESC, 0x45, 1]);
export const BOLD_OFF = new Uint8Array([ESC, 0x45, 0]);

// Underline
export const UNDERLINE_ON = new Uint8Array([ESC, 0x2d, 1]);
export const UNDERLINE_OFF = new Uint8Array([ESC, 0x2d, 0]);

// Feed
export function feedLines(n: number): Uint8Array {
  return new Uint8Array([ESC, 0x64, Math.min(255, Math.max(0, n))]);
}

// Cut full (Aomus-compatible variant)
// 'GS V B 0' = 1D 56 42 00
export const CUT_FULL = new Uint8Array([GS, 0x56, 0x42, 0x00]);

// Cut partial
export const CUT_PARTIAL = new Uint8Array([GS, 0x56, 0x42, 0x01]);

// Raster bit image header builder.
// 'GS v 0 m xL xH yL yH'
// m=0: normal density. xL/xH = bytes-per-row. yL/yH = total rows.
export function rasterHeader(bytesPerRow: number, rows: number): Uint8Array {
  return new Uint8Array([
    GS,
    0x76, // 'v'
    0x30, // '0'
    0x00, // m=0 normal
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    rows & 0xff,
    (rows >> 8) & 0xff,
  ]);
}
