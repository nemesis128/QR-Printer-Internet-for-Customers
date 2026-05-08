import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UsbDriver, parseIdentifier } from '../../../../src/main/adapters/printers/usb-driver.js';
import type { PrinterRow } from '../../../../src/main/db/repositories/PrinterRepository.js';

const printer: PrinterRow = {
  id: 'p',
  name: 'EPSON',
  connection: 'usb',
  identifier: 'printer:EPSON_TM-T20III',
  width_chars: 48,
  active: 1,
  notes: null,
};

describe('UsbDriver.parseIdentifier', () => {
  it('extrae el name detrás de "printer:"', () => {
    expect(parseIdentifier('printer:EPSON_TM')).toBe('EPSON_TM');
  });

  it('lanza Error si el prefix falta', () => {
    expect(() => parseIdentifier('EPSON')).toThrow();
  });

  it('lanza Error si el name está vacío', () => {
    expect(() => parseIdentifier('printer:')).toThrow();
  });
});

describe('UsbDriver.write', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('en macOS spawn lp con stdin = bytes', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const drv = new UsbDriver();
    const spawnedCommands: Array<{ cmd: string; args: string[] }> = [];

    // Inyectamos un spawner mockeado
    drv.setSpawnerForTests((cmd, args, _input) => {
      spawnedCommands.push({ cmd, args });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    await drv.write(printer, new Uint8Array([0x1b, 0x40]));
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]!.cmd).toBe('lp');
    expect(spawnedCommands[0]!.args).toEqual(['-d', 'EPSON_TM-T20III', '-o', 'raw']);
  });

  it('en Windows spawn powershell con Out-Printer', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });

    const drv = new UsbDriver();
    const spawnedCommands: Array<{ cmd: string; args: string[] }> = [];

    drv.setSpawnerForTests((cmd, args, _input) => {
      spawnedCommands.push({ cmd, args });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    await drv.write(printer, new Uint8Array([0x1b, 0x40]));
    expect(spawnedCommands).toHaveLength(1);
    expect(spawnedCommands[0]!.cmd).toBe('powershell');
    // Comando contiene Out-Printer + el nombre
    const fullCmd = spawnedCommands[0]!.args.join(' ');
    expect(fullCmd).toContain('Out-Printer');
    expect(fullCmd).toContain('EPSON_TM-T20III');
  });

  it('rechaza si exitCode != 0', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });

    const drv = new UsbDriver();
    drv.setSpawnerForTests(() =>
      Promise.resolve({ exitCode: 1, stdout: '', stderr: 'lp: error' })
    );

    await expect(drv.write(printer, new Uint8Array([1]))).rejects.toThrow(/lp: error|exitCode/);
  });
});
