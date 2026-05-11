// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';

import { TPLinkArcherAdapter } from '../../src/main/adapters/routers/tplink-archer-adapter.js';
import { UnsupportedVariantError } from '../../src/main/adapters/routers/router-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/tplink');
const loginHtml = readFileSync(resolve(FIXTURE_DIR, 'archer-c24-v1.2_index-login-page.html'), 'utf8');

const HOST = '192.168.1.1';
const BASE = `http://${HOST}`;
const credentials = { host: HOST, user: 'admin', password: 'AdminPwd', model: 'Archer C24' };

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe('TPLinkArcherAdapter — ping', () => {
  it('ping devuelve reachable=true cuando el router responde 200', async () => {
    nock(BASE).head('/').reply(200);
    const a = new TPLinkArcherAdapter();
    const r = await a.ping(HOST);
    expect(r.reachable).toBe(true);
  });

  it('ping devuelve reachable=false cuando el router no responde', async () => {
    nock(BASE).head('/').replyWithError({ code: 'ECONNREFUSED' });
    const a = new TPLinkArcherAdapter();
    const r = await a.ping(HOST);
    expect(r.reachable).toBe(false);
  });
});

describe('TPLinkArcherAdapter — variant detection', () => {
  it('detecta Archer C24 V1.2 desde el <title>', async () => {
    nock(BASE).get('/').reply(200, loginHtml);
    nock(BASE)
      .post('/cgi-bin/luci')
      .reply(200, { stat: 'ok', sessionKey: 'ABCDEF123456' }, { 'Set-Cookie': 'sysauth=ABCDEF123456' });
    const a = new TPLinkArcherAdapter();
    const r = await a.login(credentials);
    expect(r.success).toBe(true);
    expect(r.variant).toBe('archer-c24-v1.2');
  });

  it('lanza UnsupportedVariantError cuando el HTML no coincide con variantes conocidas', async () => {
    nock(BASE).get('/').reply(200, '<html><title>NetGear Nighthawk</title></html>');
    const a = new TPLinkArcherAdapter();
    await expect(a.login(credentials)).rejects.toThrow(UnsupportedVariantError);
  });
});

describe('TPLinkArcherAdapter — wrong password', () => {
  it('login con password incorrecta lanza RouterAuthError', async () => {
    nock(BASE).get('/').reply(200, loginHtml);
    nock(BASE).post('/cgi-bin/luci').reply(200, { stat: 'error', error: 'Invalid username or password' });
    const a = new TPLinkArcherAdapter();
    await expect(a.login({ ...credentials, password: 'WRONG' })).rejects.toThrow(/Invalid/);
  });
});

describe('TPLinkArcherAdapter — guest password lifecycle', () => {
  it('login + getGuestSsid devuelve el ssid', async () => {
    nock(BASE).get('/').reply(200, loginHtml);
    nock(BASE)
      .post('/cgi-bin/luci')
      .reply(200, { stat: 'ok', sessionKey: 'ABCDEF' }, { 'Set-Cookie': 'sysauth=ABCDEF' });
    nock(BASE)
      .get('/cgi-bin/luci/;stok=ABCDEF/admin/wireless_2g_guest/get')
      .reply(200, { stat: 'ok', data: { ssid: 'Restaurante-Clientes', enabled: true } });

    const a = new TPLinkArcherAdapter();
    await a.login(credentials);
    expect(await a.getGuestSsid()).toBe('Restaurante-Clientes');
  });

  it('setGuestPassword exitoso no lanza', async () => {
    nock(BASE).get('/').reply(200, loginHtml);
    nock(BASE)
      .post('/cgi-bin/luci')
      .reply(200, { stat: 'ok', sessionKey: 'ABCDEF' }, { 'Set-Cookie': 'sysauth=ABCDEF' });
    nock(BASE)
      .post('/cgi-bin/luci/;stok=ABCDEF/admin/wireless_2g_guest/set')
      .reply(200, { stat: 'ok' });

    const a = new TPLinkArcherAdapter();
    await a.login(credentials);
    await expect(a.setGuestPassword('NEW123XYZ')).resolves.toBeUndefined();
  });

  it('setGuestPassword rechazado por router (password débil) lanza con el mensaje', async () => {
    nock(BASE).get('/').reply(200, loginHtml);
    nock(BASE)
      .post('/cgi-bin/luci')
      .reply(200, { stat: 'ok', sessionKey: 'ABCDEF' }, { 'Set-Cookie': 'sysauth=ABCDEF' });
    nock(BASE)
      .post('/cgi-bin/luci/;stok=ABCDEF/admin/wireless_2g_guest/set')
      .reply(200, { stat: 'error', error: 'Password too weak (min 8 chars)' });

    const a = new TPLinkArcherAdapter();
    await a.login(credentials);
    await expect(a.setGuestPassword('weak')).rejects.toThrow(/too weak/);
  });
});
