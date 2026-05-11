import type {
  IRouterAdapter,
  RouterApplyResult,
  RouterCredentials,
  RouterLoginResult,
  RouterPingResult,
  RouterStep,
} from './router-types.js';

export interface MockRouterOptions {
  mode: 'success' | 'always-fail' | 'fail-on-step';
  ssidGuest: string;
  failStep?: RouterStep;
  latencyMs?: number;
}

export class MockRouterAdapter implements IRouterAdapter {
  private loggedIn = false;

  constructor(private readonly opts: MockRouterOptions) {}

  async ping(_host: string): Promise<RouterPingResult> {
    await this.delay();
    if (this.opts.mode === 'always-fail' || this.shouldFail('reach')) {
      return { reachable: false, latencyMs: this.opts.latencyMs ?? 0, errorMessage: 'mock-fail reach' };
    }
    return { reachable: true, latencyMs: this.opts.latencyMs ?? 0 };
  }

  async login(_credentials: RouterCredentials): Promise<RouterLoginResult> {
    await this.delay();
    if (this.opts.mode === 'always-fail' || this.shouldFail('login')) {
      return { success: false, errorMessage: 'mock-fail login' };
    }
    this.loggedIn = true;
    return { success: true, variant: 'mock-v1' };
  }

  async logout(): Promise<void> {
    await this.delay();
    if (this.shouldFail('logout')) throw new Error('mock-fail logout');
    this.loggedIn = false;
  }

  async getGuestSsid(): Promise<string> {
    await this.delay();
    if (!this.loggedIn) throw new Error('not logged in');
    if (this.shouldFail('read-ssid')) throw new Error('mock-fail read-ssid');
    return this.opts.ssidGuest;
  }

  async setGuestPassword(_password: string): Promise<void> {
    await this.delay();
    if (this.opts.mode === 'always-fail' || this.shouldFail('set-password')) {
      throw new Error('mock-fail set-password');
    }
  }

  async setGuestEnabled(_enabled: boolean): Promise<void> {
    await this.delay();
    if (this.shouldFail('set-enabled')) throw new Error('mock-fail set-enabled');
  }

  dispose(): Promise<void> {
    this.loggedIn = false;
    return Promise.resolve();
  }

  applyResultFor(): RouterApplyResult {
    return this.opts.mode === 'success'
      ? { ok: true, routerResponse: 'mock-ok' }
      : { ok: false, routerResponse: null, errorMessage: 'mock-fail' };
  }

  private shouldFail(step: RouterStep): boolean {
    return this.opts.mode === 'fail-on-step' && this.opts.failStep === step;
  }

  private async delay(): Promise<void> {
    if (this.opts.latencyMs && this.opts.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    }
  }
}
