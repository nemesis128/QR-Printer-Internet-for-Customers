import { describe, expect, it } from 'vitest';

import { QRService } from '../../../src/main/services/QRService.js';

describe('QRService.escapeWifiValue', () => {
  it('escapa el caracter ;', () => {
    expect(QRService.escapeWifiValue('foo;bar')).toBe('foo\\;bar');
  });

  it('escapa el caracter :', () => {
    expect(QRService.escapeWifiValue('foo:bar')).toBe('foo\\:bar');
  });

  it('escapa el caracter ,', () => {
    expect(QRService.escapeWifiValue('foo,bar')).toBe('foo\\,bar');
  });

  it('escapa el caracter "', () => {
    expect(QRService.escapeWifiValue('foo"bar')).toBe('foo\\"bar');
  });

  it('escapa el caracter \\', () => {
    expect(QRService.escapeWifiValue('foo\\bar')).toBe('foo\\\\bar');
  });

  it('preserva strings sin chars especiales', () => {
    expect(QRService.escapeWifiValue('Restaurante123')).toBe('Restaurante123');
  });
});

describe('QRService.formatPayload', () => {
  it('formato base con WPA y hidden=false', () => {
    const payload = QRService.formatPayload({
      ssid: 'Restaurante-Clientes',
      password: 'ABCD23PQRS',
    });
    expect(payload).toBe('WIFI:T:WPA;S:Restaurante-Clientes;P:ABCD23PQRS;H:false;;');
  });

  it('hidden=true se escribe como H:true', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestSSID',
      password: 'pwd123',
      hidden: true,
    });
    expect(payload).toBe('WIFI:T:WPA;S:TestSSID;P:pwd123;H:true;;');
  });

  it('security=WEP se aplica como T:WEP', () => {
    const payload = QRService.formatPayload({
      ssid: 'OldNet',
      password: 'wepkey',
      security: 'WEP',
    });
    expect(payload).toContain('T:WEP;');
  });

  it('security=nopass omite el campo P:', () => {
    const payload = QRService.formatPayload({
      ssid: 'OpenNet',
      password: '',
      security: 'nopass',
    });
    expect(payload).toBe('WIFI:T:nopass;S:OpenNet;H:false;;');
    expect(payload).not.toContain('P:');
  });

  it('SSID con punto y coma se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'Cafe;Bar',
      password: 'pwd',
    });
    expect(payload).toContain('S:Cafe\\;Bar');
  });

  it('password con dos puntos se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p:assword',
    });
    expect(payload).toContain('P:p\\:assword');
  });

  it('password con backslash se escapa doble', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p\\assword',
    });
    expect(payload).toContain('P:p\\\\assword');
  });

  it('password con coma se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p,assword',
    });
    expect(payload).toContain('P:p\\,assword');
  });

  it('password con comilla doble se escapa', () => {
    const payload = QRService.formatPayload({
      ssid: 'TestNet',
      password: 'p"assword',
    });
    expect(payload).toContain('P:p\\"assword');
  });

  it('SSID con caracteres UTF-8 acentuados se preserva tal cual', () => {
    const payload = QRService.formatPayload({
      ssid: 'CaféMéxico',
      password: 'XK7P3M9Q2A',
    });
    expect(payload).toContain('S:CaféMéxico');
  });

  it('default security es WPA cuando no se especifica', () => {
    const payload = QRService.formatPayload({
      ssid: 'X',
      password: 'y',
    });
    expect(payload).toContain('T:WPA;');
  });
});
