import axios, { AxiosError, type AxiosInstance } from 'axios';

import {
  type IRouterAdapter,
  type RouterCredentials,
  type RouterLoginResult,
  type RouterPingResult,
  RouterAuthError,
  RouterTimeoutError,
  UnsupportedVariantError,
} from './router-types.js';
import { sanitizeForLog } from './sanitize-logs.js';

const TIMEOUTS = {
  reach: 5_000,
  login: 10_000,
  update: 5_000,
};

const VARIANT_PATTERNS: Array<{ regex: RegExp; variant: string }> = [
  { regex: /TP-LINK\s+Archer\s+C24\s+V1\.2/i, variant: 'archer-c24-v1.2' },
];

export class TPLinkArcherAdapter implements IRouterAdapter {
  private client: AxiosInstance | null = null;
  private variant: string | null = null;
  private cookie: string | null = null;
  private sessionKey: string | null = null;
  private _credentials: RouterCredentials | null = null;

  async ping(host: string): Promise<RouterPingResult> {
    const start = Date.now();
    try {
      await axios.head(`http://${host}`, { timeout: TIMEOUTS.reach });
      return { reachable: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        errorMessage: err instanceof AxiosError ? (err.code ?? err.message) : 'Error desconocido',
      };
    }
  }

  async login(credentials: RouterCredentials): Promise<RouterLoginResult> {
    this._credentials = credentials;
    this.client = axios.create({
      baseURL: `http://${credentials.host}`,
      timeout: TIMEOUTS.login,
      validateStatus: () => true,
    });

    const indexResp = await this.client.get('/');
    if (indexResp.status >= 500) {
      return { success: false, errorMessage: `Router devolvió HTTP ${indexResp.status}` };
    }

    const html = typeof indexResp.data === 'string' ? indexResp.data : String(indexResp.data);
    const detected = this.detectVariant(html);
    if (!detected) {
      const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1] ?? 'desconocido';
      throw new UnsupportedVariantError(title);
    }
    this.variant = detected;

    const loginResp = await this.client.post(
      '/cgi-bin/luci',
      new URLSearchParams({ username: credentials.user, password: credentials.password }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (loginResp.status !== 200) {
      return { success: false, errorMessage: `HTTP ${loginResp.status}` };
    }
    const body = loginResp.data as { stat?: string; sessionKey?: string; error?: string };
    if (body.stat !== 'ok' || !body.sessionKey) {
      throw new RouterAuthError(body.error ?? 'Login rechazado por el router');
    }
    const setCookie = loginResp.headers['set-cookie'];
    this.cookie = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? null);
    this.sessionKey = body.sessionKey;
    return { success: true, variant: this.variant };
  }

  logout(): Promise<void> {
    this.cookie = null;
    this.sessionKey = null;
    this.client = null;
    return Promise.resolve();
  }

  async getGuestSsid(): Promise<string> {
    this.requireAuth();
    const resp = await this.client!.get(
      `/cgi-bin/luci/;stok=${this.sessionKey}/admin/wireless_2g_guest/get`,
      this.authHeaders(),
    );
    const body = resp.data as { stat?: string; data?: { ssid?: string }; error?: string };
    if (body.stat !== 'ok' || !body.data?.ssid) {
      throw new Error(body.error ?? 'Respuesta sin SSID');
    }
    return body.data.ssid;
  }

  async setGuestPassword(newPassword: string): Promise<void> {
    this.requireAuth();
    try {
      const resp = await this.client!.post(
        `/cgi-bin/luci/;stok=${this.sessionKey}/admin/wireless_2g_guest/set`,
        new URLSearchParams({ key: newPassword }).toString(),
        {
          timeout: TIMEOUTS.update,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...this.authHeaders().headers },
        },
      );
      const body = resp.data as { stat?: string; error?: string };
      if (body.stat !== 'ok') {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
    } catch (err) {
      if (err instanceof AxiosError && err.code === 'ECONNABORTED') {
        throw new RouterTimeoutError('set-password', TIMEOUTS.update);
      }
      throw err;
    }
  }

  async setGuestEnabled(enabled: boolean): Promise<void> {
    this.requireAuth();
    await this.client!.post(
      `/cgi-bin/luci/;stok=${this.sessionKey}/admin/wireless_2g_guest/set`,
      new URLSearchParams({ enabled: enabled ? '1' : '0' }).toString(),
      {
        timeout: TIMEOUTS.update,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...this.authHeaders().headers },
      },
    );
  }

  async dispose(): Promise<void> {
    await this.logout();
  }

  private detectVariant(html: string): string | null {
    for (const { regex, variant } of VARIANT_PATTERNS) {
      if (regex.test(html)) return variant;
    }
    return null;
  }

  private requireAuth(): void {
    // _credentials retained for re-login in Task 9
    void this._credentials;
    if (!this.client || !this.sessionKey) {
      throw new RouterAuthError('No hay sesión activa — llama a login() primero');
    }
  }

  private authHeaders(): { headers: Record<string, string> } {
    return this.cookie ? { headers: { Cookie: this.cookie } } : { headers: {} };
  }

  static safeBodyFor(body: string): string {
    return sanitizeForLog(body);
  }
}
