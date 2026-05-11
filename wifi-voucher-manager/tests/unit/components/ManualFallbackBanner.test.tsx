import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualFallbackBanner } from '../../../src/renderer/components/ManualFallbackBanner.js';

const pending = { id: 1, password: 'NEWPWDXYZ', ssid: 'guest', created_at: '2026-05-11T00:00:00Z' };

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    router: {
      markAppliedManually: vi.fn(async () => ({ ok: true })),
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    writable: true,
    configurable: true,
  });
});

describe('ManualFallbackBanner', () => {
  it('muestra la password en JetBrains Mono', () => {
    render(<ManualFallbackBanner pending={pending} sessionToken="tok" onConfirmed={() => {}} />);
    expect(screen.getByText('NEWPWDXYZ')).toBeInTheDocument();
  });

  it('botón "Copiar" llama clipboard.writeText', () => {
    render(<ManualFallbackBanner pending={pending} sessionToken="tok" onConfirmed={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /copiar/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('NEWPWDXYZ');
  });

  it('confirmar con password correcta llama onConfirmed', async () => {
    const onConfirmed = vi.fn();
    render(<ManualFallbackBanner pending={pending} sessionToken="tok" onConfirmed={onConfirmed} />);
    fireEvent.change(screen.getByLabelText(/re-escribe/i), { target: { value: 'NEWPWDXYZ' } });
    fireEvent.click(screen.getByRole('button', { name: /he aplicado/i }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it('confirmar con password incorrecta NO llama onConfirmed y muestra error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.router.markAppliedManually = vi.fn(async () => ({ ok: false, message: 'no coincide' }));
    const onConfirmed = vi.fn();
    render(<ManualFallbackBanner pending={pending} sessionToken="tok" onConfirmed={onConfirmed} />);
    fireEvent.change(screen.getByLabelText(/re-escribe/i), { target: { value: 'WRONG' } });
    fireEvent.click(screen.getByRole('button', { name: /he aplicado/i }));
    await waitFor(() => expect(screen.getByText(/no coincide/i)).toBeInTheDocument());
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
