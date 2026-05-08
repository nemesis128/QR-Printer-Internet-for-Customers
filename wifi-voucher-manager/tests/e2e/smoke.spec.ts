import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

test.describe('Smoke — Electron app launches', () => {
  test.skip(
    process.env.WIFI_VOUCHER_SKIP_E2E === '1' || !process.env.WIFI_VOUCHER_TEST_BUILD_PATH,
    'E2E skipped: set WIFI_VOUCHER_TEST_BUILD_PATH to .exe path on Win11 to enable.'
  );

  test('main window loads with Hello World', async () => {
    const buildPath = process.env.WIFI_VOUCHER_TEST_BUILD_PATH!;
    const app = await electron.launch({
      args: [path.resolve(buildPath)],
      timeout: 15_000,
    });

    const page = await app.firstWindow();
    await expect(page.locator('h1')).toContainText('Hello World');

    await app.close();
  });
});
