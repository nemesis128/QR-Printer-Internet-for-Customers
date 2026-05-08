import { describe, expect, it } from 'vitest';

import {
  parseLpstatOutput,
  parseGetPrinterOutput,
  parseWmicOutput,
} from '../../../../src/main/adapters/printers/detect.js';

// ─── parseLpstatOutput ──────────────────────────────────────────────────────

describe('parseLpstatOutput', () => {
  it('extrae impresoras de salida típica de lpstat -p', () => {
    const output = [
      'printer EPSON_TM-T20III is idle.  enabled since Fri 01 Jan 2025 12:00:00',
      'printer Star_TSP650II is idle.  enabled since Fri 01 Jan 2025 12:00:00',
    ].join('\n');

    const result = parseLpstatOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'EPSON_TM-T20III',
      connection: 'usb',
      identifier: 'printer:EPSON_TM-T20III',
    });
    expect(result[1]).toMatchObject({
      name: 'Star_TSP650II',
      connection: 'usb',
      identifier: 'printer:Star_TSP650II',
    });
  });

  it('infiere la marca correctamente', () => {
    const output = 'printer EPSON_TM-T20III is idle.  enabled since Fri 01 Jan 2025 12:00:00';
    const result = parseLpstatOutput(output);
    expect(result[0]?.brand).toBe('epson');
  });

  it('retorna [] si no hay líneas de impresoras', () => {
    const result = parseLpstatOutput('no printers found\n');
    expect(result).toHaveLength(0);
  });
});

// ─── parseGetPrinterOutput ──────────────────────────────────────────────────

describe('parseGetPrinterOutput', () => {
  it('extrae impresoras de salida típica de Get-Printer PowerShell', () => {
    const output = [
      'Name                      ComputerName    Type         DriverName',
      '----                      ------------    ----         ----------',
      'EPSON TM-T20III           WIN-PC          Local        EPSON TM-T20III',
      'Star TSP650II             WIN-PC          Local        Star TSP650II',
    ].join('\n');

    const result = parseGetPrinterOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'EPSON TM-T20III',
      connection: 'usb',
      identifier: 'printer:EPSON TM-T20III',
    });
  });

  it('retorna [] si la salida solo contiene la cabecera', () => {
    const output = [
      'Name                      ComputerName    Type         DriverName',
      '----                      ------------    ----         ----------',
    ].join('\n');
    const result = parseGetPrinterOutput(output);
    expect(result).toHaveLength(0);
  });
});

// ─── parseWmicOutput ────────────────────────────────────────────────────────

describe('parseWmicOutput', () => {
  it('extrae impresoras de salida de wmic printer get Name', () => {
    const output = [
      'Name',
      'EPSON TM-T20III',
      'Microsoft Print to PDF',
      '',
    ].join('\n');

    const result = parseWmicOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'EPSON TM-T20III',
      connection: 'usb',
      identifier: 'printer:EPSON TM-T20III',
    });
  });

  it('retorna [] si solo contiene el encabezado "Name"', () => {
    const result = parseWmicOutput('Name\n');
    expect(result).toHaveLength(0);
  });
});
