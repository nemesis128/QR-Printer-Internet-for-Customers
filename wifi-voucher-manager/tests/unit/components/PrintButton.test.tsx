import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PrintButton } from '../../../src/renderer/components/PrintButton.js';

describe('PrintButton', () => {
  it('renderiza children como label', () => {
    render(<PrintButton onClick={async () => {}}>Imprimir</PrintButton>);
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('dispara onClick al hacer click', async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {});
    render(<PrintButton onClick={fn}>X</PrintButton>);
    await user.click(screen.getByRole('button'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('está deshabilitado y NO dispara cuando disabled', async () => {
    const user = userEvent.setup();
    const fn = vi.fn(async () => {});
    render(
      <PrintButton onClick={fn} disabled>
        X
      </PrintButton>
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fn).not.toHaveBeenCalled();
  });

  it('muestra Spinner mientras la promesa no resuelve', async () => {
    const user = userEvent.setup();
    let resolveExternal: () => void = () => {};
    const promise = new Promise<void>((res) => {
      resolveExternal = res;
    });
    render(<PrintButton onClick={() => promise}>X</PrintButton>);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('status')).toBeInTheDocument();
    resolveExternal();
  });
});
