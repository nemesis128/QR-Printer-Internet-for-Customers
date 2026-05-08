import { Buffer } from 'node:buffer';

import { EscPosBuilder } from '../escpos/builder.js';

export interface VoucherPayload {
  business_name: string;
  ssid: string;
  qrPng: Buffer | string; // Buffer en uso directo, string base64 cuando viene de JSON
  footer_message: string;
  triggered_at: string;
  is_test?: boolean;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function renderVoucher(payload: VoucherPayload, widthChars: 32 | 48): Uint8Array {
  const builder = new EscPosBuilder()
    .init()
    .codepage()
    .alignCenter();

  if (payload.is_test === true) {
    builder.bold(true).text('*** PRUEBA ***').bold(false).newline().feed(1);
  }

  builder
    .sizeDouble()
    .bold(true)
    .text(payload.business_name)
    .bold(false)
    .sizeNormal()
    .newline()
    .feed(1)
    .text('WiFi GRATIS para clientes')
    .newline()
    .feed(1)
    .text(`Red: ${payload.ssid}`)
    .newline()
    .feed(1)
    .image(typeof payload.qrPng === 'string' ? Buffer.from(payload.qrPng, 'base64') : payload.qrPng)
    .newline()
    .text('Escanea con tu camara')
    .newline()
    .text('y conectate automaticamente')
    .newline()
    .feed(1)
    .text(payload.footer_message)
    .newline()
    .text(formatTimestamp(payload.triggered_at))
    .newline()
    .feed(3)
    .cut();

  // widthChars currently does not affect layout for the voucher template
  // (the QR is fixed-width and the surrounding text auto-wraps). Reserved
  // for future thermal-paper-width-aware rendering.
  void widthChars;

  return builder.build();
}
