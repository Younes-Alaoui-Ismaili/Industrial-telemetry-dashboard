import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { BootOverlay } from './BootOverlay';

afterEach(cleanup);

const steps = [
  { label: 'Fleet definition loaded', done: true },
  { label: 'Trend buffer primed', done: false },
];

describe('BootOverlay', () => {
  it('announces itself as a status region', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
    const overlay = screen.getByTestId('boot-overlay');

    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
  });

  it('names the source the screen is starting on', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
    expect(screen.getByText('Data source: Simulated')).toBeInTheDocument();
  });

  it('names the live source when that is what was selected', () => {
    render(<BootOverlay source="mcp" steps={steps} leaving={false} animated />);
    expect(screen.getByText('Data source: MCP live')).toBeInTheDocument();
  });

  it('states each step and whether it is done', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
    const rows = screen.getAllByRole('listitem');

    expect(within(rows[0]).getByText('Fleet definition loaded')).toBeInTheDocument();
    expect(within(rows[0]).getByText('done')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Trend buffer primed')).toBeInTheDocument();
    expect(within(rows[1]).getByText('waiting')).toBeInTheDocument();
  });

  /**
   * The overlay and the dashboard are on screen together for a moment. Any label
   * it duplicates exactly becomes ambiguous, to a screen reader first and to the
   * suite second, so the strings the dashboard queries by name are off limits.
   */
  it('does not duplicate a label the dashboard already owns', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);

    for (const owned of ['Source', 'Assets online', 'Availability', '8/8']) {
      expect(screen.queryByText(owned)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/device \d/i)).not.toBeInTheDocument();
  });

  it('carries the dashboard name without claiming to be its heading', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);

    expect(screen.getByText('Industrial Telemetry Dashboard')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Industrial Telemetry Dashboard' }),
    ).not.toBeInTheDocument();
  });

  /** Nothing to tab into means nothing to trap. */
  it('holds no focusable element', () => {
    const { container } = render(
      <BootOverlay source="simulated" steps={steps} leaving={false} animated />,
    );
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    expect(focusable).toHaveLength(0);
  });

  it('fades out and stops taking clicks while leaving', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving animated />);
    const overlay = screen.getByTestId('boot-overlay');

    expect(overlay.className).toContain('opacity-0');
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('transition-opacity');
  });

  it('drops the transition entirely when motion is not wanted', () => {
    render(<BootOverlay source="simulated" steps={steps} leaving animated={false} />);
    const overlay = screen.getByTestId('boot-overlay');

    expect(overlay.className).not.toContain('transition');
    expect(overlay.className).toContain('opacity-0');
  });
});
