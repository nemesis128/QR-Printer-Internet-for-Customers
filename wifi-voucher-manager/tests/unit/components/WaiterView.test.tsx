import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaiterView } from '../../../src/renderer/pages/WaiterView.js';
import { usePrintStore } from '../../../src/renderer/store/printStore.js';

interface MockApi {
  waiter: {
    getCurrentSSID: () => Promise<string>;
    getSystemHealth: () => Promise<unknown>;
    printVoucher: () => Promise<unknown>;
    listPendingManualApply: () => Promise<unknown[]>;
  };
  printer: {
    getJobStatus: () => Promise<unknown>;
    retryJob: () => Promise<void>;
  };
}

declare global {
  interface Window {
    api: MockApi;
  }
}

describe('WaiterView (Fase 2)', () => {
  let originalApi: MockApi | undefined;

  beforeEach(() => {
    originalApi = window.api;
    usePrintStore.getState().clear();
  });

  afterEach(() => {
    window.api = originalApi as MockApi;
    vi.useRealTimers();
  });

  it('passwordValid + printerOnline → "Sistema listo" + botón habilitado', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('TestSSID'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: true,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: '2026-05-08T12:00:00Z',
          lastRotationStatus: 'success',
        }),
        printVoucher: vi.fn(),
        listPendingManualApply: vi.fn(async () => []),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sistema listo/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).not.toBeDisabled();
  });

  it('printerOnline=false → warning "Sin impresora activa" + botón disabled', async () => {
    window.api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: false,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: '2026-05-08T12:00:00Z',
          lastRotationStatus: 'success',
        }),
        printVoucher: vi.fn(),
        listPendingManualApply: vi.fn(async () => []),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin impresora activa/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Imprimir QR de WiFi/ });
    expect(btn).toBeDisabled();
  });

  it('passwordValid=false → error', async () => {
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
        listPendingManualApply: vi.fn(async () => []),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };

    render(<WaiterView />);
    expect(await screen.findByText(/Sin contraseña configurada/)).toBeInTheDocument();
  });

  it('renderiza el banner cuando hay pending', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('—'),
        getSystemHealth: vi.fn().mockResolvedValue({
          printerOnline: true,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: false,
          lastRotation: null,
          lastRotationStatus: null,
        }),
        printVoucher: vi.fn(),
        listPendingManualApply: vi.fn(async () => [
          { id: 1, password: 'NEWPWD', ssid: 'guest', created_at: '2026-05-11T00:00:00Z' },
        ]),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };
    render(<WaiterView />);
    await waitFor(() => expect(screen.getByText('NEWPWD')).toBeInTheDocument());
  });

  it('muestra dot ámbar cuando lastHealthCheckFailed=true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api = {
      waiter: {
        getCurrentSSID: vi.fn().mockResolvedValue('TestSSID'),
        getSystemHealth: vi.fn(async () => ({
          printerOnline: true,
          routerReachable: false,
          passwordValid: true,
          schedulerRunning: true,
          lastRotation: '2026-05-11T23:00:00Z',
          lastRotationStatus: 'success',
          lastHealthCheckFailed: true,
        })),
        printVoucher: vi.fn(),
        listPendingManualApply: vi.fn(async () => []),
      },
      printer: {
        getJobStatus: vi.fn(),
        retryJob: vi.fn(),
      },
    };
    render(<WaiterView />);
    await waitFor(() => expect(screen.getByLabelText(/self-check fallido/i)).toBeInTheDocument());
  });
});
