import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HealthIndicator } from '../../../src/renderer/components/HealthIndicator.js';

describe('HealthIndicator', () => {
  it('renderiza el label', () => {
    render(<HealthIndicator status="success" label="Sistema listo" />);
    expect(screen.getByText('Sistema listo')).toBeInTheDocument();
  });

  it('aplica clase bg-success cuando status=success', () => {
    const { container } = render(<HealthIndicator status="success" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-success');
  });

  it('aplica clase bg-warning cuando status=warning', () => {
    const { container } = render(<HealthIndicator status="warning" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-warning');
  });

  it('aplica clase bg-error cuando status=error', () => {
    const { container } = render(<HealthIndicator status="error" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-error');
  });

  it('aplica clase bg-textMuted cuando status=idle', () => {
    const { container } = render(<HealthIndicator status="idle" label="x" />);
    const dot = container.querySelector('[data-health-dot]');
    expect(dot?.className).toContain('bg-textMuted');
  });
});
