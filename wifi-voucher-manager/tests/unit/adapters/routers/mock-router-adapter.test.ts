import { describe, expect, it } from 'vitest';

import { MockRouterAdapter } from '../../../../src/main/adapters/routers/mock-router-adapter.js';

const credentials = { host: '192.168.1.1', user: 'admin', password: 'x', model: 'C24' };

describe('MockRouterAdapter — success mode', () => {
  it('ping devuelve reachable=true', async () => {
    const a = new MockRouterAdapter({ mode: 'success', ssidGuest: 'TestGuest' });
    const r = await a.ping('192.168.1.1');
    expect(r.reachable).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('login devuelve success=true', async () => {
    const a = new MockRouterAdapter({ mode: 'success', ssidGuest: 'TestGuest' });
    const r = await a.login(credentials);
    expect(r.success).toBe(true);
    expect(r.variant).toBe('mock-v1');
  });

  it('getGuestSsid devuelve el ssid configurado', async () => {
    const a = new MockRouterAdapter({ mode: 'success', ssidGuest: 'TestGuest' });
    await a.login(credentials);
    expect(await a.getGuestSsid()).toBe('TestGuest');
  });

  it('setGuestPassword no lanza en modo success', async () => {
    const a = new MockRouterAdapter({ mode: 'success', ssidGuest: 'TestGuest' });
    await a.login(credentials);
    await expect(a.setGuestPassword('NEW123ABC')).resolves.toBeUndefined();
  });
});

describe('MockRouterAdapter — always-fail mode', () => {
  it('ping devuelve reachable=false', async () => {
    const a = new MockRouterAdapter({ mode: 'always-fail', ssidGuest: 'X' });
    const r = await a.ping('192.168.1.1');
    expect(r.reachable).toBe(false);
  });

  it('login devuelve success=false', async () => {
    const a = new MockRouterAdapter({ mode: 'always-fail', ssidGuest: 'X' });
    const r = await a.login(credentials);
    expect(r.success).toBe(false);
  });

  it('setGuestPassword lanza', async () => {
    const a = new MockRouterAdapter({ mode: 'always-fail', ssidGuest: 'X' });
    await expect(a.setGuestPassword('x')).rejects.toThrow(/mock-fail/);
  });
});

describe('MockRouterAdapter — fail-on-step mode', () => {
  it('falla sólo en el paso configurado', async () => {
    const a = new MockRouterAdapter({ mode: 'fail-on-step', failStep: 'set-password', ssidGuest: 'X' });
    await expect(a.login(credentials)).resolves.toMatchObject({ success: true });
    await expect(a.setGuestPassword('new')).rejects.toThrow(/set-password/);
  });
});

describe('MockRouterAdapter — latencia simulada', () => {
  it('respeta latencyMs configurada', async () => {
    const a = new MockRouterAdapter({ mode: 'success', ssidGuest: 'X', latencyMs: 50 });
    const start = Date.now();
    await a.ping('1.2.3.4');
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
