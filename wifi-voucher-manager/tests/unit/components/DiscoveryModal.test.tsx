import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscoveryModal } from '../../../src/renderer/components/DiscoveryModal.js';

const discoverMock = vi.fn();
const testConnectionMock = vi.fn();

beforeEach(() => {
  discoverMock.mockReset();
  testConnectionMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    printer: { discover: discoverMock, testConnection: testConnectionMock },
  };
});

describe('DiscoveryModal', () => {
  it('lista impresoras descubiertas con badge de tipo', async () => {
    discoverMock.mockResolvedValue([
      { identifier: 'p1', label: 'Aomus My A1', connection: 'bluetooth-ble', likelyEscPosCompatible: true },
      { identifier: 'p2', label: 'EPSON', connection: 'usb', likelyEscPosCompatible: true },
    ]);
    render(<DiscoveryModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Aomus My A1')).toBeInTheDocument());
    expect(screen.getByText('BLE')).toBeInTheDocument();
    expect(screen.getByText('USB')).toBeInTheDocument();
  });

  it('botón "Usar esta impresora" deshabilitado hasta test exitoso', async () => {
    discoverMock.mockResolvedValue([
      { identifier: 'p1', label: 'Aomus', connection: 'bluetooth-ble', likelyEscPosCompatible: true },
    ]);
    testConnectionMock.mockResolvedValue({ success: true, online: true, latencyMs: 100 });
    render(<DiscoveryModal open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByText('Aomus'));
    fireEvent.click(screen.getByText('Aomus'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /usar esta impresora/i })).not.toBeDisabled()
    );
  });
});
