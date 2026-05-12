import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type noble from '@abandonware/noble';
import { SerialPort } from 'serialport';

import type { DiscoveredPrinter, PrinterConnection } from '../../../shared/types.js';

const execAsync = promisify(exec);

// ─── Brand inference ────────────────────────────────────────────────────────

type SuggestedType = NonNullable<DiscoveredPrinter['suggestedType']>;

const BRAND_PATTERNS: Array<[RegExp, SuggestedType]> = [
  [/aomus|MY[- ]?A1/i, 'aomus'],
  [/epson|TM-T\d|TM[- ]\w+/i, 'epson'],
  [/\bstar\b|TSP\d|SM-T/i, 'star'],
  [/tanca|TP-\d{3}/i, 'tanca'],
  [/daruma|DR\d/i, 'daruma'],
  [/brother|QL-/i, 'brother'],
];

function inferType(name: string): SuggestedType | undefined {
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(name)) return brand;
  }
  return undefined;
}

function makeUsbPrinter(name: string): DiscoveredPrinter {
  const suggested = inferType(name);
  const base: DiscoveredPrinter = {
    identifier: `printer:${name}`,
    label: `Sistema: ${name}`,
    connection: 'usb',
    likelyEscPosCompatible: true,
  };
  return suggested !== undefined ? { ...base, suggestedType: suggested } : base;
}

// ─── Pure parsers (testable without shell) ──────────────────────────────────

/**
 * Parses `lpstat -p` output (macOS / Linux).
 *
 * Example line:
 *   printer EPSON_TM-T20III is idle.  enabled since ...
 */
export function parseLpstatOutput(output: string): DiscoveredPrinter[] {
  const results: DiscoveredPrinter[] = [];
  for (const line of output.split('\n')) {
    const match = /^printer\s+(\S+)\s+/.exec(line);
    if (!match) continue;
    results.push(makeUsbPrinter(match[1]!));
  }
  return results;
}

/**
 * Parses `Get-Printer | Format-Table -AutoSize` output (Windows PowerShell).
 *
 * Skips header lines (Name / dashes) and blank lines; treats the first
 * whitespace-separated token as the full printer name up to the second column.
 */
export function parseGetPrinterOutput(output: string): DiscoveredPrinter[] {
  const results: DiscoveredPrinter[] = [];
  let pastHeader = false;
  for (const line of output.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (/^-+(\s+-+)+/.test(trimmed)) {
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    const nameMatch = /^(.+?)\s{2,}/.exec(trimmed);
    if (!nameMatch) continue;
    const name = nameMatch[1]!.trim();
    if (!name) continue;
    results.push(makeUsbPrinter(name));
  }
  return results;
}

/**
 * Parses `wmic printer get Name` output (Windows fallback).
 */
export function parseWmicOutput(output: string): DiscoveredPrinter[] {
  const results: DiscoveredPrinter[] = [];
  let firstNonEmpty = true;
  for (const line of output.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    if (firstNonEmpty) {
      firstNonEmpty = false;
      continue;
    }
    results.push(makeUsbPrinter(name));
  }
  return results;
}

// ─── USB discovery ──────────────────────────────────────────────────────────

async function detectUsbPrintersMacLinux(): Promise<DiscoveredPrinter[]> {
  try {
    const { stdout } = await execAsync('lpstat -p');
    return parseLpstatOutput(stdout);
  } catch {
    return [];
  }
}

async function detectUsbPrintersWindows(): Promise<DiscoveredPrinter[]> {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-Printer | Format-Table -AutoSize | Out-String -Width 200"'
    );
    const results = parseGetPrinterOutput(stdout);
    if (results.length > 0) return results;
  } catch {
    // fall through to wmic
  }
  try {
    const { stdout } = await execAsync('wmic printer get Name');
    return parseWmicOutput(stdout);
  } catch {
    return [];
  }
}

export async function detectUsbPrinters(): Promise<DiscoveredPrinter[]> {
  if (process.platform === 'win32') {
    return detectUsbPrintersWindows();
  }
  return detectUsbPrintersMacLinux();
}

