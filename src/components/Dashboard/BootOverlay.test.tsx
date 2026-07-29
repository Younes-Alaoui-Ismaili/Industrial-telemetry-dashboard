import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
import { BootOverlay } from './BootOverlay';

afterEach(cleanup);

const steps = [
  { label: 'Fleet definition loaded', done: true },
  { label: 'Trend buffer primed', done: false },
];

const allSteps = steps.map((step) => ({ ...step, done: true }));

const percent = () => Number(screen.getByTestId('boot-progress').style.width.replace('%', ''));

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

  /**
   * The reason the overlay exists at all: a visitor who is not told that data is
   * coming leaves and calls the application broken.
   */
  describe('the waiting message', () => {
    it('says what is running, that it is normal, and that readings are coming', () => {
      render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
      expect(
        screen.getByText(
          'Starting the fleet simulator. This is normal; readings appear as soon as it completes.',
        ),
      ).toBeInTheDocument();
    });

    it('does not claim to be starting a simulator when the live source was chosen', () => {
      render(<BootOverlay source="mcp" steps={steps} leaving={false} animated />);
      expect(
        screen.getByText(
          'Contacting the telemetry bridge. This is normal; the result is reported either way.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/fleet simulator/i)).not.toBeInTheDocument();
    });
  });

  describe('the progress bar', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts empty rather than opening part filled', () => {
      render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
      expect(percent()).toBe(0);
    });

    it('rises past what is achieved without reaching the next milestone', () => {
      // Two of four done, so the achieved floor is 50 and the next boundary 75.
      const half = [
        { label: 'Fleet definition loaded', done: true },
        { label: 'Trend buffer primed', done: true },
        { label: 'Trend charts drawn', done: false },
        { label: 'Screen ready', done: false },
      ];
      render(<BootOverlay source="simulated" steps={half} leaving={false} animated />);

      act(() => {
        vi.advanceTimersByTime(600);
      });

      const value = percent();
      expect(value).toBeGreaterThan(50);
      expect(value).toBeLessThan(75);
    });

    /** The property that makes the bar a measurement rather than a decoration. */
    it('never crosses a milestone on time alone', () => {
      render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);

      act(() => {
        // Far past any nominal boot: only the second step landing can take the
        // bar past the halfway mark, and it never lands here.
        vi.advanceTimersByTime(60_000);
      });

      expect(percent()).toBeLessThan(100);
      expect(percent()).toBeLessThan(50 + 100 / steps.length);
    });

    it('reads exactly full once every step is done', () => {
      render(<BootOverlay source="simulated" steps={allSteps} leaving animated />);

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(percent()).toBe(100);
    });
  });

  describe('the elapsed counter', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts up in seconds while the visitor waits', () => {
      render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);
      expect(screen.getByTestId('boot-elapsed')).toHaveTextContent('0.0 s');

      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(screen.getByTestId('boot-elapsed')).toHaveTextContent('1.2 s');
    });

    /**
     * A value changing ten times a second inside a polite live region is an
     * announcement per tick. The steps carry the same information at a pace a
     * screen reader can deliver.
     */
    it('is hidden from assistive technology, along with the bar', () => {
      render(<BootOverlay source="simulated" steps={steps} leaving={false} animated />);

      const hidden = screen.getByTestId('boot-elapsed').closest('[aria-hidden="true"]');
      expect(hidden).not.toBeNull();
      expect(hidden).toContainElement(screen.getByTestId('boot-progress'));
    });
  });
});
