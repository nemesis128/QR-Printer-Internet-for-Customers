import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '../../../src/renderer/components/Spinner.js';

describe('Spinner', () => {
  it('renderiza 3 dots', () => {
    const { container } = render(<Spinner />);
    const dots = container.querySelectorAll('[data-spinner-dot]');
    expect(dots.length).toBe(3);
  });

  it('respeta aria-label personalizable', () => {
    render(<Spinner label="Cargando" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Cargando');
  });

  it('aria-label default es "Cargando"', () => {
    render(<Spinner />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-label')).toBe('Cargando');
  });
});
