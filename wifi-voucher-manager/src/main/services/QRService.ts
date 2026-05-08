export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface QRGenerateInput {
  ssid: string;
  password: string;
  security?: WifiSecurity;
  hidden?: boolean;
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
}
