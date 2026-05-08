import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import noble from '@abandonware/noble';
import { SerialPort } from 'serialport';

const execAsync = promisify(exec);

// ─── Types ──────────────────────────────────────────────────────────────────

export type PrinterBrand =
  | 'aomus'
  | 'epson'
  | 'star'
  | 'tanca'
  | 'daruma'
  | 'brother'
  | 'unknown';

export type PrinterConnection = 'usb' | 'bluetooth' | 'ble';

export interface DiscoveredPrinter {
  name: string;
  connection: PrinterConnection;
  identifier: string;
  brand: PrinterBrand;
}

// ─── Brand inference ────────────────────────────────────────────────────────

const BRAND_PATTERNS: Array<[RegExp, PrinterBrand]> = [
  [/aomus/i, 'aomus'],
  [/epson/i, 'epson'],
  [/star/i, 'star'],
  [/tanca/i, 'tanca'],
  [/daruma/i, 'daruma'],
  [/brother/i, 'brother'],
];

function inferBrand(name: string): PrinterBrand {
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(name)) return brand;
  }
  return 'unknown';
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
    const name = match[1]!;
    results.push({
      name,
      connection: 'usb',
      identifier: `printer:${name}`,
      brand: inferBrand(name),
    });
  }
  return results;
}

/**
 * Parses `Get-Printer | Format-Table -AutoSize` output (Windows PowerShell).
 *
 * Skips header lines (Name / dashes) and blank lines; treats the first
 * whitespace-separated token as the full printer name up to the second column.
 *
 * Heuristic: PowerShell Format-Table separates columns with 2+ spaces.
 * The Name column is everything before the first gap of 2+ spaces.
 */
export function parseGetPrinterOutput(output: string): DiscoveredPrinter[] {
  const results: DiscoveredPrinter[] = [];
  let pastHeader = false;
  for (const line of output.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    // Detect the dashes separator line
    if (/^-+(\s+-+)+/.test(trimmed)) {
      pastHeader = true;
      continue;
    }
    // Skip the header line (Name  ComputerName  ...)
    if (!pastHeader) continue;
    // Extract name: everything before the first run of 2+ spaces
    const nameMatch = /^(.+?)\s{2,}/.exec(trimmed);
    if (!nameMatch) continue;
    const name = nameMatch[1]!.trim();
    if (!name) continue;
    results.push({
      name,
      connection: 'usb',
      identifier: `printer:${name}`,
      brand: inferBrand(name),
    });
  }
  return results;
}

/**
 * Parses `wmic printer get Name` output (Windows fallback).
 *
 * First non-empty line is "Name" header — skipped.
 * Each subsequent non-empty line is a printer name.
 */
export function parseWmicOutput(output: string): DiscoveredPrinter[] {
  const results: DiscoveredPrinter[] = [];
  let firstNonEmpty = true;
  for (const line of output.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    if (firstNonEmpty) {
      firstNonEmpty = false;
      continue; // skip "Name" header
    }
    results.push({
      name,
      connection: 'usb',
      identifier: `printer:${name}`,
      brand: inferBrand(name),
    });
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
  // Try Get-Printer first (Windows 8+), fall back to wmic
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

/**
 * Lists serial ports and returns those whose path starts with /dev/cu or
 * /dev/tty (normalising tty → cu on macOS), plus COM ports on Windows.
 *
 * SerialPort.list() returns all ports; we filter to likely Bluetooth ones
 * by manufacturer or path heuristics.
 */
export async function detectBluetoothPrinters(): Promise<DiscoveredPrinter[]> {
  const ports = await SerialPort.list();
  const results: DiscoveredPrinter[] = [];

  for (const port of ports) {
    const path = port.path;
    // Normalise /dev/tty.* → /dev/cu.* on macOS so open() doesn't block
    const normPath = path.replace('/dev/tty.', '/dev/cu.');

    // Only include serial ports that look like Bluetooth (cu.* on mac,
    // or mention Bluetooth in manufacturer on Windows)
    const isBluetooth =
      normPath.includes('/dev/cu.') ||
      (port.manufacturer?.toLowerCase().includes('bluetooth') ?? false) ||
      (port.pnpId?.toLowerCase().includes('bluetooth') ?? false);

    if (!isBluetooth) continue;

    const name = port.manufacturer ?? path;
    results.push({
      name,
      connection: 'bluetooth',
      identifier: normPath,
      brand: inferBrand(name),
    });
  }
  return results;
}

// ─── BLE discovery ──────────────────────────────────────────────────────────

async function bleScanFor(durationMs: number): Promise<DiscoveredPrinter[]> {
  // Wait for adapter to be powered on (up to 3s for cold start)
  if ((noble as unknown as { state: string }).state !== 'poweredOn') {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('BLE adapter no disponible (timeout 3s)')),
        3_000
      );
      const handler = (state: string): void => {
        if (state === 'poweredOn') {
          clearTimeout(timeout);
          noble.removeListener('stateChange', handler);
          resolve();
        }
      };
      noble.on('stateChange', handler);
    });
  }

  const found = new Map<string, DiscoveredPrinter>();

  await noble.startScanningAsync([], true); // allowDuplicates=true for better discovery

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      noble.removeListener('discover', listener);
      resolve();
    }, durationMs);

    const listener = (peripheral: noble.Peripheral): void => {
      const localName = peripheral.advertisement.localName;
      if (!localName) return; // drop anonymous beacons

      if (!found.has(peripheral.id)) {
        found.set(peripheral.id, {
          name: localName,
          connection: 'ble',
          identifier: peripheral.id,
          brand: inferBrand(localName),
        });
      }
    };

    noble.on('discover', listener);

    // If timer fires before durationMs for some reason
    void noble.stopScanningAsync().finally(() => {
      clearTimeout(timer);
    });
  });

  void noble.stopScanningAsync().finally(() => {
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

/**
 * Runs USB, Bluetooth, and BLE discovery in parallel with an overall timeout.
 * Uses Promise.allSettled so a single failure doesn't abort everything.
 */
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
