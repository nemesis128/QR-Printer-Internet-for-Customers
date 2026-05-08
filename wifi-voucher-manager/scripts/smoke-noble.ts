import electron from 'electron';
import noble from '@abandonware/noble';

const { app } = electron;

const SCAN_TIMEOUT_MS = 10_000;
const POWERED_ON_TIMEOUT_MS = 5_000;

async function waitForPoweredOn(timeoutMs: number): Promise<void> {
  if ((noble as unknown as { state: string }).state === 'poweredOn') return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando poweredOn (${timeoutMs}ms)`)),
      timeoutMs
    );
    const handler = (state: string): void => {
      console.warn(`[smoke-noble] stateChange → ${state}`);
      if (state === 'poweredOn') {
        clearTimeout(timer);
        noble.removeListener('stateChange', handler);
        resolve();
      } else if (state === 'unauthorized' || state === 'unsupported') {
        clearTimeout(timer);
        noble.removeListener('stateChange', handler);
        reject(new Error(`Estado terminal: ${state}`));
      }
    };
    noble.on('stateChange', handler);
  });
}

async function scanForPeripherals(durationMs: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let count = 0;
    const seen = new Set<string>();

    const onDiscover = (peripheral: {
      id: string;
      advertisement?: { localName?: string };
    }): void => {
      if (!seen.has(peripheral.id)) {
        seen.add(peripheral.id);
        count++;
        const name = peripheral.advertisement?.localName ?? '<sin nombre>';
        console.warn(`[smoke-noble] discover[${count}] id=${peripheral.id} name=${name}`);
      }
    };

    noble.on('discover', onDiscover);

    noble.startScanningAsync([], false).catch((err: unknown) => {
      reject(err as Error);
    });

    setTimeout(() => {
      noble.removeListener('discover', onDiscover);
      void noble.stopScanningAsync().finally(() => resolve(count));
    }, durationMs);
  });
}

async function main(): Promise<void> {
  console.warn('[smoke-noble] arrancando…');
  console.warn(
    `[smoke-noble] platform=${process.platform} electron=${process.versions.electron} node=${process.versions.node}`
  );
  try {
    await waitForPoweredOn(POWERED_ON_TIMEOUT_MS);
    console.warn('[smoke-noble] BT adapter en estado poweredOn — OK');

    const found = await scanForPeripherals(SCAN_TIMEOUT_MS);
    console.warn(`[smoke-noble] scan completado — ${found} periférico(s) detectado(s)`);

    if (found === 0) {
      console.warn(
        '[smoke-noble] WARNING: no se detectaron periféricos. Si esperas la Aomus, verifica que esté encendida y emparejada.'
      );
    }

    console.warn('[smoke-noble] VALIDACIÓN BLE: OK');
    app.exit(0);
  } catch (err) {
    console.error('[smoke-noble] VALIDACIÓN BLE: FAIL');
    console.error(err);
    app.exit(2);
  }
}

void app.whenReady().then(main);
