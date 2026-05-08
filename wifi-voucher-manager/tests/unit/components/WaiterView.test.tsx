import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaiterView } from '../../../src/renderer/pages/WaiterView.js';

interface MockApi {
  waiter: {
    getCurrentSSID: () => Promise<string>;
    getSystemHealth: () => Promise<unknown>;
    printVoucher: () => Promise<unknown>;
  };
}

declare global {
  interface Window {
    api: MockApi;
  }
}

describe('WaiterView', () => {
  let originalApi: MockApi | undefined;

  beforeEach(() => {
    originalApi = window.api;
  });

  afterEach(() => {
    window.api = originalApi as MockApi;
    vi.useRealTimers();
  });

  it('estado idle: muestra botón habilitado y label "Sistema listo" cuando passwordValid=true', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('TestSSID'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: false,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: '2026-05-08T12:00:00Z',
          lastRotationStatus: 'success',
        }),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sistema listo/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).not.toBeDisabled();
  });

  it('estado error: deshabilita botón y muestra "Sin contraseña configurada" cuando passwordValid=false', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: false,
          routerReachable: false,
          passwordValid: false,
          schedulerRunning: false,
          lastRotation: null,
          lastRotationStatus: null,
        }),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin contraseña configurada/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).toBeDisabled();
  });

  it('cuando getSystemHealth lanza, muestra mensaje de error', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockRejectedValue(new Error('IPC down')),
        printVoucher: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Error: IPC down/)).toBeInTheDocument();
  });
});
