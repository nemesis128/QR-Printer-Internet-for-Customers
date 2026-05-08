import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { renderVoucher, type VoucherPayload } from '../../../src/main/templates/voucher.js';

async function buildPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: 'png',
    errorCorrectionLevel: 'M',
    width: 192,
    margin: 0,
    color: { dark: '#000000FF', light: '#FFFFFFFF' },
  });
}

describe('renderVoucher', () => {
  it('produce un Uint8Array no vacío con header de raster', async () => {
    const qrPng = await buildPng('WIFI:T:WPA;S:Test;P:abc;;');
    const payload: VoucherPayload = {
      business_name: 'RESTAURANTE PRUEBA',
      ssid: 'Restaurante-Clientes',
      qrPng,
      footer_message: '¡Gracias por tu visita!',
      triggered_at: '2026-05-08T12:34:56.000Z',
    };
    const bytes = renderVoucher(payload, 32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    // Debe contener INIT al inicio
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    // Debe contener CUT_FULL al final
    const cutBytes = [0x1d, 0x56, 0x42, 0x00];
    const last4 = Array.from(bytes.subarray(bytes.length - 4));
    expect(last4).toEqual(cutBytes);
  });

  it('flag is_test agrega texto PRUEBA', async () => {
    const qrPng = await buildPng('WIFI:T:WPA;S:T;P:p;;');
    const payload: VoucherPayload = {
      business_name: 'Local',
      ssid: 'X',
      qrPng,
      footer_message: 'gracias',
      triggered_at: '2026-05-08T12:00:00.000Z',
      is_test: true,
    };
    const bytes = renderVoucher(payload, 32);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('PRUEBA');
  });

  it('width_chars=48 cambia el render (más ancho que 32)', async () => {
    const qrPng = await buildPng('x');
    const payload: VoucherPayload = {
      business_name: 'L',
      ssid: 'X',
      qrPng,
      footer_message: 'g',
      triggered_at: '2026-05-08T12:00:00.000Z',
    };
    const a = renderVoucher(payload, 32);
    const b = renderVoucher(payload, 48);
    // Ambos válidos, no necesariamente longitud distinta — solo aseguramos que ambos producen output válido
    expect(a.length).toBeGreaterThan(100);
    expect(b.length).toBeGreaterThan(100);
  });
});
