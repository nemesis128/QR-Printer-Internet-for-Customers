import noble, { type Peripheral, type Characteristic } from '@abandonware/noble';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

/**
 * Driver para impresoras Bluetooth Low Energy (BLE).
 *
 * Identifier format: `<peripheralId>|<serviceUuid>|<characteristicUuid>`
 *   - peripheralId: id de noble (en macOS suele ser un UUID, en Windows un MAC).
 *   - serviceUuid: UUID del servicio que tiene la característica de escritura.
 *   - characteristicUuid: UUID de la característica writable / writeWithoutResponse.
 *
 * Discovery se hace en `detect.ts` via `detectBlePrinters()` y devuelve el
 * identifier ya armado en el formato pipe-delimitado.
 *
 * BLE tiene MTU bajo (típicamente 23-185 bytes payload). Escribimos en chunks.
 */

const CHUNK_SIZE = 100; // conservador, casi cualquier MTU lo admite
const INTER_CHUNK_DELAY_MS = 25;

interface ParsedIdentifier {
  peripheralId: string;
  serviceUuid: string;
  charUuid: string;
}

function parseIdentifier(identifier: string): ParsedIdentifier {
  const parts = identifier.split('|');
  if (parts.length !== 3) {
    throw new Error(
      `Identifier BLE inválido: "${identifier}" — esperado <peripheralId>|<serviceUuid>|<charUuid>`
    );
  }
  return {
    peripheralId: parts[0]!,
    serviceUuid: parts[1]!,
    charUuid: parts[2]!,
  };
}

async function waitForPoweredOn(): Promise<void> {
  if ((noble as unknown as { state: string }).state === 'poweredOn') return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timeout esperando que el adapter BT esté poweredOn')),
      5_000
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

async function findPeripheral(peripheralId: string, timeoutMs = 10_000): Promise<Peripheral> {
  const cached = (noble as unknown as { _peripherals?: Record<string, Peripheral> })._peripherals;
  if (cached && cached[peripheralId]) {
    return cached[peripheralId];
  }
  await noble.startScanningAsync([], false);
  try {
    return await new Promise<Peripheral>((resolve, reject) => {
      const timer = setTimeout(() => {
        noble.removeListener('discover', listener);
        reject(new Error(`No se encontró periférico BLE id=${peripheralId} en ${timeoutMs}ms`));
      }, timeoutMs);
      const listener = (p: Peripheral): void => {
        if (p.id === peripheralId) {
          clearTimeout(timer);
          noble.removeListener('discover', listener);
          resolve(p);
        }
      };
      noble.on('discover', listener);
    });
  } finally {
    await noble.stopScanningAsync();
  }
}

async function writeChunked(
  characteristic: Characteristic,
  bytes: Uint8Array,
  withoutResponse: boolean
): Promise<void> {
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = Buffer.from(bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length)));
    await new Promise<void>((resolve, reject) => {
      characteristic.write(chunk, withoutResponse, (err) => {
        if (err) reject(typeof err === 'string' ? new Error(err) : err);
        else resolve();
      });
    });
    if (INTER_CHUNK_DELAY_MS > 0 && i + CHUNK_SIZE < bytes.length) {
      await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
    }
  }
}

export class BleDriver implements PrinterDriver {
  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const ids = parseIdentifier(printer.identifier);
    await waitForPoweredOn();

    const peripheral = await findPeripheral(ids.peripheralId);
    await peripheral.connectAsync();
    try {
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [ids.serviceUuid],
        [ids.charUuid]
      );
      const char = characteristics[0];
      if (!char) {
        throw new Error(
          `No se encontró la característica ${ids.charUuid} en servicio ${ids.serviceUuid}`
        );
      }
      const props = char.properties;
      const withoutResponse =
        !props.includes('write') && props.includes('writeWithoutResponse');
      await writeChunked(char, bytes, withoutResponse);
    } finally {
      try {
        await peripheral.disconnectAsync();
      } catch {
        /* ignore */
      }
    }
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    const ids = parseIdentifier(printer.identifier);
    await waitForPoweredOn();
    const peripheral = await findPeripheral(ids.peripheralId);
    await peripheral.connectAsync();
    try {
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [ids.serviceUuid],
        [ids.charUuid]
      );
    } finally {
      try {
        await peripheral.disconnectAsync();
      } catch {
        /* ignore */
      }
    }
  }
}
