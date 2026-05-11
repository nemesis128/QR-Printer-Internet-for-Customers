import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PinInput } from '../../../src/renderer/components/PinInput.js';

describe('PinInput', () => {
  it('renderiza 4 inputs', () => {
    render(<PinInput value="" onChange={() => {}} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('llama onChange al teclear un dígito', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('ignora caracteres no numéricos', () => {
    const onChange = vi.fn();
    render(<PinInput value="" onChange={onChange} />);
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'a' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aplica clase shake cuando shake=true', () => {
    const { container } = render(<PinInput value="" onChange={() => {}} shake />);
    expect(container.firstChild).toHaveClass('animate-shake');
  });
});
