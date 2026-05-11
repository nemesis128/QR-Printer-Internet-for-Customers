import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRouterStore } from '../../../src/renderer/store/routerStore.js';

const listPendingMock = vi.fn();
const testConnectionMock = vi.fn();

beforeEach(() => {
  listPendingMock.mockReset();
  testConnectionMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    router: {
      listPendingManualApply: listPendingMock,
      testConnection: testConnectionMock,
    },
  };
  useRouterStore.setState({ pending: [], lastTestResult: null, error: null });
});

describe('routerStore', () => {
  it('reloadPending guarda los pending del backend', async () => {
    listPendingMock.mockResolvedValue([{ id: 1, password: 'X', ssid: 'guest', created_at: '2026-05-11T00:00:00Z' }]);
    await useRouterStore.getState().reloadPending('tok');
    expect(useRouterStore.getState().pending).toHaveLength(1);
  });

  it('runTestConnection guarda lastTestResult', async () => {
    testConnectionMock.mockResolvedValue({ ok: true, steps: [], ssidGuest: 'guest' });
    await useRouterStore.getState().runTestConnection('tok');
    expect(useRouterStore.getState().lastTestResult?.ok).toBe(true);
  });
});
