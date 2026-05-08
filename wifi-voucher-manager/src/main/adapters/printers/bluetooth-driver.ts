import { Buffer } from 'node:buffer';

import { SerialPort } from 'serialport';

import type { PrinterRow } from '../../db/repositories/PrinterRepository.js';

import type { PrinterDriver } from './driver-types.js';

const OPEN_TIMEOUT_MS = 5_000;
const WRITE_DRAIN_TIMEOUT_MS = 5_000;

function openPort(path: string): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
    const timer = setTimeout(() => {
      reject(new Error(`Timeout abriendo puerto serial ${path} (${OPEN_TIMEOUT_MS}ms)`));
    }, OPEN_TIMEOUT_MS);
    port.open((err) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(port);
    });
  });
}

function writeBuffer(port: SerialPort, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(Buffer.from(bytes), (err) => {
      if (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Timeout drenando puerto serial (${WRITE_DRAIN_TIMEOUT_MS}ms)`));
      }, WRITE_DRAIN_TIMEOUT_MS);
      port.drain((drainErr) => {
        clearTimeout(timer);
        if (drainErr) reject(drainErr);
        else resolve();
      });
    });
  });
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise((resolve) => {
    port.close(() => resolve());
  });
}

const INIT_BYTES = new Uint8Array([0x1b, 0x40]); // ESC @

export class BluetoothDriver implements PrinterDriver {
  async write(printer: PrinterRow, bytes: Uint8Array): Promise<void> {
    const port = await openPort(printer.identifier);
    try {
      await writeBuffer(port, bytes);
    } finally {
      await closePort(port);
    }
  }

  async testConnection(printer: PrinterRow): Promise<void> {
    const port = await openPort(printer.identifier);
    try {
      await writeBuffer(port, INIT_BYTES);
    } finally {
      await closePort(port);
    }
  }
}