// ─── Bluetooth (Classic / SPP) discovery ───────────────────────────────────

export async function detectBluetoothPrinters(): Promise<DiscoveredPrinter[]> {
  const ports = await SerialPort.list();
  const results: DiscoveredPrinter[] = [];

  for (const port of ports) {
    const path = port.path;
    const normPath = path.replace('/dev/tty.', '/dev/cu.');

    const isBluetooth =
      normPath.includes('/dev/cu.') ||
      (port.manufacturer?.toLowerCase().includes('bluetooth') ?? false) ||
      (port.pnpId?.toLowerCase().includes('bluetooth') ?? false);

    if (!isBluetooth) continue;

    const label = port.manufacturer ?? path;
    const connection: PrinterConnection = 'bluetooth';
    const suggested = inferType(label);
    results.push({
      identifier: normPath,
      label,
      connection,
      likelyEscPosCompatible: false,
      ...(suggested !== undefined ? { suggestedType: suggested } : {}),
    });
  }
  return results;
}

// ─── BLE discovery ──────────────────────────────────────────────────────────

async function bleScanFor(durationMs: number): Promise<DiscoveredPrinter[]> {
  // Lazy import: noble carga su binding nativo al evaluarse. Mantenerlo fuera del
  // top-level evita que tests sin BLE (detect.test.ts) fallen en CI cuando el
  // prebuild de @abandonware/bluetooth-hci-socket no está disponible.
  const nobleImport = (await import('@abandonware/noble')) as unknown as {
    default: typeof noble;
  };
  const nobleInstance = nobleImport.default;

  if ((nobleInstance as unknown as { state: string }).state !== 'poweredOn') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('BLE adapter no disponible (timeout 3s)')),
        3_000
      );
      const handler = (state: string): void => {
        if (state === 'poweredOn') {
          clearTimeout(timeout);
          nobleInstance.removeListener('stateChange', handler);
          resolve();
        }
      };
      nobleInstance.on('stateChange', handler);
    });
  }

  const found = new Map<string, DiscoveredPrinter>();

  await nobleInstance.startScanningAsync([], true);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      nobleInstance.removeListener('discover', listener);
      resolve();
    }, durationMs);

    const listener = (peripheral: noble.Peripheral): void => {
      const localName = peripheral.advertisement.localName;
      if (!localName) return;

      if (!found.has(peripheral.id)) {
        const suggested = inferType(localName);
        found.set(peripheral.id, {
          identifier: `${peripheral.id}|<svc>|<char>`,
          label: localName,
          connection: 'bluetooth-ble',
          likelyEscPosCompatible: true,
          ...(suggested !== undefined ? { suggestedType: suggested } : {}),
        });
      }
    };

    nobleInstance.on('discover', listener);

    void nobleInstance.stopScanningAsync().finally(() => {
      clearTimeout(timer);
    });
  });

  void nobleInstance.stopScanningAsync().finally(() => {
    /* cleanup */
  });

  return Array.from(found.values());
}

export async function detectBlePrinters(durationMs = 5_000): Promise<DiscoveredPrinter[]> {
  try {
    return await bleScanFor(durationMs);
  } catch {
    return [];
  }
}

// ─── Umbrella discovery ──────────────────────────────────────────────────────

export async function discoverAll(timeoutMs = 10_000): Promise<DiscoveredPrinter[]> {
  const bleDuration = Math.max(timeoutMs - 2_000, 3_000);

  const race = <T>(promise: Promise<T>): Promise<T | []> =>
    Promise.race([
      promise,
      new Promise<[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
    ]);

  const [usbResult, btResult, bleResult] = await Promise.allSettled([
    race(detectUsbPrinters()),
    race(detectBluetoothPrinters()),
    race(detectBlePrinters(bleDuration)),
  ]);

  const flatten = (r: PromiseSettledResult<DiscoveredPrinter[] | []>): DiscoveredPrinter[] =>
    r.status === 'fulfilled' ? (r.value as DiscoveredPrinter[]) : [];

  return [...flatten(usbResult), ...flatten(btResult), ...flatten(bleResult)];
}
