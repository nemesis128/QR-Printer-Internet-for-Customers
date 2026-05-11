import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordInput } from '../../../src/renderer/components/PasswordInput.js';

describe('PasswordInput', () => {
  it('por defecto el input es type="password"', () => {
    render(<PasswordInput value="secret" onChange={() => {}} />);
    const input = screen.getByLabelText(/contraseña/i);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('click en el toggle cambia a type="text"', () => {
    render(<PasswordInput value="secret" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /mostrar/i }));
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('type', 'text');
  });

  it('onChange dispara al teclear', () => {
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });
});
