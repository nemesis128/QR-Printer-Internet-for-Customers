import QRCode from 'qrcode';

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface QRGenerateInput {
  ssid: string;
  password: string;
  security?: WifiSecurity;
  hidden?: boolean;
}

export interface QRGenerateOutput {
  payload: string;
  pngBuffer: Buffer;
  dataUrl: string;
}

export class QRService {
  static escapeWifiValue(value: string): string {
    return value.replace(/[\\;,:"]/g, (m) => `\\${m}`);
  }

  static formatPayload(input: QRGenerateInput): string {
    const security: WifiSecurity = input.security ?? 'WPA';
    const ssidEscaped = QRService.escapeWifiValue(input.ssid);
    const hidden = input.hidden === true ? 'true' : 'false';

    if (security === 'nopass') {
      return `WIFI:T:nopass;S:${ssidEscaped};H:${hidden};;`;
    }

    const passwordEscaped = QRService.escapeWifiValue(input.password);
    return `WIFI:T:${security};S:${ssidEscaped};P:${passwordEscaped};H:${hidden};;`;
  }

  async generate(input: QRGenerateInput): Promise<QRGenerateOutput> {
    const payload = QRService.formatPayload(input);
    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      errorCorrectionLevel: 'M',
      width: 384,
      margin: 0,
      color: {
        dark: '#000000FF',
        light: '#FFFFFFFF',
      },
    });
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    return { payload, pngBuffer, dataUrl };
  }
}
