import { spawn } from 'node:child_process';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

export function parseIdentifier(identifier: string): string {
  if (!identifier.startsWith('printer:')) {
    throw new Error(`Identifier USB inválido: "${identifier}" — esperado 'printer:<NAME>'`);
  }
  const name = identifier.slice('printer:'.length);
  if (name.length === 0) {
    throw new Error('Identifier USB inválido: nombre vacío');
  }
  return name;
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type Spawner = (cmd: string, args: string[], stdin: Uint8Array) => Promise<SpawnResult>;

const defaultSpawner: Spawner = (cmd, args, stdin) =>
  new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
    if (child.stdin) {
      child.stdin.write(Buffer.from(stdin));
      child.stdin.end();
    }
  });

const POWERSHELL_TEMPLATE = (name: string): string =>
  `$bytes = [Console]::OpenStandardInput().ReadToEnd(); ` +
  `Add-Type -AssemblyName System.Drawing; ` +
  `Out-Printer -Name "${name.replace(/"/g, '`"')}"`;

/**
 * UsbDriver vía shell commands (D-023). Envía bytes ESC/POS al spooler:
 *   - macOS / Linux: `lp -d <NAME> -o raw` con bytes en stdin
 *   - Windows: `powershell` + Out-Printer
 *
 * El name viene del identifier en formato 'printer:<NAME>'. El nombre
 * lo provee el discovery (`lpstat -p` / `Get-Printer`).
 */
export class UsbDriver implements PrinterDriver {
  private spawner: Spawner = defaultSpawner;

  setSpawnerForTests(s: Spawner): void {
    this.spawner = s;
  }

  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const name = parseIdentifier(printer.identifier);
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'linux') {
      const result = await this.spawner('lp', ['-d', name, '-o', 'raw'], bytes);
      if (result.exitCode !== 0) {
        throw new Error(
          `lp falló con exitCode=${result.exitCode}: ${result.stderr.trim() || '<no stderr>'}`
        );
      }
      return;
    }

    if (platform === 'win32') {
      const psCommand = POWERSHELL_TEMPLATE(name);
      const result = await this.spawner('powershell', ['-NoProfile', '-Command', psCommand], bytes);
      if (result.exitCode !== 0) {
        throw new Error(
          `powershell Out-Printer falló con exitCode=${result.exitCode}: ${
            result.stderr.trim() || '<no stderr>'
          }`
        );
      }
      return;
    }

    throw new Error(`UsbDriver no soporta la plataforma: ${platform}`);
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    // Enviamos solo INIT (ESC @) — la impresora hace 'click' sin imprimir.
    await this.write(printer, new Uint8Array([0x1b, 0x40]));
  }
}
