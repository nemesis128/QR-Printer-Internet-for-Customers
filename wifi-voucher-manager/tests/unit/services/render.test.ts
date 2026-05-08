import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { renderPrintBytes } from '../../../src/main/services/render.js';

describe('render dispatcher', () => {
  it('despacha use_case=voucher correctamente', async () => {
    const qrPng = await QRCode.toBuffer('WIFI:T:WPA;S:T;P:p;;', {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 192,
      margin: 0,
    });
    const bytes = renderPrintBytes(
      'voucher',
      {
        business_name: 'X',
        ssid: 'Y',
        qrPng,
        footer_message: 'z',
        triggered_at: '2026-05-08T12:00:00.000Z',
      },
      32
    );
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('lanza Error con use_case desconocido', async () => {
    const qrPng = await QRCode.toBuffer('x', { type: 'png', width: 64, margin: 0 });
    expect(() =>
      renderPrintBytes(
        'unknown' as 'voucher',
        { business_name: 'X', ssid: 'Y', qrPng, footer_message: 'z', triggered_at: '' },
        32
      )
    ).toThrow();
  });
});
