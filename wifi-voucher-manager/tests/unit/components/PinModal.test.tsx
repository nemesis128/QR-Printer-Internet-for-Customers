import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PinModal } from '../../../src/renderer/components/PinModal.js';

describe('PinModal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('llama onSubmit cuando el PIN tiene 4 dígitos', () => {
    const onSubmit = vi.fn();
    render(<PinModal open onClose={() => {}} onSubmit={onSubmit} error={null} locked={false} remainingMs={0} />);
    const inputs = screen.getAllByRole('textbox');
    ['1', '2', '3', '4'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('muestra el contador de lockout cuando locked=true', () => {
    render(
      <PinModal open onClose={() => {}} onSubmit={() => {}} error={null} locked remainingMs={120_000} />
    );
    expect(screen.getByText(/02:00/)).toBeInTheDocument();
  });

  it('muestra mensaje de error cuando se proporciona', () => {
    render(
      <PinModal open onClose={() => {}} onSubmit={() => {}} error="PIN incorrecto." locked={false} remainingMs={0} />
    );
    expect(screen.getByText('PIN incorrecto.')).toBeInTheDocument();
  });
});
