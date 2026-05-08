import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Banner } from '../../../src/renderer/components/Banner.js';

describe('Banner', () => {
  it('renderiza el mensaje', () => {
    render(<Banner variant="error" message="Algo falló" />);
    expect(screen.getByText('Algo falló')).toBeInTheDocument();
  });

  it('variant=error aplica border y fondo correctos', () => {
    const { container } = render(<Banner variant="error" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-error|border-error/);
  });

  it('variant=warning usa color warning', () => {
    const { container } = render(<Banner variant="warning" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-warning|border-warning/);
  });

  it('variant=success usa color success', () => {
    const { container } = render(<Banner variant="success" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-success|border-success/);
  });

  it('variant=info usa color info', () => {
    const { container } = render(<Banner variant="info" message="x" />);
    const root = container.firstElementChild!;
    expect(root.className).toMatch(/border-l-info|border-info/);
  });

  it('renderiza children con acción opcional', () => {
    render(
      <Banner variant="error" message="Algo falló">
        <button>Reintentar</button>
      </Banner>
    );
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });
});
