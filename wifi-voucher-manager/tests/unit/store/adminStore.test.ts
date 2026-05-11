import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdminStore } from '../../../src/renderer/store/adminStore.js';

const validatePinMock = vi.fn();

beforeEach(() => {
  validatePinMock.mockReset();
  // @ts-expect-error -- inject mock window.api
  globalThis.window = {
    api: {
      admin: { validatePin: validatePinMock },
    },
  };
  useAdminStore.setState({
    sessionToken: null,
    pinIsDefault: false,
    locked: false,
    remainingMs: 0,
    error: null,
    currentPanel: 'home',
  });
});

describe('adminStore.attemptLogin', () => {
  it('guarda sessionToken al éxito', async () => {
    validatePinMock.mockResolvedValue({ ok: true, sessionToken: 'tok', pinIsDefault: false });
    await useAdminStore.getState().attemptLogin('1234');
    expect(useAdminStore.getState().sessionToken).toBe('tok');
  });

  it('reporta locked cuando el handler responde LOCKED', async () => {
    validatePinMock.mockResolvedValue({ ok: false, code: 'LOCKED', remainingMs: 60_000 });
    await useAdminStore.getState().attemptLogin('1234');
    expect(useAdminStore.getState().locked).toBe(true);
  });

  it('reporta error cuando PIN incorrecto', async () => {
    validatePinMock.mockResolvedValue({ ok: false, code: 'INVALID_PIN' });
    await useAdminStore.getState().attemptLogin('9999');
    expect(useAdminStore.getState().error).toBeTruthy();
    expect(useAdminStore.getState().sessionToken).toBeNull();
  });
});
