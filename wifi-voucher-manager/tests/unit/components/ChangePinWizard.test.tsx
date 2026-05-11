import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChangePinWizard } from '../../../src/renderer/components/ChangePinWizard.js';

describe('ChangePinWizard', () => {
  it('paso 1 muestra mensaje de bienvenida y avanza al click', () => {
    render(<ChangePinWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/cambiar tu PIN/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    expect(screen.getByText(/elige tu nuevo PIN/i)).toBeInTheDocument();
  });

  it('rechaza PIN 0000 con mensaje', () => {
    render(<ChangePinWizard onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    const inputs = screen.getAllByRole('textbox');
    ['0', '0', '0', '0'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    expect(screen.getByText(/no puedes usar 0000/i)).toBeInTheDocument();
  });

  it('llama onComplete con el PIN cuando confirmación coincide', () => {
    const onComplete = vi.fn();
    render(<ChangePinWizard onComplete={onComplete} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    let inputs = screen.getAllByRole('textbox');
    ['1', '3', '5', '7'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    inputs = screen.getAllByRole('textbox');
    ['1', '3', '5', '7'].forEach((d, i) => fireEvent.change(inputs[i]!, { target: { value: d } }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onComplete).toHaveBeenCalledWith('1357');
  });
});
