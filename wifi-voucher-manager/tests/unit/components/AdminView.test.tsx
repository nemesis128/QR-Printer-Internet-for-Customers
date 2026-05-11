import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminView } from '../../../src/renderer/pages/AdminView.js';
import { useAdminStore } from '../../../src/renderer/store/adminStore.js';

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    admin: {
      validatePin: vi.fn(async () => ({ ok: true, sessionToken: 't', pinIsDefault: false })),
      getConfig: vi.fn(async () => ({
        business: { name: 'X', footerMessage: 'Y', logoPath: null },
        schedule: { hour: 23, minute: 0, timezone: 'America/Mexico_City' },
        router: { host: '', user: '', model: '', ssidGuest: '' },
        admin: { pinIsDefault: false },
      })),
      getStats: vi.fn(async () => ({ summary: {} as never, daily: [] })),
      listLogs: vi.fn(async () => []),
      changePin: vi.fn(),
      updateConfig: vi.fn(),
      rotatePasswordNow: vi.fn(),
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

describe('AdminView gate', () => {
  it('muestra PinModal cuando no hay sessionToken', () => {
    render(<AdminView onExit={vi.fn()} />);
    expect(screen.getByText(/PIN de Administración/i)).toBeInTheDocument();
  });

  it('muestra el shell tras login exitoso (pinIsDefault=false)', async () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: false });
    render(<AdminView onExit={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    );
  });

  it('muestra ChangePinWizard cuando pinIsDefault=true', () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: true });
    render(<AdminView onExit={vi.fn()} />);
    expect(screen.getByText(/Tienes que cambiar tu PIN/i)).toBeInTheDocument();
  });

  it('cerrar sesión llama onExit', async () => {
    useAdminStore.setState({ sessionToken: 'tok', pinIsDefault: false });
    const onExit = vi.fn();
    render(<AdminView onExit={onExit} />);
    await waitFor(() => screen.getAllByText('Inicio'));
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(onExit).toHaveBeenCalled();
  });
});
